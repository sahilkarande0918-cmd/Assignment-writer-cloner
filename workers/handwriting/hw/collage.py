"""Collage engine (ADR-037): writes with the writer's OWN ink. Words and letters are cut from the reference pages,
verified by reading them back, and reused; nothing is synthesised by a model. Same generator interface as
hw.model.Generator, so layout, tables, the word check and rewrites are unchanged.

Bank: a word crop is kept only when the TrOCR reading is ONE word of the reference transcript (Groq vision, sent by
the studio) and its width per character is plausible; without a transcript the reading itself is the label (weaker).
Words are cut into letters at the faintest ink column near ideal cuts; a per-character medoid filter drops wrong cuts.
Characters the writer never wrote are not in `charset`, so the pipeline draws them from the handwriting font."""
from __future__ import annotations

import random
import re
from collections import defaultdict

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .style import ink_mask

DESC = set("gjpqyf,;")  # letters whose cut dips below the line (this writer's f too)
NARROW, WIDE = set("iljtfrI1.,:;'!|()"), set("mwMW")
MARKS = ".,:;-()/"  # drawn as clean pen marks: cut-out punctuation is a speck or a fragment of a letter
PUNCT = ".,:;-()/?'"
TRUSTED = 3  # look-alike samples a lowercase letter needs before it is used
CAP_FROM_LOWER = {c.upper(): c for c in "ocsuvwxz"}  # capitals that are bigger lowercase shapes
XH = 40  # x-height of the generated word images, px


def words_on_page(rgb: np.ndarray) -> tuple[np.ndarray, float, list[tuple[int, int, int, int]]]:
    """(ink mask, x-height, word boxes in reading order)."""
    ink = ink_mask(rgb)
    _, _, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    hs = stats[1:, cv2.CC_STAT_HEIGHT]
    xh = float(np.median(hs[hs > 6])) if (hs > 6).any() else 20.0
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(xh * 0.75)), max(1, int(xh * 0.3))))
    _, _, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(ink, k), 8)
    blobs = sorted((tuple(int(v) for v in s[:4]) for s in st[1:] if s[3] >= xh * 0.6 and s[2] >= 4 and s[4] > 15), key=lambda b: b[1] + b[3] / 2)
    lines: list[list] = []
    for b in blobs:  # cluster into text lines by vertical centre
        c = b[1] + b[3] / 2
        if lines and abs(c - np.median([x[1] + x[3] / 2 for x in lines[-1]])) <= xh * 1.3:
            lines[-1].append(b)
        else:
            lines.append([b])
    return ink, xh, [b for line in lines for b in sorted(line)]


def crop(rgb: np.ndarray, ink: np.ndarray, box, pad: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """(grey strokes on white, ink mask) for one word box; paper and ruling removed."""
    x, y, w, h = box
    H, W = ink.shape
    x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    gray = cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    m = cv2.dilate(ink[y0:y1, x0:x1], np.ones((2, 2), np.uint8)) > 0
    out = np.full_like(gray, 255)
    out[m] = gray[m]
    return out, ink[y0:y1, x0:x1] > 0


def cuts(mask: np.ndarray, text: str) -> list[tuple[int, int]] | None:
    """One column range per character: ideal cuts from typical letter widths, each moved to the faintest ink column
    nearby (a gap if the letters are separate, the thinnest join if they touch)."""
    cols = mask.sum(0).astype(float)
    xs = np.nonzero(cols)[0]
    if not len(xs):
        return None
    L, R = int(xs[0]), int(xs[-1]) + 1
    wts = [0.45 if c in NARROW else 1.5 if c in WIDE else 1.0 for c in text]
    unit = (R - L) / sum(wts)
    out, prev, acc = [], L, 0.0
    for wt in wts[:-1]:
        acc += wt
        ideal = L + acc * unit
        lo, hi = int(max(prev + 2, ideal - 0.4 * unit)), int(min(R - 2, ideal + 0.4 * unit))
        if hi <= lo:
            return None
        cut = lo + int(np.argmin(cols[lo:hi] + 0.02 * np.abs(np.arange(lo, hi) - ideal)))
        out.append((prev, cut))
        prev = cut
    return out + [(prev, R)]


def signature(img: np.ndarray) -> np.ndarray:
    """Letter shape as a normalised 24x24 ink map (aspect kept), for comparing samples of one character."""
    h, w = img.shape
    k = 22 / max(h, w)
    small = np.asarray(Image.fromarray(img).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS), np.float32)
    out = np.zeros((24, 24), np.float32)
    y, x = (24 - small.shape[0]) // 2, (24 - small.shape[1]) // 2
    out[y : y + small.shape[0], x : x + small.shape[1]] = 1 - small / 255
    out -= out.mean()
    return (out / (np.linalg.norm(out) + 1e-6)).ravel()


def norm(w: str) -> str:
    return "".join(c for c in w if c.isalnum()).casefold()


