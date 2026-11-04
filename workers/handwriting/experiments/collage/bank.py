"""Build a bank of the writer's REAL words and letters from scanned pages + their line transcripts.
Usage: python bank.py <worker dir> <lines.json> <out pickle> <page png>...
Word crops are labelled from the transcript and kept only if TrOCR reads them back exactly (case-insensitive)."""
import json
import pickle
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, sys.argv[1])
from hw.recognize import Reader, word_error  # noqa: E402
from hw.style import ink_mask  # noqa: E402

LINES = json.load(open(sys.argv[2], encoding="utf8"))
OUT = Path(sys.argv[3])
PAGES = sys.argv[4:]
DESC = set("gjpqyf,;")  # this writer's f dips below the line


def words_on_page(rgb):
    ink = ink_mask(rgb)
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    hs = stats[1:, cv2.CC_STAT_HEIGHT]
    xh = float(np.median(hs[hs > 6])) if (hs > 6).any() else 20.0
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(xh * 0.75)), max(1, int(xh * 0.3))))
    n, _, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(ink, k), 8)
    blobs = [tuple(int(v) for v in s[:4]) for s in st[1:] if s[3] >= xh * 0.6 and s[2] >= 4 and s[4] > 15]
    blobs.sort(key=lambda b: b[1] + b[3] / 2)
    lines, cur = [], []
    for b in blobs:  # cluster into text lines by vertical centre
        c = b[1] + b[3] / 2
        if cur and abs(c - np.median([x[1] + x[3] / 2 for x in cur])) > xh * 1.3:
            lines.append(sorted(cur, key=lambda x: x[0]))
            cur = []
        cur.append(b)
    if cur:
        lines.append(sorted(cur, key=lambda x: x[0]))
    return ink, xh, lines


def crop(rgb, ink, box, pad=3):
    x, y, w, h = box
    H, W = ink.shape
    x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    gray = cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    m = cv2.dilate(ink[y0:y1, x0:x1], np.ones((2, 2), np.uint8)) > 0
    out = np.full_like(gray, 255)
    out[m] = gray[m]  # the writer's own strokes (anti-aliasing kept), paper and ruling removed
    return out, ink[y0:y1, x0:x1] > 0


