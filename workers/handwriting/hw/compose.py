"""Page composition: each generated word occurrence is scaled to the paper's line height, placed on its
baseline, wrapped inside the margins, broken across pages, and composited once over the paper template."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw

from .glyphs import glyph
from .paper import Paper

ASC = set("bdfhklt0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ!?'\"()/&#")
DESC = set("gjpqy,;")

Token = tuple[int, str]  # (occurrence id, word)
PAGE_BREAK: list[Token] = [(-1, "\f")]


@dataclass
class Row:
    """One table row ("cell | cell | cell" in the text). Consecutive rows share a `table` id and column widths."""

    cells: list[list[Token]]
    table: int


@dataclass
class Placed:
    occ: int
    word: str
    box: tuple[int, int, int, int]  # x, y, w, h in page pixels


@dataclass
class Page:
    lines: list[list[Token]] = field(default_factory=list)  # one entry per paper baseline used
    placed: list[Placed] = field(default_factory=list)
    x: dict[int, float] = field(default_factory=dict)  # occurrence -> left edge in page pixels
    grid: list[tuple[int, int, int, int]] = field(default_factory=list)  # table rules (x0, y0, x1, y1)


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


def is_row(line: str) -> bool:
    return "|" in line and len([c for c in line.split("|") if c.strip()]) >= 2


def tokens_of(paragraphs: list) -> list[Token]:
    """All word occurrences in reading order (table cells row by row, left to right)."""
    out: list[Token] = []
    for p in paragraphs:
        out += [t for c in p.cells for t in c] if isinstance(p, Row) else [t for t in p if t[0] >= 0]
    return out


def tokenize(text: str, keep_breaks: bool) -> list:
    """Text -> paragraphs: lists of (occurrence id, word), or Row for a "cell | cell" line.
    Form feed = page break; empty list = blank line."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    out: list = []
    occ, table = 0, -1

    def words(s: str) -> list[Token]:
        nonlocal occ
        toks = [(occ + i, w) for i, w in enumerate(s.split())]
        occ += len(toks)
        return toks

    for page_i, chunk in enumerate(text.split("\f")):
        if page_i:
            out.append(PAGE_BREAK)
        prose: list[str] = []

        def flush():
            blocks = prose if keep_breaks else [" ".join(b.split()) for b in "\n".join(prose).split("\n\n")]
            out.extend(words(b) for b in blocks)
            prose.clear()

        prev_row = False
        for line in chunk.split("\n"):
            if is_row(line):
                if prose:
                    flush()
                table += 0 if prev_row else 1
                out.append(Row([words(c) for c in line.strip().strip("|").split("|")], table))
            else:
                prose.append(line)
            prev_row = is_row(line)
        if prose:
            flush()
    return out


def column_widths(rows: list[Row], widths: dict[int, float], avail: float, pad: float) -> list[float]:
    """Each column gets its widest word plus padding; the rest of the line is shared by how much text it holds."""
    n = max(len(r.cells) for r in rows)
    need, text = [2 * pad] * n, [0.0] * n
    for r in rows:
        for i, cell in enumerate(r.cells):
            for occ, _ in cell:
                need[i] = max(need[i], widths[occ] + 2 * pad)
                text[i] += widths[occ]
    if sum(need) > avail:
        raise ValueError("A table is wider than the page even with one word per line; reduce the writing size.")
    extra, total = avail - sum(need), sum(text) or 1.0
    return [need[i] + extra * text[i] / total for i in range(n)]


def wrap(cell: list[Token], widths: dict[int, float], inner: float, space: float) -> list[list[tuple[int, str, float]]]:
    """Greedy wrap inside one table cell: lines of (occ, word, x offset from the cell's text edge)."""
    lines: list[list[tuple[int, str, float]]] = [[]]
    x = 0.0
    for occ, w in cell:
        ww = widths[occ]
        if lines[-1] and x + space + ww > inner:
            lines.append([])
            x = 0.0
        x += space if lines[-1] else 0.0
        lines[-1].append((occ, w, x))
        x += ww
    return lines