def build_bank(pages: list[Image.Image], reader, transcript: str | None = None) -> dict:
    """{"words": {word: [item]}, "letters": {char: [item]}}; item = {img, desc (baseline - bottom), xh, typ}."""
    vocab = {norm(w): w.strip(PUNCT + '"') for w in re.findall(r"\S+", transcript or "") if norm(w)}
    cands = []
    for page in pages:
        rgb = np.asarray(page.convert("RGB"))
        ink, xh, boxes = words_on_page(rgb)
        crops = [crop(rgb, ink, b) for b in boxes]
        reads = reader.read([Image.fromarray(g).convert("RGB") for g, _ in crops])
        for (g, m), r in zip(crops, reads):
            r = r.strip(PUNCT + '"')
            # The WHOLE reading must be one word ("of the" in one crop is rejected).
            label = vocab.get(norm(r)) if vocab else (r if r and re.fullmatch(r"[A-Za-z0-9]+", r) else None)
            if label and 1 < len(label) <= 14 and 0.35 <= g.shape[1] / (xh * len(label)) <= 1.7:
                cands.append((label, g, m, xh))

    words, letters = defaultdict(list), defaultdict(list)
    for w, g, m, xh in cands:
        spans = cuts(m, w)
        if not spans:
            continue
        rows = np.nonzero(m.any(1))[0]
        bottoms = []
        for a, b in spans:
            ys = np.nonzero(m[:, a:b].any(1))[0]
            bottoms.append(ys[-1] + 1 if len(ys) else rows[-1] + 1)
        base = float(np.median([bt for bt, c in zip(bottoms, w) if c not in DESC and c.isalnum()] or bottoms))
        for (a, b), c, bt in zip(spans, w, bottoms):
            ys = np.nonzero(m[:, a:b].any(1))[0]
            if len(ys) and c.isalnum():
                img = np.where(m[ys[0] : ys[-1] + 1, a:b], g[ys[0] : ys[-1] + 1, a:b], 255).astype(np.uint8)
                letters[c].append({"img": img, "desc": base - (ys[-1] + 1), "xh": xh, "typ": 0.5})
        words[w].append({"img": g, "desc": base - g.shape[0], "xh": xh})

    for c, items in letters.items():
        if len(items) < 3:
            continue
        sig = np.stack([signature(it["img"]) for it in items])
        sim = (sig @ sig.T)[int((sig @ sig.T).sum(1).argmax())]  # similarity to the medoid
        for it, s in zip(items, sim):
            it["typ"] = float(s)
        letters[c] = [it for it in items if it["typ"] >= 0.5]
    return {"words": dict(words), "letters": dict(letters)}


def clean_edges(gray: np.ndarray) -> np.ndarray:
    """Drop small ink fragments at the edges of a real-word cut-out (bits of the neighbouring word)."""
    ink = (gray < 170).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, 8)
    total = st[1:, cv2.CC_STAT_AREA].sum() if n > 1 else 0
    out = gray.copy()
    for i in range(1, n):
        x, y, w, h, area = st[i]
        edge = x <= 1 or x + w >= gray.shape[1] - 1 or x > 0.88 * gray.shape[1]
        low_speck = area < 0.03 * total and y > 0.6 * gray.shape[0]  # i-dots sit on top and stay
        if (edge and area < 0.12 * total) or low_speck:
            out[lab == i] = 255
    return out


