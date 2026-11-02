"""DiffusionPen word generator (inference only).

Model code is vendored unchanged from koninik/DiffusionPen (MIT) in vendor/diffusionpen.
Weights: konnik/DiffusionPen on Hugging Face (MIT; trained on IAM, a non-commercial research dataset),
VAE + DDIM scheduler config from stable-diffusion-v1-5 (CreativeML OpenRAIL-M), CANINE-c tokenizer/config.
"""
from __future__ import annotations

import json
import os
import sys
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
    """Loads DiffusionPen once and generates word images in a writer's style."""

    name = "diffusionpen-iam-ema"

    def __init__(self, device: str | None = None, steps: int = 50):
        sys.path.insert(0, str(VENDOR))
        from diffusers import AutoencoderKL, DDIMScheduler
        from transformers import CanineConfig, CanineModel, CanineTokenizer

        from feature_extractor import ImageEncoder
        from unet import UNetModel

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.steps = steps
        canine = MODELS / "canine-c"
        self.tokenizer = CanineTokenizer.from_pretrained(canine)
        text_encoder = CanineModel(CanineConfig.from_pretrained(canine))
        unet = UNetModel(
            image_size=(64, 256), in_channels=4, model_channels=320, out_channels=4, num_res_blocks=1,
            attention_resolutions=(1, 1), channel_mult=(1, 1), num_heads=4, num_classes=339, context_dim=320,
            vocab_size=len(CHARSET), text_encoder=text_encoder, args=SimpleNamespace(interpolation=False, mix_rate=None),
        )
        state = torch.load(MODELS / "diffusionpen" / "ema_ckpt.pt", map_location="cpu", weights_only=True)
        # Saved from DataParallel(UNet(text_encoder=DataParallel(CANINE))): strip both wrapper prefixes.
        state = {k.removeprefix("module.").replace("text_encoder.module.", "text_encoder."): v for k, v in state.items()}
        missing, unexpected = unet.load_state_dict(state, strict=False)
        if missing:
            raise RuntimeError(f"DiffusionPen checkpoint is missing {len(missing)} weights, e.g. {missing[:3]}")
        self.unet = unet.to(self.device).eval()

        style = ImageEncoder(model_name="mobilenetv2_100", num_classes=0, pretrained=False, trainable=False)
        sd = torch.load(MODELS / "diffusionpen" / "iam_style_diffusionpen.pth", map_location="cpu", weights_only=True)
        own = style.state_dict()
        own.update({k: v for k, v in sd.items() if k in own and own[k].shape == v.shape})
        style.load_state_dict(own)
        self.style = style.to(self.device).eval()

        dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.vae = AutoencoderKL.from_pretrained(MODELS / "sd15", subfolder="vae", variant="fp16", torch_dtype=dtype).to(self.device).eval()
        self.scheduler = DDIMScheduler.from_pretrained(MODELS / "sd15", subfolder="scheduler")

    @torch.no_grad()
    def generate(self, words: list[str], style_imgs: list[Image.Image], seeds: list[int], progress=None, batch: int = int(os.environ.get("HW_BATCH", 16))) -> list[Image.Image]:
        """One RGB 256x64 image per word, each from its own seed. `style_imgs` are ~5 word crops of the writer.
        `progress(done)` is called after each batch."""
        if not style_imgs:
            raise ValueError("At least one reference word crop is required.")
        refs = [style_imgs[i % len(style_imgs)] for i in range(5)]
        style = torch.stack([style_tensor(r) for r in refs]).to(self.device)
        out: list[Image.Image] = []
        for i in range(0, len(words), batch):
            chunk = words[i : i + batch]
            n = len(chunk)
            style_imgs_t = style.repeat(n, 1, 1, 1)  # n*5 x 3 x 64 x 256
            feats = self.style(style_imgs_t)
            text = self.tokenizer(chunk, padding="max_length", truncation=True, return_tensors="pt", max_length=40).to(self.device)
            x = torch.stack([torch.randn((4, 8, 32), generator=torch.Generator().manual_seed(s)) for s in seeds[i : i + batch]]).to(self.device)
            self.scheduler.set_timesteps(self.steps)
            for t in self.scheduler.timesteps:
                ts = torch.full((n,), int(t), device=self.device, dtype=torch.long)
                eps = self.unet(x, ts, text, None, original_images=style_imgs_t, mix_rate=None, style_extractor=feats)
                x = self.scheduler.step(eps, t, x).prev_sample
            img = self.vae.decode((x / 0.18215).to(self.vae.dtype)).sample
            img = ((img.float() / 2 + 0.5).clamp(0, 1) * 255).round().byte().permute(0, 2, 3, 1).cpu().numpy()
            out += [Image.fromarray(a) for a in img]
            if progress:
                progress(len(out))
        return out
