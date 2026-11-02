"""Characters DiffusionPen cannot write (its IAM charset has ~80) are drawn from fonts, sized by x-height and
inked like the generated words: Caveat (handwriting, OFL) first, DejaVu Sans (Greek, maths) as fallback.
These glyphs are font-drawn, not generated in the writer's style; the manifest lists them."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTS = Path(__file__).resolve().parent.parent / "fonts"
ORDER = ("Caveat.ttf", "DejaVuSans.ttf")
REF = 200  # measuring size


@lru_cache
def _font(name: str, size: int = REF) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


@lru_cache
def font_for(c: str) -> str | None:
    """First font with a real glyph for `c` (a missing glyph renders as the .notdef box)."""
    for name in ORDER[1:] if c in "|" else ORDER:  # Caveat's bar is slanted and reads as "/"
        f = _font(name)
        if bytes(f.getmask(c)) != bytes(f.getmask("\U000F0000")):
            return name
    return None


def segments(word: str, charset: set[str]) -> list[tuple[str, bool]]:
    """Split a word into (text, model_can_write) runs: "50%" -> [("50", True), ("%", False)].
    A run with no letter or digit ("." after "]", a lone "-") is drawn from the font too: DiffusionPen stretches
    every image to full height, so a generated lone full stop would come out as a blob."""
    out: list[tuple[str, bool]] = []
    for c in word:
        ok = c in charset
        if ok and out and out[-1][1]:
            out[-1] = (out[-1][0] + c, True)
        else:
            out.append((c, ok))
    return [p for t, ok in out for p in ([(t, ok)] if not ok or any(c.isalnum() for c in t) else [(c, False) for c in t])]


def glyph(c: str, pen: tuple[int, int, int], xheight: float) -> tuple[Image.Image, Image.Image, int]:
    """(pen-coloured RGB, alpha, depth below baseline in px) for one character, same contract as compose.piece."""
    name = font_for(c)
    if name is None:
        raise ValueError(f"No font can draw {c!r}.")
    xh = -_font(name).getbbox("x", anchor="ls")[1]
    f = _font(name, max(4, round(REF * xheight / xh)))
    x0, y0, x1, y1 = f.getbbox(c, anchor="ls")
    mask = Image.new("L", (max(1, x1 - x0), max(1, y1 - y0)), 0)
    ImageDraw.Draw(mask).text((-x0, -y0), c, font=f, fill=255, anchor="ls")
    return Image.new("RGB", mask.size, pen), mask, y1
