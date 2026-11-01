"""Page composition: each generated word occurrence is scaled to the paper's line height, placed on its
baseline, wrapped inside the margins, broken across pages, and composited once over the paper template."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from .paper import Paper

ASC = set("bdfhklt0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!?'\"()/&#")
DESC = set("gjpqy,;")

Token = tuple[int, str]  # (occurrence id, word)
PAGE_BREAK: list[Token] = [(-1, "\f")]


@dataclass
class Placed:
    occ: int
    word: str
    box: tuple[int, int, int, int]  # x, y, w, h in page pixels


@dataclass
class Page:
    lines: list[list[Token]] = field(default_factory=list)
    placed: list[Placed] = field(default_factory=list)


def ink_box(word_img: Image.Image, thresh: int = 170) -> tuple[int, int, int, int] | None:
    a = np.asarray(word_img.convert("L"))
    ys, xs = np.where(a < thresh)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def height_units(word: str) -> tuple[float, float]:
    """(total ink height, descender depth) in x-height units, from the letters present.
    DiffusionPen normalises every word to the same image height, so true size must be restored."""
    asc = 0.75 if any(c in ASC for c in word) else 0.0
    desc = 0.6 if any(c in DESC for c in word) else 0.0
    return 1.0 + asc + desc, desc


def tokenize(text: str, keep_breaks: bool) -> list[list[Token]]:
    """Text -> paragraphs of (occurrence id, word). Form feed = page break; empty list = blank line."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    out: list[list[Token]] = []
    occ = 0
    for page_i, chunk in enumerate(text.split("\f")):
        if page_i:
            out.append(PAGE_BREAK)
        blocks = chunk.split("\n") if keep_breaks else [" ".join(p.split()) for p in chunk.split("\n\n")]
        for b in blocks:
            para = []
            for w in b.split():
                para.append((occ, w))
                occ += 1
            out.append(para)
    return out


def layout(paragraphs: list[list[Token]], widths: dict[int, float], paper: Paper, space: float) -> list[Page]:
    """Greedy line fill over the paper's baselines; overflow starts a new page."""
    pages = [Page()]
    used = 0
    cur: list[Token] = []
    x = paper.margin_x
    avail = paper.right_x - paper.margin_x

    def flush():
        nonlocal cur, used, x
        if used >= len(paper.baselines):
            pages.append(Page())
            used = 0
        pages[-1].lines.append(cur)
        cur, x = [], paper.margin_x
        used += 1

    for para in paragraphs:
        if para == PAGE_BREAK:
            pages.append(Page())
            used = 0
            continue
        if not para:
            flush()  # blank line
            continue
        for occ, w in para:
            ww = widths[occ]
            if ww > avail:
                raise ValueError(f'The word "{w[:30]}" is wider than the writable line; reduce the writing size.')
            if cur and x + space + ww > paper.right_x:
                flush()
            x += (space if cur else 0) + ww
            cur.append((occ, w))
        flush()
    return [p for p in pages if any(p.lines)] or [Page()]


def tint(word_img: Image.Image, pen: tuple[int, int, int], target_h: int) -> tuple[Image.Image, Image.Image]:
    """Crop to ink, scale to `target_h`, return (pen-coloured RGB, alpha). Ink stays a transparent layer."""
    box = ink_box(word_img)
    if box is None:
        raise ValueError("A generated word came out blank.")
    crop = word_img.convert("L").crop(box)
    k = target_h / crop.height
    crop = crop.resize((max(1, round(crop.width * k)), max(1, target_h)), Image.LANCZOS)
    a = np.asarray(crop, dtype=np.float32) / 255
    alpha = np.clip((0.9 - a) / 0.6, 0, 1)  # dark -> opaque ink; paper-white -> transparent
    return Image.new("RGB", crop.size, pen), Image.fromarray((alpha * 255).astype(np.uint8))


def compose(paper: Paper, images: dict[int, Image.Image], paragraphs: list[list[Token]], pen: tuple[int, int, int], xheight: float) -> tuple[list[Image.Image], list[Page]]:
    """Render pages. `images` maps occurrence id -> generated word image. Returns page images + layout."""
    space = xheight * 0.7
    words = {occ: w for para in paragraphs for occ, w in para}
    # DiffusionPen stretches every word to the full canvas height, so true size comes from the letters present
    # (x-height, ascenders, descenders), not from the image. A per-page scale clamp was tried and made
    # ascender-free words like "a" too big, so each word is sized by its own letter shape.
    sized = {}
    for occ, img in images.items():
        units, desc = height_units(words[occ])
        h = max(1, round(xheight * units))
        rgb, alpha = tint(img, pen, h)
        sized[occ] = (rgb, alpha, round(xheight * desc))
    pages = layout(paragraphs, {o: s[0].width for o, s in sized.items()}, paper, space)
    out = []
    for page in pages:
        canvas = paper.image.copy()
        for li, line in enumerate(page.lines):
            base = paper.baselines[li]
            x = paper.margin_x
            for occ, w in line:
                rgb, alpha, desc = sized[occ]
                top = base - rgb.height + desc - max(1, round(xheight * 0.08))  # sit just above the rule
                canvas.paste(rgb, (round(x), top), alpha)
                page.placed.append(Placed(occ, w, (round(x), top, rgb.width, rgb.height)))
                x += rgb.width + space
        out.append(canvas)
    return out, pages


def check(pages: list[Page], size: tuple[int, int]) -> list[str]:
    """Programmatic QA: words clipped by the page edge, and overlapping word boxes."""
    W, H = size
    issues = []
    for pi, p in enumerate(pages):
        for q in p.placed:
            x, y, w, h = q.box
            if x < 0 or y < 0 or x + w > W or y + h > H:
                issues.append(f"page {pi + 1}: '{q.word}' is clipped by the page edge")
        for i, a in enumerate(p.placed):
            for b in p.placed[i + 1 :]:
                ox = min(a.box[0] + a.box[2], b.box[0] + b.box[2]) - max(a.box[0], b.box[0])
                oy = min(a.box[1] + a.box[3], b.box[1] + b.box[3]) - max(a.box[1], b.box[1])
                if ox > 2 and oy > max(2, min(a.box[3], b.box[3]) * 0.25):
                    issues.append(f"page {pi + 1}: '{a.word}' overlaps '{b.word}'")
    return issues
