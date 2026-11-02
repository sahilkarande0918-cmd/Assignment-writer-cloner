"""VATr++ word generator (default engine). Code + weights: blowing-up-groundhogs/vatrpp (MIT; weights trained on IAM,
a non-commercial research dataset), downloaded into models/vatrpp by download_models.py.

Measured against DiffusionPen on the owner's handwriting (ADR-034): 0.1 s vs 33.7 s for 5 lines, CER 1.8 % vs 31 %.
Same interface as hw.model.Generator, so layout, tables, the word check and rewrites are unchanged."""
from __future__ import annotations

import os
import random
import sys

import numpy as np
import torch
from PIL import Image

from .model import MODELS

H, CHUNK, EXAMPLES = 32, 192, 15  # VATr++ input: 15 style images, 32 px tall, 192 px wide
VARIANTS = 8  # distinct style-sample orders used to vary candidates


def style_tensor(crops: list[Image.Image]) -> torch.Tensor:
    """Writer's word crops -> 15 x 32 x 192 in [-1, 1] (ink dark): crops laid on one 32-px line, cut into chunks."""
    words = [c.convert("L").resize((max(1, round(c.width * H / c.height)), H), Image.LANCZOS) for c in crops]
    line = np.full((H, sum(w.width for w in words) + 16 * len(words)), 255, np.uint8)
    x = 0
    for w in words:
        line[:, x : x + w.width] = np.asarray(w)
        x += w.width + 16
    chunks = []
    for s in range(0, line.shape[1], CHUNK):
        c = np.full((H, CHUNK), 255, np.uint8)
        part = line[:, s : s + CHUNK]
        c[:, : part.shape[1]] = part
        if (c < 128).any():
            chunks.append(torch.from_numpy(c.astype(np.float32) / 127.5 - 1.0))
    while len(chunks) < EXAMPLES:
        chunks += chunks
    return torch.stack(chunks[:EXAMPLES])


class VatrGenerator:
    name = "vatrpp-iam"
    style_count = 15  # it was trained with 15 style images per writer

    def __init__(self, device: str | None = None):
        sys.path.insert(0, str(MODELS))  # models/vatrpp is the upstream package
        from safetensors.torch import load_file
        from vatrpp.configuration_vatrpp import VATrPPConfig
        from vatrpp.modeling_vatrpp import VATrPP

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        cfg = VATrPPConfig.from_pretrained(str(MODELS / "vatrpp"))
        # No noise: it cost accuracy (37 vs 48 of 54 words exact). Candidates differ by style-sample order instead.
        cfg.device, cfg.add_noise = self.device, False
        cwd = os.getcwd()
        os.chdir(MODELS / "vatrpp")  # upstream code opens files/ relative to the working directory
        try:
            # transformers 5 cannot from_pretrained() this 4.46-era model: build it and load the weights directly.
            model = VATrPP(cfg)
            missing, _ = model.load_state_dict(load_file(str(MODELS / "vatrpp" / "model.safetensors")), strict=False)
        finally:
            os.chdir(cwd)
        if missing:
            raise RuntimeError(f"VATr++ weights are missing {len(missing)} tensors, e.g. {missing[:3]}")
        self.model = model.to(self.device).eval()
        self.charset = set(cfg.alphabet)

    @torch.no_grad()
    def generate(self, words: list[str], style_imgs: list[Image.Image], seeds: list[int], progress=None) -> list[Image.Image]:
        """One grey-scale-on-white RGB image per word (32 px tall), each from its own seed."""
        if not style_imgs:
            raise ValueError("At least one reference word crop is required.")
        vatr = self.model.model
        variants: dict[int, torch.Tensor] = {}  # seed % VARIANTS -> style encoding of the crops in a seeded order
        out: list[Image.Image] = []
        for i, (word, seed) in enumerate(zip(words, seeds)):
            v = seed % VARIANTS
            if v not in variants:
                order = list(style_imgs) if v == 0 else random.Random(v).sample(list(style_imgs), len(style_imgs))
                variants[v] = vatr.netG.compute_style(style_tensor(order).unsqueeze(0).to(self.device))
            enc, lens, _ = vatr.netconverter.encode([word])
            h = vatr.netG.generate(variants[v], enc.to(self.device).unsqueeze(0)[:, 0, :])
            img = ((h[0, 0, :, : lens[0] * vatr.args.resolution] + 1) / 2).clamp(0, 1)
            out.append(Image.fromarray((img.cpu().numpy() * 255).astype(np.uint8)).convert("RGB"))
            if progress and (i % 32 == 31 or i == len(words) - 1):
                progress(i + 1)
        return out
