"""Job -> handwritten pages. The reference supplies lettering style (and optionally paper); its text is never
read or copied. Every output carries a provenance record marking it as generated."""
from __future__ import annotations

import io
import statistics
import time
import unicodedata
from dataclasses import dataclass, field, replace
from typing import Protocol

from PIL import Image

from .compose import check, compose, tokenize
from .model import unsupported_chars
from .paper import Paper, reconstruct, residual_ink, synthetic
from .recognize import word_error
from .style import extract_style

# Typography the IAM charset lacks, mapped to what it has. Reported in the manifest.
NORMALISE = {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " "}
PAGE_MM = {"A4": (210, 297), "Letter": (215.9, 279.4)}


class WordGenerator(Protocol):
    name: str

    def generate(self, words: list[str], style_imgs: list[Image.Image], seeds: list[int]) -> list[Image.Image]: ...


@dataclass
class Result:
    pages: list[Image.Image]
    manifest: dict
    ink: list[Image.Image] = field(default_factory=list)  # same layout on white: ink-only preview
    paper: Image.Image | None = None  # clean template: paper-only preview


def normalise(text: str) -> tuple[str, list[str]]:
    changed = sorted({c for c in text if c in NORMALISE})
    for a, b in NORMALISE.items():
        text = text.replace(a, b)
    return unicodedata.normalize("NFC", text), [f"{c!r} written as {NORMALISE[c]!r}" for c in changed]


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def seed_for(base: int, occ: int, bump: int) -> int:
    return (base + occ * 7919 + bump * 104729) % (2**31)


def run(payload: dict, files: dict[str, bytes], gen: WordGenerator, reader=None, candidates: int = 3) -> Result:
    """payload: text, pageSize, paper (ruled|grid|plain|reference|source), marginLeftMm, marginTopMm,
    lineSpacingMm, penColor ("#rrggbb" | "match"), sizePt, keepLineBreaks, seed, bumps {occ: n}.
    files: reference (required, PNG/JPEG page of the writer), paper (optional page whose sheet is reused).
    reader: optional word recogniser; when given, the best of `candidates` samples per word is kept."""
    t0 = time.time()
    text, notes = normalise(payload["text"])
    bad = unsupported_chars(text)
    if bad:
        raise ValueError(f"The handwriting model cannot write these characters: {' '.join(sorted(bad))}. Remove or replace them.")
    if not text.strip():
        raise ValueError("There is no text to write.")

    reference = Image.open(io.BytesIO(files["reference"])).convert("RGB")
    crops, ink_rgb, boxes = extract_style(reference)
    pen = ink_rgb if payload.get("penColor", "match") == "match" else hex_rgb(payload["penColor"])

    size = payload.get("pageSize", "A4")
    style = payload.get("paper", "ruled")
    paper_src = files.get("paper") if style in ("reference", "source") else None
    if paper_src:
        sheet = Image.open(io.BytesIO(paper_src)).convert("RGB")
        paper: Paper = reconstruct(sheet)
        left = residual_ink(sheet, paper.image)
        if left > 0.02:
            paper.notes.append(f"{left:.1%} of the original writing could not be removed cleanly.")
    else:
        w, h = PAGE_MM[size]
        paper = synthetic(w, h, 200, payload.get("marginTopMm", 30), payload.get("marginLeftMm", 25), payload.get("lineSpacingMm", 8), style if style in ("ruled", "grid", "plain") else "ruled")
    diffs = [b - a for a, b in zip(paper.baselines, paper.baselines[1:])]
    spacing = statistics.median(diffs) if diffs else 40
    xheight = spacing * 0.33 * (payload.get("sizePt", 14) / 14)
    xheight = min(xheight, spacing * 0.40)  # ascender + descender must stay inside one rule gap

    paragraphs = tokenize(text, payload.get("keepLineBreaks", True))
    tokens = [t for p in paragraphs for t in p if t[0] >= 0]
    base = int(payload.get("seed", 1234))
    bumps = {int(k): int(v) for k, v in payload.get("bumps", {}).items()}
    n = candidates if reader else 1
    # Each occurrence gets n candidates from distinct seeds; "regenerate line" bumps move to a fresh set.
    seeds = [seed_for(base, occ, bumps.get(occ, 0) * n + c) for occ, _ in tokens for c in range(n)]
    imgs = gen.generate([w for _, w in tokens for _ in range(n)], crops, seeds)
    images: dict[int, Image.Image] = {}
    check_report = None
    if reader:
        reads = reader.read(imgs)
        errors = []
        for i, (occ, w) in enumerate(tokens):
            options = [(word_error(w, reads[i * n + c]), c) for c in range(n)]
            err, c = min(options)
            images[occ] = imgs[i * n + c]
            errors.append((err, w, reads[i * n + c]))
        check_report = {
            "model": reader.name,
            "candidates": n,
            "cer": round(sum(e for e, _, _ in errors) / len(errors), 4),
            "exact_words": sum(e == 0 for e, _, _ in errors),
            "words": len(errors),
            "doubtful": [{"word": w, "read": r} for e, w, r in errors if e > 0.34][:50],
        }
    else:
        images = {occ: im for (occ, _), im in zip(tokens, imgs)}

    pages, layout = compose(paper, images, paragraphs, pen, xheight)
    ink, _ = compose(replace(paper, image=Image.new("RGB", paper.image.size, "white")), images, paragraphs, pen, xheight)
    issues = check(layout, paper.image.size)
    manifest = {
        "provenance": {
            "generated": True,
            "kind": "generated-handwriting",
            "model": gen.name,
            "seed": base,
            "reference_use": "lettering style only; reference text is not read or copied",
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "paper": {"source": paper.source, "notes": paper.notes},
        "pen": "#%02x%02x%02x" % pen,
        "style_crops": [list(b) for b in boxes],
        "normalised": notes,
        "issues": issues,
        "word_check": check_report,
        "pages": [
            {
                "size": list(paper.image.size),
                "lines": [{"occ": [o for o, _ in line], "text": " ".join(w for _, w in line)} for line in p.lines],
                "words": [{"occ": q.occ, "word": q.word, "box": list(q.box)} for q in p.placed],
            }
            for p in layout
        ],
        "seconds": round(time.time() - t0, 2),
    }
    return Result(pages, manifest, ink, paper.image)
