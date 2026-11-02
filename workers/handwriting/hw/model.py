"""DiffusionPen word generator (inference only).

Model code is vendored unchanged from koninik/DiffusionPen (MIT) in vendor/diffusionpen.
Weights: konnik/DiffusionPen on Hugging Face (MIT; trained on IAM, a non-commercial research dataset),
VAE + DDIM scheduler config from stable-diffusion-v1-5 (CreativeML OpenRAIL-M), CANINE-c tokenizer/config.
"""
from __future__ import annotations

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import torch
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor" / "diffusionpen"
MODELS = Path(os.environ.get("HW_MODEL_DIR", ROOT / "models"))
CHARSET = set(json.loads((VENDOR / "letter2index.json").read_text()))
STYLE_SIZE = (256, 64)  # width, height of DiffusionPen word images


def style_tensor(img: Image.Image) -> torch.Tensor:
    """Word crop -> 3x64x256 tensor in [-1, 1], white background, centred (DiffusionPen preprocessing)."""
    img = img.convert("RGB")
    w, h = img.size
    scale = min(64 / h, 256 / w) if w * 64 / h > 256 else 64 / h
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", STYLE_SIZE, "white")
    canvas.paste(img, ((256 - img.width) // 2, (64 - img.height) // 2))
    arr = np.asarray(canvas, dtype=np.float32) / 127.5 - 1.0
    return torch.from_numpy(arr).permute(2, 0, 1)


def unsupported_chars(text: str) -> set[str]:
    return {c for c in text if c not in CHARSET and c not in "\n\f\r\t"}


class Generator:
    """Loads DiffusionPen once per GPU (Kaggle gives two T4s) and generates word images in a writer's style.

    Sampling: DPM-Solver++ (multistep) with 20 steps instead of DDIM with 50. Measured on 96 words with the same seeds:
    2.2x faster, mean pixel difference 1.7/255, read-back accuracy equal (39 vs 37 words exact). fp16 autocast:
    0.8/255 difference, no accuracy change; it matters on T4s, whose fp32 throughput is low."""

    name = "diffusionpen-iam-ema"

    def __init__(self, device: str | None = None, steps: int = 20):
        sys.path.insert(0, str(VENDOR))
        from diffusers import AutoencoderKL, DDIMScheduler, DPMSolverMultistepScheduler
        from transformers import CanineConfig, CanineModel, CanineTokenizer

        from feature_extractor import ImageEncoder
        from unet import UNetModel

        gpus = [f"cuda:{i}" for i in range(torch.cuda.device_count())]
        self.devices = [device] if device else gpus or ["cpu"]
        self.device = self.devices[0] if len(self.devices) == 1 else f"{len(self.devices)}x {torch.cuda.get_device_name(0)}"
        self.steps = steps
        canine = MODELS / "canine-c"
        self.tokenizer = CanineTokenizer.from_pretrained(canine)
        state = torch.load(MODELS / "diffusionpen" / "ema_ckpt.pt", map_location="cpu", weights_only=True)
        # Saved from DataParallel(UNet(text_encoder=DataParallel(CANINE))): strip both wrapper prefixes.
        state = {k.removeprefix("module.").replace("text_encoder.module.", "text_encoder."): v for k, v in state.items()}
        style_sd = torch.load(MODELS / "diffusionpen" / "iam_style_diffusionpen.pth", map_location="cpu", weights_only=True)
        ddim = DDIMScheduler.from_pretrained(MODELS / "sd15", subfolder="scheduler")
        self._scheduler = lambda: DPMSolverMultistepScheduler.from_config(ddim.config, algorithm_type="dpmsolver++")

        self.replicas = []
        for dev in self.devices:
            unet = UNetModel(
                image_size=(64, 256), in_channels=4, model_channels=320, out_channels=4, num_res_blocks=1,
                attention_resolutions=(1, 1), channel_mult=(1, 1), num_heads=4, num_classes=339, context_dim=320,
                vocab_size=len(CHARSET), text_encoder=CanineModel(CanineConfig.from_pretrained(canine)),
                args=SimpleNamespace(interpolation=False, mix_rate=None),
            )
            missing, _ = unet.load_state_dict(state, strict=False)
            if missing:
                raise RuntimeError(f"DiffusionPen checkpoint is missing {len(missing)} weights, e.g. {missing[:3]}")
            style = ImageEncoder(model_name="mobilenetv2_100", num_classes=0, pretrained=False, trainable=False)
            own = style.state_dict()
            own.update({k: v for k, v in style_sd.items() if k in own and own[k].shape == v.shape})
            style.load_state_dict(own)
            dtype = torch.float16 if dev.startswith("cuda") else torch.float32
            vae = AutoencoderKL.from_pretrained(MODELS / "sd15", subfolder="vae", variant="fp16", torch_dtype=dtype)
            self.replicas.append(SimpleNamespace(dev=dev, unet=unet.to(dev).eval(), style=style.to(dev).eval(), vae=vae.to(dev).eval()))

    @torch.no_grad()
    def _batch(self, r: SimpleNamespace, words: list[str], seeds: list[int], refs: torch.Tensor) -> list[Image.Image]:
        n = len(words)
        with torch.autocast("cuda", dtype=torch.float16, enabled=r.dev.startswith("cuda")):
            style_imgs_t = refs.to(r.dev).repeat(n, 1, 1, 1)  # n*5 x 3 x 64 x 256
            feats = r.style(style_imgs_t)
            text = self.tokenizer(words, padding="max_length", truncation=True, return_tensors="pt", max_length=40).to(r.dev)
            x = torch.stack([torch.randn((4, 8, 32), generator=torch.Generator().manual_seed(s)) for s in seeds]).to(r.dev)
            sched = self._scheduler()  # multistep solvers keep state: one per batch
            sched.set_timesteps(self.steps)
            for t in sched.timesteps:
                ts = torch.full((n,), int(t), device=r.dev, dtype=torch.long)
                eps = r.unet(x, ts, text, None, original_images=style_imgs_t, mix_rate=None, style_extractor=feats)
                x = sched.step(eps.float(), t, x).prev_sample
            img = r.vae.decode((x / 0.18215).to(r.vae.dtype)).sample
        img = ((img.float() / 2 + 0.5).clamp(0, 1) * 255).round().byte().permute(0, 2, 3, 1).cpu().numpy()
        return [Image.fromarray(a) for a in img]

    def generate(self, words: list[str], style_imgs: list[Image.Image], seeds: list[int], progress=None, batch: int = int(os.environ.get("HW_BATCH", 32))) -> list[Image.Image]:
        """One RGB 256x64 image per word, each from its own seed (same image on any GPU). `style_imgs` are ~5 word
        crops of the writer. Batches are spread over all GPUs; `progress(done)` is called after each batch."""
        if not style_imgs:
            raise ValueError("At least one reference word crop is required.")
        refs = torch.stack([style_tensor(style_imgs[i % len(style_imgs)]) for i in range(5)])
        starts = list(range(0, len(words), batch))
        out: list[list[Image.Image]] = [[] for _ in starts]
        lock, done = threading.Lock(), [0]

        def work(slot: int):
            r = self.replicas[slot]
            for b in starts[slot :: len(self.replicas)]:
                imgs = self._batch(r, words[b : b + batch], seeds[b : b + batch], refs)
                out[b // batch] = imgs
                with lock:
                    done[0] += len(imgs)
                    if progress:
                        progress(done[0])

        with ThreadPoolExecutor(len(self.replicas)) as pool:
            list(pool.map(work, range(len(self.replicas))))  # list() re-raises worker errors
        return [im for chunk in out for im in chunk]
