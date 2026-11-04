"""Write text with the writer's REAL words and letters (bank.pkl from bank.py) on ruled notebook paper.
Import from other scripts: render_pages(text, bank, ...) -> (pages, report)."""
import pickle
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else ".")
from hw.compose import PAGE_BREAK, Page, layout, tokenize  # noqa: E402
from hw.paper import synthetic  # noqa: E402

CAP_FROM_LOWER = {c.upper(): c for c in "ocsuvwxz"}  # capitals that are just bigger lowercase shapes in print
PUNCT = ".,:;-()/?'"
MARKS = ".,:;-()/"
TRUSTED = 3  # a character needs this many look-alike samples to be used; otherwise a fallback draws it


def load(path):
    return pickle.load(open(path, "rb"))


def clean_edges(gray):
    """Drop small ink fragments touching the left/right edge of a real-word cut-out (bits of the neighbouring word)."""
    import cv2

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


class Writer:
    def __init__(self, bank, xh, ink, seed=1, fallback=None, check=None, tries=10):
        self.words, self.letters, self.xh, self.ink = bank["words"], bank["letters"], xh, ink
        self.rng = random.Random(seed)
        self.fallback = fallback  # callable(char) -> (gray img, depth) for letters the writer never wrote
        self.check, self.tries = check, tries  # check(list[alpha]) -> readings; built words are rebuilt until one reads right
        self.report = {"real_words": 0, "built_words": 0, "built_exact": 0, "fallback_letters": [], "doubtful": []}
        self.used = {}

    def _pick(self, variants, key):
        n = self.used.get(key, 0)
        self.used[key] = n + 1
        return variants[(n + self.rng.randrange(len(variants))) % len(variants)]

    def _scaled(self, item, extra=1.0):
        k = self.xh / item["xh"] * extra * self.rng.uniform(0.96, 1.04)
        img = Image.fromarray(item["img"])
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
        return np.asarray(img), item["desc"] * k  # desc: baseline minus bottom (positive = bottom above baseline)

    def letter(self, c):
        """(gray, desc) for one character: punctuation as pen marks, letters from the writer's most typical samples."""
        if c in MARKS:
            return self.mark(c)
        if len(self.letters.get(c, ())) >= (1 if c.isupper() or c.isdigit() and c != "8" else TRUSTED):  # capitals: word-initial cuts
            best = sorted(self.letters[c], key=lambda it: -it.get("typ", 0.5))[:3]
            img, desc = self._scaled(self._pick(best, "l" + c))
            if c in "gjqyf":  # descenders: the writer's typical drop for that letter
                k = img.shape[0] / max(1, best[0]["img"].shape[0])
                return img, float(np.median([it["desc"] for it in self.letters[c]])) * k
            return img, 0.0  # everything else sits exactly on the line

        lo = CAP_FROM_LOWER.get(c)
        if lo and len(self.letters.get(lo, ())) >= TRUSTED:
            return self._scaled(self._pick(self.letters[lo], "l" + lo), extra=1.45)
        for alt in (c.lower(), c.upper()):
            if alt != c and len(self.letters.get(alt, ())) >= TRUSTED:
                return self._scaled(self._pick(self.letters[alt], "l" + alt), extra=1.0 if alt.islower() else 0.8)
        self.report["fallback_letters"].append(c)
        return self.fallback(c)

    def mark(self, c):
        """A small hand-made pen mark for punctuation (exact, in the writer's ink weight)."""
        x = self.xh
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
            ImageDraw.Draw(im).line((1, r + self.rng.choice((0, 1)), im.width - 2, r), fill=40, width=r)
            return np.asarray(im), x * 0.45
        h = round(x * (1.1 if c in ":;" else 0.4)) + r * 2
        im = Image.new("L", (r * 2 + 4, h), 255)
        d = ImageDraw.Draw(im)
        d.ellipse((1, h - r * 2 - 1, r * 2 + 1, h - 1), fill=40)  # bottom dot
        if c in ":;":
            d.ellipse((1, 1, r * 2 + 1, r * 2 + 1), fill=40)
        if c in ",;":
            d.line((r + 1, h - r, r - 2, h + r), fill=40, width=max(1, r - 1))
        return np.asarray(im), 0.0 if c not in ",;" else -r

    def word(self, w):
        """(alpha, depth below baseline): the writer's real word if it exists, else the best of several builds from
        the writer's letters, judged by reading each build back."""
        out = self._word(w)
        if out[2] or not self.check:
            return out[:2]
        builds = [out] + [self._word(w) for _ in range(self.tries - 1)]
        reads = self.check([b[0] for b in builds])
        from hw.recognize import word_error
        errs = [word_error(w, r) for r in reads]
        best = int(np.argmin(errs))
        if errs[best] == 0:
            self.report["built_exact"] += 1
        else:
            self.report["doubtful"].append((w, reads[best]))
        return builds[best][:2]

    def _word(self, w):
        core, tail = w, ""
        while core and core[-1] in PUNCT and core not in self.words:
            core, tail = core[:-1], core[-1] + tail
        pieces, real = [], False
        if core in self.words:
            real = True
            img, dsc = self._scaled(self._pick(self.words[core], "w" + core))
            pieces.append((img if any(ch.isdigit() for ch in core) else clean_edges(img), dsc))
            self.report["real_words"] += 1
        elif core:
            self.report["built_words"] += 1
            pieces += [self.letter(c) for c in core]
        pieces += [self.letter(c) for c in tail]
        gap = self.xh * 0.16
        top = min(-(p.shape[0]) + (-d) for p, d in pieces)  # y of the highest point relative to baseline (negative)
        bottom = max(-d for p, d in pieces)
        width = int(sum(p.shape[1] for p, _ in pieces) + gap * (len(pieces) - 1)) + 2
        canvas = np.full((int(bottom - top) + 3, width), 255, np.uint8)
        x = 0.0
        for p, d in pieces:
            y = int(round(-d - p.shape[0] - top)) + self.rng.choice((0, 0, 1))
            region = canvas[y : y + p.shape[0], int(x) : int(x) + p.shape[1]]
            canvas[y : y + region.shape[0], int(x) : int(x) + region.shape[1]] = np.minimum(region, p[: region.shape[0], : region.shape[1]])
            x += p.shape[1] + gap * self.rng.uniform(0.7, 1.3)
        a = canvas.astype(np.float32) / 255
        a = np.clip(a / max(float(np.percentile(a, 95)), 0.5), 0, 1)
        alpha = (np.clip((0.88 - a) / 0.55, 0, 1) * 255).astype(np.uint8)
        return Image.fromarray(alpha), int(round(bottom)), real


