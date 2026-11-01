"""LIVE model test: real DiffusionPen inference on the local GPU. Skipped when weights or CUDA are absent.
Writes sample outputs to out/ for visual review and prints timing + peak VRAM."""
import io
import json
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
torch = pytest.importorskip("torch")
from hw.model import MODELS  # noqa: E402

pytestmark = pytest.mark.skipif(not (MODELS / "diffusionpen" / "ema_ckpt.pt").exists() or not torch.cuda.is_available(), reason="model weights or CUDA unavailable")
OUT = ROOT / "out"
REF = ROOT.parent.parent / "tests" / "fixtures" / "ruled-page.png"


@pytest.fixture(scope="module")
def gen():
    from hw.model import Generator

    torch.cuda.reset_peak_memory_stats()
    t = time.time()
    g = Generator()
    print(f"\nload {time.time() - t:.1f}s, VRAM after load {torch.cuda.max_memory_allocated() / 2**30:.2f} GB")
    return g


def test_generates_non_blank_words(gen):
    from PIL import Image

    from hw.compose import ink_box
    from hw.style import extract_style

    crops, _, _ = extract_style(Image.open(REF))
    words = ["Verification", "of", "Ohm's", "law", "using", "a", "resistor."]
    t = time.time()
    imgs = gen.generate(words, crops, list(range(len(words))))
    dt = time.time() - t
    OUT.mkdir(exist_ok=True)
    for w, im in zip(words, imgs):
        im.save(OUT / f"word-{w.strip('.').replace(chr(39), '')}.png")
        assert im.size == (256, 64)
        assert ink_box(im) is not None, f"{w} came out blank"
    print(f"{len(words)} words in {dt:.1f}s ({dt / len(words):.2f}s/word), peak VRAM {torch.cuda.max_memory_allocated() / 2**30:.2f} GB")
    assert torch.cuda.max_memory_allocated() < 7.5 * 2**30  # fits an 8 GB card


def test_full_page_pipeline(gen):
    from hw.pipeline import run

    text = "Experiment No. 5\nAim: To verify Ohm's law using a fixed resistor.\n\nTheory: The current through a conductor is directly proportional to the voltage across it, provided the temperature stays constant.\n\nResult: The graph of voltage against current is a straight line."
    payload = {"text": text, "pageSize": "A4", "paper": "ruled", "penColor": "match", "sizePt": 14, "keepLineBreaks": True,
               "seed": 42, "bumps": {}, "marginLeftMm": 25, "marginTopMm": 30, "lineSpacingMm": 8}
    from hw.recognize import Reader

    reader = Reader()
    t = time.time()
    r = run(payload, {"reference": REF.read_bytes()}, gen, reader=reader)
    print("word check:", json.dumps(r.manifest["word_check"]))
    print(f"page pipeline {time.time() - t:.1f}s, {sum(len(p['words']) for p in r.manifest['pages'])} words")
    OUT.mkdir(exist_ok=True)
    for i, p in enumerate(r.pages):
        p.save(OUT / f"page-{i + 1}.png")
    (OUT / "manifest.json").write_text(json.dumps(r.manifest, indent=2))
    assert r.manifest["issues"] == []
    assert r.manifest["provenance"]["model"] == "diffusionpen-iam-ema"
    written = " ".join(w["word"] for p in r.manifest["pages"] for w in p["words"])
    assert written == " ".join(text.split())
