"""Reference style extraction: lettering only. Word crops are cut from the reference page for the style
encoder and the ink colour is sampled; the words' meaning is never read or reused."""
from __future__ import annotations

import cv2
import numpy as np
from PIL import Image


def line_masks(gray: np.ndarray) -> np.ndarray:
    """Mask of long horizontal/vertical strokes (ruling, margins, table borders)."""
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12)
    h, w = gray.shape
    horiz = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, w // 12), 1)))
    vert = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(30, h // 12))))
    return cv2.dilate(horiz | vert, np.ones((3, 3), np.uint8))


def ink_mask(rgb: np.ndarray) -> np.ndarray:
    """Writing pixels: darker than the local paper, excluding long ruling/margin strokes."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 35, 15)
    ink[line_masks(gray) > 0] = 0
    # Drop specks (noise, paper texture).
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 6
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def extract_style(img: Image.Image, count: int = 5) -> tuple[list[Image.Image], tuple[int, int, int], list[tuple[int, int, int, int]]]:
    """Returns (word crops on white, median ink RGB, crop boxes x,y,w,h)."""
    rgb = np.asarray(img.convert("RGB"))
    ink = ink_mask(rgb)
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    heights = stats[1:, cv2.CC_STAT_HEIGHT]
    if len(heights) < 3:
        raise ValueError("No handwriting was found on the reference page.")
    xh = float(np.median(heights[heights > 3])) if (heights > 3).any() else 10.0
    # Merge letters into words: close gaps narrower than ~0.6 x-height.
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(xh * 0.6)), max(1, int(xh * 0.25))))
    words = cv2.dilate(ink, k)
    n, _, stats, _ = cv2.connectedComponentsWithStats(words, 8)
    H, W = ink.shape
    boxes = []
    for x, y, w, h, area in stats[1:]:
        if h < xh * 0.8 or h > xh * 4 or w < h * 1.2 or w > h * 8:
            continue
        if x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1:
            continue
        density = ink[y : y + h, x : x + w].mean() / 255
        if 0.06 < density < 0.6:
            boxes.append((int(x), int(y), int(w), int(h), density))
    if not boxes:
        raise ValueError("Could not isolate clean words in the reference; use a sharper, flatter photo or scan.")
    med = float(np.median([b[4] for b in boxes]))
    boxes.sort(key=lambda b: (abs(b[4] - med), -b[2]))
    chosen = boxes[:count]
    crops = []
    for x, y, w, h, _ in chosen:
        pad = max(2, h // 8)
        x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
        region = rgb[y0:y1, x0:x1]
        m = ink[y0:y1, x0:x1] > 0
        clean = np.full_like(region, 255)
        clean[m] = region[m]  # keep the writer's strokes, drop paper and ruling
        crops.append(Image.fromarray(clean))
    pix = rgb[ink > 0]
    color = tuple(int(c) for c in np.median(pix, axis=0)) if len(pix) else (30, 40, 90)
    return crops, color, [b[:4] for b in chosen]