def layout(paragraphs: list, widths: dict[int, float], paper: Paper, space: float) -> list[Page]:
    """Greedy line fill over the paper's baselines; overflow starts a new page. Tables: cells wrap inside their
    columns, a row takes as many baselines as its tallest cell, rows stay whole on a page when they fit one, and
    rules are drawn between rows and columns."""
    pages = [Page()]
    used = 0
    cur: list[Token] = []
    cur_x: dict[int, float] = {}
    x = paper.margin_x
    avail = paper.right_x - paper.margin_x
    cap = len(paper.baselines)
    gaps = sorted(b - a for a, b in zip(paper.baselines, paper.baselines[1:]))
    sp = gaps[len(gaps) // 2] if gaps else 40
    pad = space * 0.6
    tables: dict[int, list[Row]] = {}
    for p in paragraphs:
        if isinstance(p, Row):
            tables.setdefault(p.table, []).append(p)
    cols = {t: column_widths(rows, widths, avail, pad) for t, rows in tables.items()}

    def new_page():
        nonlocal used
        pages.append(Page())
        used = 0

    def flush():
        nonlocal cur, cur_x, used, x
        if used >= cap:
            new_page()
        pages[-1].lines.append(cur)
        pages[-1].x.update(cur_x)
        cur, cur_x, x = [], {}, paper.margin_x
        used += 1

    def rule_row(first: int, last: int, edges: list[float], top: bool):
        b = paper.baselines
        y0, y1 = round(b[first] - 0.64 * sp), round(b[last] + 0.36 * sp)
        g = pages[-1].grid
        if top:
            g.append((round(edges[0]), y0, round(edges[-1]), y0))
        g.append((round(edges[0]), y1, round(edges[-1]), y1))
        g += [(round(e), y0, round(e), y1) for e in edges]

    open_table: tuple[int, int] | None = None  # (table id, page index) whose top rule is already drawn
    for para in paragraphs:
        if para == PAGE_BREAK:
            new_page()
            continue
        if isinstance(para, Row):
            widths_t = cols[para.table]
            edges = [paper.margin_x + sum(widths_t[:i]) for i in range(len(widths_t) + 1)]
            cells = [wrap(c, widths, widths_t[i] - 2 * pad, space) for i, c in enumerate(para.cells)]
            h = max(len(c) for c in cells)
            if used + h > cap and h <= cap:
                new_page()  # keep the row together
            first = used
            for k in range(h):
                if used >= cap:  # a row taller than a page continues on the next one
                    rule_row(first, used - 1, edges, top=open_table != (para.table, len(pages)))
                    new_page()
                    first, open_table = 0, None
                line: list[Token] = []
                for i, c in enumerate(cells):
                    for occ, w, off in c[k] if k < len(c) else []:
                        line.append((occ, w))
                        pages[-1].x[occ] = edges[i] + pad + off
                pages[-1].lines.append(line)
                used += 1
            rule_row(first, used - 1, edges, top=open_table != (para.table, len(pages)))
            open_table = (para.table, len(pages))
            continue
        open_table = None
        if not para:
            flush()  # blank line
            continue
        for occ, w in para:
            ww = widths[occ]
            if ww > avail:
                raise ValueError(f'The word "{w[:30]}" is wider than the writable line; reduce the writing size.')
            if cur and x + space + ww > paper.right_x:
                flush()
            x += space if cur else 0
            cur_x[occ] = x
            x += ww
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


Piece = tuple[str, "Image.Image | None"]  # (text, generated image) or (char, None) = drawn from a font


def core_band(gray: np.ndarray) -> tuple[int, int] | None:
    """Rows of the lowercase body (x-height band) in a cropped word image: the contiguous run of rows around the
    densest row whose ink count is at least 40 % of it. Ascenders and descenders are thin, so they fall outside."""
    rows = (gray < 170).sum(axis=1).astype(float)
    if not rows.any():
        return None
    peak = int(rows.argmax())
    keep = rows >= 0.4 * rows[peak]
    top = bottom = peak
    while top > 0 and keep[top - 1]:
        top -= 1
    while bottom < len(rows) - 1 and keep[bottom + 1]:
        bottom += 1
    return top, bottom + 1


def piece(text: str, img: Image.Image | None, pen: tuple[int, int, int], xheight: float) -> tuple[Image.Image, Image.Image, int]:
    """(rgb, alpha, depth below baseline). DiffusionPen draws every word at its own scale inside a 64-px canvas, so
    size is restored from the letters present (x-height, ascenders, descenders). That rule leaves outliers (a long
    "housewife" filling the canvas came out tiny, a bold "man" huge), so the measured lowercase body is then kept
    within 0.8-1.25x of the line's x-height. (Scaling every body to exactly the x-height was tried: band measurement
    is too noisy and words grew into the next line.)"""
    if img is None:
        return glyph(text, pen, xheight)
    units, desc = height_units(text)
    box = ink_box(img)
    if box is None:
        raise ValueError("A generated word came out blank.")
    gray = np.asarray(img.convert("L").crop(box))
    f = 1.0
    band = core_band(gray) if sum(c.islower() for c in text) >= 4 else None  # short words measure unreliably
    if band and band[1] - band[0] >= 4:
        body = (band[1] - band[0]) * xheight * units / gray.shape[0]  # lowercase body height under the letter rule
        f = min(max(min(max(body, 0.8 * xheight), 1.25 * xheight) / body, 0.75), 1.5)
    rgb, alpha = tint(img, pen, max(1, round(xheight * units * f)))
    return rgb, alpha, round(xheight * desc * f)


def join(parts: list[tuple[Image.Image, Image.Image, int]], pen: tuple[int, int, int], gap: int) -> tuple[Image.Image, Image.Image, int]:
    """Baseline-align pieces of one word ("50" generated + "%" from a font) into a single ink image."""
    if len(parts) == 1:
        return parts[0]
    top = min(d - a.height for _, a, d in parts)  # highest point, relative to the baseline
    bottom = max(d for _, _, d in parts)
    alpha = Image.new("L", (sum(a.width for _, a, _ in parts) + gap * (len(parts) - 1), bottom - top), 0)
    x = 0
    for _, a, d in parts:
        alpha.paste(a, (x, d - a.height - top))
        x += a.width + gap
    return Image.new("RGB", alpha.size, pen), alpha, bottom


def compose(paper: Paper, images: dict[int, Image.Image | list[Piece]], paragraphs: list[list[Token]], pen: tuple[int, int, int], xheight: float) -> tuple[list[Image.Image], list[Page]]:
    """Render pages. `images` maps occurrence id -> generated word image, or its pieces. Returns page images + layout."""
    space = xheight * 0.7
    words = dict(tokens_of(paragraphs))
    gap = max(1, round(xheight * 0.06))
    sized = {}
    for occ, img in images.items():
        parts = img if isinstance(img, list) else [(words[occ], img)]
        sized[occ] = join([piece(t, im, pen, xheight) for t, im in parts], pen, gap)
    pages = layout(paragraphs, {o: s[0].width for o, s in sized.items()}, paper, space)
    out = []
    for page in pages:
        canvas = paper.image.copy()
        for li, line in enumerate(page.lines):
            base = paper.baselines[li]
            for occ, w in line:
                rgb, alpha, desc = sized[occ]
                x = round(page.x[occ])
                top = base - rgb.height + desc - max(1, round(xheight * 0.08))  # sit just above the rule
                canvas.paste(rgb, (x, top), alpha)
                page.placed.append(Placed(occ, w, (x, top, rgb.width, rgb.height)))
        if page.grid:  # table rules, drawn in the pen colour like a student with a ruler
            draw = ImageDraw.Draw(canvas)
            for x0, y0, x1, y1 in page.grid:
                draw.line((x0, y0, x1, y1), fill=pen, width=max(1, round(xheight * 0.07)))
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
