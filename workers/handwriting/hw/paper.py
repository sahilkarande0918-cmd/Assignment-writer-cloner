"""Paper templates: reconstruct a clean reusable sheet from a reference page (writing removed, ruling kept),
or draw a labelled synthetic approximation when no reference is given or extraction fails."""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image

from .style import ink_mask, line_masks


@dataclass
class Paper:
    image: Image.Image
    baselines: list[int]  # y of each writable rule, top to bottom
    margin_x: int  # left edge for writing
    right_x: int
    source: str  # "reference" | "synthetic"
    notes: list[str] = field(default_factory=list)


def _rule_rows(gray: np.ndarray) -> list[int]:
    """Rows carrying long horizontal rules (peaks of the horizontal-line mask)."""
    h, w = gray.shape
    lines = line_masks(gray)
    horiz = cv2.morphologyEx(lines, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (w // 3, 1)))
    rows = np.where(horiz.sum(axis=1) / 255 > w * 0.4)[0]
    peaks: list[int] = []
    for r in rows:
        if peaks and r - peaks[-1] <= 3:
            continue
        peaks.append(int(r))
    return peaks


def _margin(gray: np.ndarray) -> int | None:
    h, w = gray.shape
    lines = line_masks(gray)
    vert = cv2.morphologyEx(lines, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 2)))
    cols = np.where(vert.sum(axis=0) / 255 > h * 0.5)[0]
    cols = cols[cols < w * 0.35]  # a left margin, not a border on the right
    return int(cols.max()) if len(cols) else None


def reconstruct(img: Image.Image) -> Paper:
    """Remove all writing from a used sheet. Inpainting only touches ink pixels; rules are restamped."""
    rgb = np.asarray(img.convert("RGB")).copy()
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    ink = cv2.dilate(ink_mask(rgb), np.ones((5, 5), np.uint8))
    rules = line_masks(gray) > 0
    clean = cv2.inpaint(rgb, ink, 5, cv2.INPAINT_TELEA)
    clean[rules & (ink == 0)] = rgb[rules & (ink == 0)]  # rule pixels that were never under ink stay original
    baselines = _rule_rows(gray)
    notes: list[str] = []
    h, w = gray.shape
    if len(baselines) >= 5:
        spacing = int(np.median(np.diff(baselines)))
        baselines = [b for b in baselines if b > spacing * 1.5]  # skip header band
    else:
        spacing = h // 32
        baselines = list(range(int(h * 0.12), int(h * 0.95), spacing))
        notes.append("No ruled lines detected; using evenly spaced invisible baselines.")
    margin = _margin(gray)
    if margin is None:
        notes.append("No margin line detected; using a 10% left margin.")
    return Paper(Image.fromarray(clean), baselines, (margin or int(w * 0.1)) + max(6, spacing // 3), int(w * 0.95), "reference", notes)


def synthetic(width_mm: float, height_mm: float, dpi: int, top_mm: float, left_mm: float, spacing_mm: float, style: str) -> Paper:
    """Generic notebook paper — an approximation, always reported as such."""
    px = lambda mm: int(round(mm / 25.4 * dpi))  # noqa: E731
    w, h = px(width_mm), px(height_mm)
    arr = np.full((h, w, 3), (252, 250, 244), np.uint8)
    baselines = list(range(px(top_mm), h - px(15), px(spacing_mm)))
    if style in ("ruled", "grid"):
        for y in baselines:
            arr[y : y + max(1, dpi // 150)] = (185, 205, 224)
    if style == "grid":
        for x in range(0, w, px(spacing_mm)):
            arr[:, x : x + max(1, dpi // 150)] = (205, 219, 230)
    margin = px(left_mm)
    if style == "ruled":
        arr[:, margin - px(4) : margin - px(4) + max(1, dpi // 100)] = (217, 140, 140)
    return Paper(Image.fromarray(arr), baselines, margin, w - px(12), "synthetic", ["Synthetic paper: an approximation, not a match of any real sheet."])


def residual_ink(original: Image.Image, cleaned: Image.Image) -> float:
    """Fraction of the original's writing pixels still dark after cleaning (0 = all writing removed)."""
    ink = ink_mask(np.asarray(original.convert("RGB"))) > 0
    if not ink.any():
        return 0.0
    still = ink_mask(np.asarray(cleaned.convert("RGB"))) > 0
    return float((ink & still).sum() / ink.sum())