class CollageGenerator:
    name = "collage-own-ink"
    style_count = 5
    writes_digits = True  # the writer's own digits are used; the word check catches a wrong one
    reference_use = "the writer's own word and letter shapes are cut from the reference and reused; its text is read only to label them"

    def __init__(self, reader):
        if reader is None:
            raise ValueError("The own-ink engine needs the word checker (TrOCR) to label the reference.")
        self.reader, self.device = reader, reader.device
        self.words: dict = {}
        self.letters: dict = {}
        self.charset: set[str] = set()

    def prepare(self, pages: list[Image.Image], transcript: str | None = None) -> None:
        bank = build_bank(pages, self.reader, transcript)
        self.words, self.letters = bank["words"], bank["letters"]
        own = {c for c, v in self.letters.items() if len(v) >= (1 if c.isupper() or (c.isdigit() and c != "8") else TRUSTED)}
        if sum(c.islower() for c in own) < 8:
            raise ValueError("Too little clear handwriting in the reference for the own-ink engine; upload more pages (2-4 full pages work best) or use the AI model.")
        alt = {c.upper() for c in own if c.islower()} | {c.lower() for c in own if c.isupper()} | {u for u, lo in CAP_FROM_LOWER.items() if lo in own}
        self.charset = own | alt | set(MARKS)

    def _scaled(self, item: dict, rng: random.Random, extra: float = 1.0) -> tuple[np.ndarray, float]:
        k = XH / item["xh"] * extra * rng.uniform(0.96, 1.04)
        img = Image.fromarray(item["img"])
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        return np.asarray(img), item["desc"] * k

    def letter(self, c: str, rng: random.Random) -> tuple[np.ndarray, float]:
        """(grey, height of the bottom above the baseline) for one character."""
        if c in MARKS:
            return self.mark(c, rng)
        own = self.letters.get(c, ())
        if len(own) >= (1 if c.isupper() or (c.isdigit() and c != "8") else TRUSTED):
            best = sorted(own, key=lambda it: -it["typ"])[:3]  # the writer's most typical samples
            img, _ = self._scaled(rng.choice(best), rng)
            if c in "gjqyf":  # descenders: the writer's typical drop for that letter
                return img, float(np.median([it["desc"] for it in own])) * img.shape[0] / max(1, best[0]["img"].shape[0])
            return img, 0.0  # everything else sits exactly on the line
        lo = CAP_FROM_LOWER.get(c)
        if lo and len(self.letters.get(lo, ())) >= TRUSTED:
            return self._scaled(rng.choice(self.letters[lo]), rng, 1.45)
        for alt in (c.lower(), c.upper()):
            if alt != c and len(self.letters.get(alt, ())) >= (1 if alt.isupper() else TRUSTED):
                return self._scaled(rng.choice(self.letters[alt]), rng, 1.0 if alt.islower() else 0.8)
        raise ValueError(f"{c!r} is not in the writer's bank")  # charset excludes it, so the pipeline never asks

    def mark(self, c: str, rng: random.Random) -> tuple[np.ndarray, float]:
        """A small hand-made pen mark for punctuation, in the writer's stroke weight."""
        x = XH
        r = max(2, round(x * 0.13))
        if c in "()":
            h = round(x * 1.9)
            im = Image.new("L", (round(x * 0.55) + 4, h + 4), 255)
            box = (2, 2, im.width * 2 - 4, h + 2) if c == "(" else (-im.width + 4, 2, im.width - 2, h + 2)
            ImageDraw.Draw(im).arc(box, 110 if c == "(" else -70, 250 if c == "(" else 70, fill=40, width=r)
            return np.asarray(im), -x * 0.35
        if c == "/":
            h = round(x * 1.8)
            im = Image.new("L", (round(x * 0.8), h), 255)
            ImageDraw.Draw(im).line((2, h - 2, im.width - 2, 2), fill=40, width=r)
            return np.asarray(im), 0.0
        if c == "-":
            im = Image.new("L", (round(x * 0.7), r * 2 + 2), 255)
            ImageDraw.Draw(im).line((1, r + rng.choice((0, 1)), im.width - 2, r), fill=40, width=r)
            return np.asarray(im), x * 0.45
        h = round(x * (1.1 if c in ":;" else 0.4)) + r * 2
        tail = round(x * 0.35) if c in ",;" else 0  # a comma's tail drops below the line
        im = Image.new("L", (r * 2 + 4, h + tail), 255)
        d = ImageDraw.Draw(im)
        d.ellipse((1, h - r * 2 - 1, r * 2 + 1, h - 1), fill=40)
        if c in ":;":
            d.ellipse((1, 1, r * 2 + 1, r * 2 + 1), fill=40)
        if tail:
            d.line((r + 2, h - r, 1, h + tail - 1), fill=40, width=max(2, r - 1))
        return np.asarray(im), -float(tail)

    def word(self, w: str, rng: random.Random) -> Image.Image:
        """The writer's real word if banked, else one build from their letters; grey on white, baseline-aligned."""
        core, tail = w, ""
        while core and core[-1] in PUNCT and core not in self.words:
            core, tail = core[:-1], core[-1] + tail
        pieces = []
        if core in self.words:
            img, dsc = self._scaled(rng.choice(self.words[core]), rng)
            pieces.append((img if any(ch.isdigit() for ch in core) else clean_edges(img), dsc))  # edge cleaning cut a PRN's last digit
        else:
            pieces += [self.letter(c, rng) for c in core]
        pieces += [self.letter(c, rng) for c in tail]
        gap = XH * 0.16
        top = min(-p.shape[0] - d for p, d in pieces)  # highest point relative to the baseline (negative)
        bottom = max(-d for _, d in pieces)
        canvas = np.full((int(bottom - top) + 3, int(sum(p.shape[1] for p, _ in pieces) + gap * (len(pieces) - 1)) + 2), 255, np.uint8)
        x = 0.0
        for p, d in pieces:
            y = max(0, int(round(-d - p.shape[0] - top)) + rng.choice((0, 0, 1)))
            region = canvas[y : y + p.shape[0], int(x) : int(x) + p.shape[1]]
            region[:] = np.minimum(region, p[: region.shape[0], : region.shape[1]])
            x += p.shape[1] + gap * rng.uniform(0.7, 1.3)
        return Image.fromarray(canvas).convert("RGB")

    def generate(self, words: list[str], style_imgs, seeds: list[int], progress=None) -> list[Image.Image]:
        out = []
        for i, (w, s) in enumerate(zip(words, seeds)):
            out.append(self.word(w, random.Random(s)))
            if progress and (i % 32 == 31 or i == len(words) - 1):
                progress(i + 1)
        return out