def render_pages(text, bank, ink, size_mm=(210, 297), spacing_mm=7.0, margin_left=25, margin_top=28, xh_ratio=0.30, seed=1, fallback=None, check=None):
    paper = synthetic(size_mm[0], size_mm[1], 200, margin_top, margin_left, spacing_mm, "ruled")
    gaps = sorted(b - a for a, b in zip(paper.baselines, paper.baselines[1:]))
    spacing = gaps[len(gaps) // 2]
    xh = spacing * xh_ratio
    wr = Writer(bank, xh, ink, seed, fallback, check)
    paragraphs = tokenize(text, True)
    sized = {}
    for p in paragraphs:
        for occ, w in ([] if p == PAGE_BREAK else p):
            sized[occ] = wr.word(w)
    pages = layout(paragraphs, {o: a.width for o, (a, _) in sized.items()}, paper, xh * 0.85)
    out = []
    color = Image.new("RGB", paper.image.size, ink)
    for page in pages:
        canvas = paper.image.copy()
        for li, line in enumerate(page.lines):
            base = paper.baselines[li]
            for occ, w in line:
                alpha, depth = sized[occ]
                x = round(page.x[occ])
                top = base + depth - alpha.height - 2 + wr.rng.choice((-1, 0, 0, 1))
                canvas.paste(color.crop((0, 0, alpha.width, alpha.height)), (x, top), alpha)
                page.placed.append((occ, w, (x, top, alpha.width, alpha.height)))
        out.append(canvas)
    return out, pages, wr.report, paper, wr
