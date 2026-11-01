"""Word checker: TrOCR-small-handwritten reads generated word images so the best of N candidates can be kept.
Licence: MIT per microsoft/unilm (the HF card has no licence tag); fine-tuned on IAM (non-commercial research data)."""
from __future__ import annotations

import torch
from PIL import Image

from .model import MODELS


def distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def word_error(target: str, read: str) -> float:
    """Normalised edit distance to the best-matching prefix of the reading. TrOCR is a line model and often
    appends hallucinated punctuation or repeats a single word ("temperature . temperature ."); those tails are ignored."""
    t, r = target.replace(" ", ""), read.replace(" ", "")
    best = min(distance(t, r[:k]) for k in range(len(r) + 1))
    return best / max(1, len(t))


class Reader:
    name = "trocr-small-handwritten"

    def __init__(self, device: str | None = None):
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        path = MODELS / "trocr-small"
        self.processor = TrOCRProcessor.from_pretrained(path)
        self.model = VisionEncoderDecoderModel.from_pretrained(path).to(self.device).eval()

    @torch.no_grad()
    def read(self, images: list[Image.Image], batch: int = 32) -> list[str]:
        out: list[str] = []
        for i in range(0, len(images), batch):
            px = self.processor(images=[im.convert("RGB") for im in images[i : i + batch]], return_tensors="pt").pixel_values.to(self.device)
            ids = self.model.generate(px, max_new_tokens=24)
            out += [s.strip() for s in self.processor.batch_decode(ids, skip_special_tokens=True)]
        return out