def components(mask):
    """Letter candidates: 8-connected parts, with dots/marks merged into the part they sit over."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    parts = [[int(s[0]), int(s[1]), int(s[0] + s[2]), int(s[1] + s[3]), [i]] for i, s in enumerate(st) if i and s[4] >= 4]
    parts.sort(key=lambda p: p[0])
    merged = []
    for p in parts:
        if merged:
            q = merged[-1]
            ov = min(p[2], q[2]) - max(p[0], q[0])
            if ov > 0.5 * min(p[2] - p[0], q[2] - q[0]):
                q[0], q[1], q[2], q[3] = min(p[0], q[0]), min(p[1], q[1]), max(p[2], q[2]), max(p[3], q[3])
                q[4] += p[4]
                continue
        merged.append(p)
    return merged, lab


reader = Reader()
norm = lambda w: "".join(c for c in w if c.isalnum()).casefold()  # noqa: E731
cands = []  # (exact label from the transcript, gray crop, mask, xh)
for page_path in PAGES:
    key = next(k for k in LINES if Path(k).stem.replace("v", "") == Path(page_path).stem.split("-")[1].replace("p", ""))
    vocab = {}
    for line in LINES[key]:
        for w in line.split():
            if norm(w):
                vocab.setdefault(norm(w), w)
    rgb = np.asarray(Image.open(page_path).convert("RGB"))
    ink, xh, lines = words_on_page(rgb)
    blobs = [b for line in lines for b in line]
    crops = [crop(rgb, ink, b) for b in blobs]
    reads = reader.read([Image.fromarray(g).convert("RGB") for g, _ in crops])
    ok = 0
    for (g, m), r in zip(crops, reads):
        label = vocab.get(norm(r))  # the WHOLE reading must be one transcript word (a crop of "of the" is rejected)
        per_char = g.shape[1] / (xh * max(1, len(label or "x")))
        if label and 0.35 <= per_char <= 1.7:
            cands.append((label, g, m, xh))
            ok += 1
    print(f"{Path(page_path).name}: {len(blobs)} word blobs, {ok} confirmed by reader + transcript; xh {xh:.1f}")

NARROW, WIDE = set("iljtfrI1.,:;'!|()"), set("mwMW")


def cuts(mask, text):
    """Split a word image into one column range per character: ideal cuts from typical letter widths, each moved to
    the faintest ink column nearby (a gap if the letters are separate, the thinnest join if they touch)."""
    cols = mask.sum(0).astype(float)
    xs = np.nonzero(cols)[0]
    if len(xs) == 0:
        return None
    L, R = int(xs[0]), int(xs[-1]) + 1
    wts = [0.45 if c in NARROW else 1.5 if c in WIDE else 1.0 for c in text]
    unit = (R - L) / sum(wts)
    out, prev, acc = [], L, 0.0
    for i, wt in enumerate(wts[:-1]):
        acc += wt
        ideal = L + acc * unit
        lo, hi = int(max(prev + 2, ideal - 0.4 * unit)), int(min(R - 2, ideal + 0.4 * unit))
        if hi <= lo:
            return None
        cut = lo + int(np.argmin(cols[lo:hi] + 0.02 * np.abs(np.arange(lo, hi) - ideal)))
        out.append((prev, cut))
        prev = cut
    out.append((prev, R))
    return out


words, letters = defaultdict(list), defaultdict(list)
for w, g, m, xh in cands:
    spans = cuts(m, w) if 1 < len(w) <= 14 else None
    if spans:
        rows = np.nonzero(m.any(1))[0]
        bottoms = []
        for (a, b_), c in zip(spans, w):
            ys = np.nonzero(m[:, a:b_].any(1))[0]
            bottoms.append(ys[-1] + 1 if len(ys) else rows[-1] + 1)
        base = float(np.median([bt for bt, c in zip(bottoms, w) if c not in DESC and c.isalnum()] or bottoms))
        for (a, b_), c, bt in zip(spans, w, bottoms):
            ys = np.nonzero(m[:, a:b_].any(1))[0]
            if not len(ys) or not (c.isalnum() or c in ".,:;-()/?'"):
                continue
            img = np.where(m[ys[0] : ys[-1] + 1, a:b_], g[ys[0] : ys[-1] + 1, a:b_], 255).astype(np.uint8)
            letters[c].append({"img": img, "desc": base - (ys[-1] + 1), "xh": xh})
        words[w].append({"img": g, "desc": base - g.shape[0], "xh": xh})
        continue
for w, g, m, xh in []:
    parts, lab = components(m)
    bottoms = [p[3] for p in parts]
    alnum = [c for c in w if c.isalnum()]
    if len(parts) == len(w):
        chars = list(w)
    elif len(parts) == len(alnum):
        chars = alnum
    else:
        chars = None
    if chars:
        base = float(np.median([p[3] for p, c in zip(parts, chars) if c not in DESC] or bottoms))
        for p, c in zip(parts, chars):
            if c.isalnum() or c in ".,:;-()/?'":
                sel = np.isin(lab[p[1] : p[3], p[0] : p[2]], p[4])
                img = np.where(sel, g[p[1] : p[3], p[0] : p[2]], 255).astype(np.uint8)
                letters[c].append({"img": img, "desc": base - p[3], "xh": xh, "gap_after": None})
    else:
        base = float(np.median(sorted(bottoms)[: max(1, len(bottoms) * 2 // 3)]))
    words[w].append({"img": g, "desc": base - g.shape[0], "xh": xh})
def signature(img):
    """Letter shape as a 24x24 ink map (aspect kept), for comparing samples of the same character."""
    h, w = img.shape
    k = 22 / max(h, w)
    small = np.asarray(Image.fromarray(img).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS), np.float32)
    out = np.zeros((24, 24), np.float32)
    y, x = (24 - small.shape[0]) // 2, (24 - small.shape[1]) // 2
    out[y : y + small.shape[0], x : x + small.shape[1]] = 1 - small / 255
    out -= out.mean()
    return out / (np.linalg.norm(out) + 1e-6)


dropped = 0
for c, items in list(letters.items()):
    if len(items) < 3:
        continue
    sig = np.stack([signature(it["img"]) for it in items]).reshape(len(items), -1)
    sim = sig @ sig.T
    medoid = int(sim.sum(1).argmax())
    keep = []
    for it, s_ in zip(items, sim[medoid]):
        if s_ >= 0.5:
            it["typ"] = float(s_)  # how typical this sample is of the writer's character
            keep.append(it)
    dropped += len(items) - len(keep)
    letters[c] = keep
print("letters dropped as unlike their character:", dropped)
print(f"verified words: {sum(len(v) for v in words.values())} ({len(words)} distinct)")
print(f"letters: {sum(len(v) for v in letters.values())}; coverage: {''.join(sorted(letters))}")
missing = [c for c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" if c not in letters]
print("missing:", "".join(missing))
pickle.dump({"words": dict(words), "letters": dict(letters)}, open(OUT, "wb"))
