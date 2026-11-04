"""Job -> handwritten pages. The reference supplies lettering style (and optionally paper); its text is never
read or copied. Every output carries a provenance record marking it as generated."""
from __future__ import annotations

import io
import statistics
import time
import unicodedata
from dataclasses import dataclass, field, replace
from typing import Callable, Protocol

from PIL import Image

from .compose import check, compose, tokenize, tokens_of
from .glyphs import font_for, segments
from .model import CHARSET, unsupported_chars
from .paper import Paper, reconstruct, residual_ink, synthetic
from .recognize import word_error
from .style import extract_style

# Typography the IAM charset lacks, mapped to what it has. Reported in the manifest.
NORMALISE = {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", " ": " "}
PAGE_MM = {"A4": (210, 297), "Letter": (215.9, 279.4)}
RETRY_ROUNDS, RETRY_SAMPLES = 3, 4  # precision pass for words read back wrong (see run)


class WordGenerator(Protocol):
    name: str

    def generate(self, words: list[str], style_imgs: list[Image.Image], seeds: list[int], progress: Callable[[int], None] | None = None) -> list[Image.Image]: ...


Progress = Callable[[str, int, int], None]  # (stage, done, total)


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
    # Invisible characters from PDFs/Word (soft hyphens, zero-width spaces, control codes) are dropped.
    text = "".join(c for c in text if c in "\n\f\t" or unicodedata.category(c) not in ("Cc", "Cf"))
    return unicodedata.normalize("NFC", text), [f"{c!r} written as {NORMALISE[c]!r}" for c in changed]


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def seed_for(base: int, occ: int, bump: int) -> int:
    return (base + occ * 7919 + bump * 104729) % (2**31)


def run(payload: dict, files: dict[str, bytes], gen: WordGenerator, reader=None, candidates: int = 3, progress: Progress | None = None) -> Result:
    """payload: text, pageSize, paper (ruled|grid|plain|reference|source), marginLeftMm, marginTopMm,
    lineSpacingMm, penColor ("#rrggbb" | "match"), sizePt, keepLineBreaks, seed, bumps {occ: n}.
    files: reference (required, PNG/JPEG page of the writer; reference2.. more pages for the collage engine), paper
    (optional page whose sheet is reused). payload.referenceText: transcript of the reference pages (collage engine).
    reader: optional word recogniser; when given, the best of `candidates` samples per word is kept.
    Characters outside the model's charset are drawn from a handwriting font (hw/glyphs.py)."""
    t0 = time.time()
    report = progress or (lambda *_: None)
    text, notes = normalise(payload["text"])
    bad = {c for c in unsupported_chars(text) if not font_for(c)}
    if bad:
        raise ValueError(f"These characters cannot be written: {' '.join(sorted(bad))}. Remove or replace them.")
    if not text.strip():
        raise ValueError("There is no text to write.")

    report("Reading the handwriting reference", 0, 1)
    reference = Image.open(io.BytesIO(files["reference"])).convert("RGB")
    crops, ink_rgb, boxes = extract_style(reference, count=getattr(gen, "style_count", 5))
    if hasattr(gen, "prepare"):  # collage engine: bank of the writer's own words/letters from every reference page
        refs = [Image.open(io.BytesIO(files[k])).convert("RGB") for k in sorted(files) if k.startswith("reference")]
        gen.prepare(refs, payload.get("referenceText"))
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
    tokens = tokens_of(paragraphs)
    base = int(payload.get("seed", 1234))
    bumps = {int(k): int(v) for k, v in payload.get("bumps", {}).items()}
    n = candidates if reader else 1
    segs = {occ: segments(w, getattr(gen, "charset", CHARSET), getattr(gen, "writes_digits", False)) for occ, w in tokens}
    # Model-writable runs of each word; the rest are font glyphs. Run k of an occurrence gets its own seed offset.
    runs = [(occ, k, t) for occ, _ in tokens for k, (t, ok) in enumerate(segs[occ]) if ok]
    # Each run gets n candidates from distinct seeds; "regenerate line" bumps move to a fresh set.
    seeds = [(seed_for(base, occ, bumps.get(occ, 0) * n + c) + k * 15485863) % (2**31) for occ, k, _ in runs for c in range(n)]
    total = len(seeds)
    imgs = gen.generate([t for _, _, t in runs for _ in range(n)], crops, seeds, progress=lambda done: report("Writing words", done, total)) if runs else []
    chosen: dict[tuple[int, int], Image.Image] = {}
    check_report = None
    if reader and runs:
        report("Checking each word", 0, 1)
        reads = reader.read(imgs)
        best: list[tuple[float, Image.Image, str]] = []  # per run: (error, image, reading)
        for i, (_, _, w) in enumerate(runs):
            err, c = min((word_error(w, reads[i * n + c]), c) for c in range(n))
            best.append((err, imgs[i * n + c], reads[i * n + c]))
        first_exact = sum(b[0] == 0 for b in best)
        # Precision pass: a word whose best sample is read back wrong (misspelt, wrong digit, dropped colon) is
        # written again with fresh seeds until a sample reads exactly, at most RETRY_ROUNDS x RETRY_SAMPLES more.
        rounds = 0
        for rnd in range(1, RETRY_ROUNDS + 1):
            wrong = [i for i, b in enumerate(best) if b[0] > 0]
            if not wrong:
                break
            rounds = rnd
            report("Rewriting doubtful words", rnd - 1, RETRY_ROUNDS)
            more = gen.generate(
                [runs[i][2] for i in wrong for _ in range(RETRY_SAMPLES)],
                crops,
                [(seed_for(base, runs[i][0], bumps.get(runs[i][0], 0) * n + c) + runs[i][1] * 15485863 + rnd * 7368787) % (2**31) for i in wrong for c in range(RETRY_SAMPLES)],
            )
            more_reads = reader.read(more)
            for j, i in enumerate(wrong):
                for c in range(j * RETRY_SAMPLES, (j + 1) * RETRY_SAMPLES):
                    err = word_error(runs[i][2], more_reads[c])
                    if err < best[i][0]:
                        best[i] = (err, more[c], more_reads[c])
        chosen = {(occ, k): best[i][1] for i, (occ, k, _) in enumerate(runs)}
        errors = [(b[0], runs[i][2], b[2]) for i, b in enumerate(best)]
        check_report = {
            "model": reader.name,
            "candidates": n,
            "cer": round(sum(e for e, _, _ in errors) / len(errors), 4),
            "exact_words": sum(e == 0 for e, _, _ in errors),
            "exact_first_pass": first_exact,
            "rewrite_rounds": rounds,
            "words": len(errors),
            "doubtful": [{"word": w, "read": r} for e, w, r in errors if e > 0][:50],
        }
    else:
        chosen = {(occ, k): im for (occ, k, _), im in zip(runs, imgs)}
    images = {occ: [(t, chosen.get((occ, k))) for k, (t, _) in enumerate(segs[occ])] for occ, _ in tokens}

    report("Laying out pages", 0, 1)
    pages, layout = compose(paper, images, paragraphs, pen, xheight)
    ink, _ = compose(replace(paper, image=Image.new("RGB", paper.image.size, "white")), images, paragraphs, pen, xheight)
    issues = check(layout, paper.image.size)
    manifest = {
        "provenance": {
            "generated": True,
            "kind": "generated-handwriting",
            "model": gen.name,
            "seed": base,
            "reference_use": getattr(gen, "reference_use", "lettering style only; reference text is not read or copied"),
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "paper": {"source": paper.source, "notes": paper.notes},
        "pen": "#%02x%02x%02x" % pen,
        "style_crops": [list(b) for b in boxes],
        "normalised": notes,
        "font_drawn": sorted({c for occ, _ in tokens for t, ok in segs[occ] if not ok for c in t}),  # characters drawn from a font, not generated in the writer's style
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
