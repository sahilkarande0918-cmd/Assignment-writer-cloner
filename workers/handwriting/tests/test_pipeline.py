"""Worker tests on synthetic pages (no GPU). Generation here is SIMULATED with a font renderer so that layout,
paper reconstruction and the job contract can be tested deterministically; live model quality is measured
separately in test_live.py and never inferred from these tests."""
import io
import os
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from hw.compose import check, compose, layout, tokenize  # noqa: E402
from hw.paper import reconstruct, residual_ink, synthetic  # noqa: E402
from hw.pipeline import normalise, run  # noqa: E402
from hw.style import extract_style  # noqa: E402

FONT = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", "Inkfree.ttf")


def font(size):
    return ImageFont.truetype(FONT, size) if os.path.exists(FONT) else ImageFont.load_default(size)


def ruled_page(lines=("Experiment No. 4 diode study", "Name: Aditya Kulkarni roll 41", "The forward bias graph rises", "quickly after the knee voltage")):
    """1240x1754 notebook page with blue rules, red margin and handwriting-style text."""
    img = Image.new("RGB", (1240, 1754), (252, 250, 244))
    d = ImageDraw.Draw(img)
    for y in range(180, 1700, 52):
        d.line([(0, y), (1240, y)], fill=(170, 196, 222), width=2)
    d.line([(150, 0), (150, 1754)], fill=(214, 120, 120), width=3)
    for i, t in enumerate(lines):
        d.text((175, 180 + i * 52 - 44), t, font=font(40), fill=(32, 48, 92))
    return img


class SimGenerator:
    """Test double: renders each word with a font on a 256x64 canvas. NOT a handwriting model."""

    name = "simulated-font-renderer"

    def generate(self, words, style_imgs, seeds, progress=None):
        out = []
        for w in words:
            im = Image.new("RGB", (256, 64), "white")
            ImageDraw.Draw(im).text((4, 8), w, font=font(min(40, int(240 / max(1, len(w)) * 1.6))), fill=(20, 20, 20))
            out.append(im)
            if progress:
                progress(len(out))
        return out


def test_style_extraction_finds_words_and_ink_colour_without_rules():
    crops, color, boxes = extract_style(ruled_page())
    assert 3 <= len(crops) <= 5
    assert color[2] > color[0]  # blue-black ink, not the red margin or blue rule
    for c in crops:
        a = np.asarray(c.convert("RGB"))
        # no light-blue rule pixels survive in a crop
        assert not ((a[..., 2] > 200) & (a[..., 0] < 190) & (a[..., 0] > 140)).any()


def test_paper_reconstruction_removes_writing_and_keeps_rules():
    page = ruled_page()
    paper = reconstruct(page)
    assert residual_ink(page, paper.image) < 0.02
    assert len(paper.baselines) >= 20
    spacing = np.median(np.diff(paper.baselines))
    assert abs(spacing - 52) <= 2
    assert 150 < paper.margin_x < 220  # writing starts right of the red margin
    a = np.asarray(paper.image)
    assert tuple(a[180 + 52 * 10, 600]) == (170, 196, 222)  # an untouched rule pixel stays identical


def test_layout_wraps_breaks_pages_and_never_overlaps():
    paper = synthetic(210, 297, 120, 30, 25, 8, "ruled")
    text = "\n".join(["word " * 9] * 40) + "\fAfter break"
    paras = tokenize(text, keep_breaks=True)
    occ = [t for p in paras for t in p if t[0] >= 0]
    images = dict(zip([o for o, _ in occ], SimGenerator().generate([w for _, w in occ], [], [])))
    pages, lay = compose(paper, images, paras, (31, 47, 92), 12)
    assert len(pages) >= 3  # 40 lines don't fit one page; form feed forces another
    assert lay[-1].placed[0].word == "After"
    assert check(lay, paper.image.size) == []
    placed = sum(len(p.placed) for p in lay)
    assert placed == len(occ)  # no word lost


def test_overlong_word_is_rejected_instead_of_clipped():
    paper = synthetic(210, 297, 120, 30, 25, 8, "ruled")
    with pytest.raises(ValueError, match="wider than the writable line"):
        layout([[(0, "x")]], {0: 10_000}, paper, 5)


def test_pipeline_contract_provenance_and_no_reference_text():
    buf = io.BytesIO()
    ruled_page().save(buf, "PNG")
    payload = {"text": "Aim: To verify Ohm's law\n\nResult: verified.", "pageSize": "A4", "paper": "reference", "penColor": "match",
               "sizePt": 14, "keepLineBreaks": True, "seed": 7, "bumps": {}, "marginLeftMm": 25, "marginTopMm": 30, "lineSpacingMm": 8}
    r = run(payload, {"reference": buf.getvalue(), "paper": buf.getvalue()}, SimGenerator())
    m = r.manifest
    assert m["provenance"]["generated"] is True and m["provenance"]["model"] == "simulated-font-renderer"
    written = " ".join(w["word"] for p in m["pages"] for w in p["words"])
    assert written == "Aim: To verify Ohm's law Result: verified."
    assert "Kulkarni" not in written and "diode" not in written  # reference content never copied
    assert m["issues"] == []
    assert m["paper"]["source"] == "reference"
    # Paper-only preview has no writing; ink-only preview has no paper; layouts match the composite.
    from hw.paper import residual_ink
    assert r.paper is not None and residual_ink(ruled_page(), r.paper) < 0.02
    ink = np.asarray(r.ink[0].convert("L"))
    assert (ink > 250).mean() > 0.95 and len(r.ink) == len(r.pages)


def test_typography_is_normalised_and_invisible_characters_dropped():
    text, notes = normalise("“Quote” – done…­​")
    assert text == '"Quote" - done...' and notes


def test_characters_outside_the_model_charset_are_drawn_from_a_font():
    from hw.compose import ink_box
    from hw.glyphs import segments
    from hw.model import CHARSET

    assert segments("50%", CHARSET) == [("5", False), ("0", False), ("%", False)]
    assert segments("<a@b>", CHARSET) == [("<", False), ("a", True), ("@", False), ("b", True), (">", False)]
    # punctuation-only pieces are drawn at natural size, not stretched by the model into blobs
    assert segments("[B].", CHARSET) == [("[", False), ("B", True), ("]", False), (".", False)]
    assert segments("-", CHARSET) == [("-", False)] and segments("law.", CHARSET) == [("law.", True)]
    buf = io.BytesIO()
    ruled_page().save(buf, "PNG")
    text = "Yield 100% at 25°C, cost £5 © {x} [α≤β] ™"
    stages = []
    r = run({"text": text, "seed": 1, "bumps": {}, "paper": "plain"}, {"reference": buf.getvalue()}, SimGenerator(),
            progress=lambda s, d, t: stages.append(s))
    m = r.manifest
    assert " ".join(w["word"] for p in m["pages"] for w in p["words"]) == text  # nothing dropped
    assert set("%°£©{}[]α≤β™") <= set(m["font_drawn"]) and m["issues"] == []
    for w in m["pages"][0]["words"]:  # every word, including symbol-only ones, left ink on the page
        x, y, ww, hh = w["box"]
        assert ink_box(r.ink[0].crop((x, y, x + ww, y + hh))) is not None
    assert stages[0] == "Reading the handwriting reference" and "Writing words" in stages and stages[-1] == "Laying out pages"


def test_characters_no_font_has_fail_clearly():
    buf = io.BytesIO()
    ruled_page().save(buf, "PNG")
    with pytest.raises(ValueError, match="cannot be written: 字"):  # no CJK in Caveat or DejaVu Sans
        run({"text": "done 字", "seed": 1, "bumps": {}}, {"reference": buf.getvalue()}, SimGenerator())


def test_words_read_back_wrong_are_rewritten_until_exact():
    """Precision pass: the first samples of every word are "misread"; the rewrite round finds exact ones."""
    gen = SimGenerator()
    made = {}

    def generate(words, style_imgs, seeds, progress=None):
        imgs = SimGenerator.generate(gen, words, style_imgs, seeds, progress)
        made.update({id(im): w for im, w in zip(imgs, words)})
        return imgs

    class FlakyReader:
        name, calls = "flaky", 0

        def read(self, images):
            self.calls += 1
            # first pass: every reading wrong (a dropped last letter); rewrite pass: exact
            return [made[id(im)][:-1] if self.calls == 1 else made[id(im)] for im in images]

    gen.generate = generate
    buf = io.BytesIO()
    ruled_page().save(buf, "PNG")
    stages = []
    r = run({"text": "Rs 5: done", "seed": 1, "bumps": {}}, {"reference": buf.getvalue()}, gen, reader=FlakyReader(), candidates=3,
            progress=lambda s, d, t: stages.append(s))
    wc = r.manifest["word_check"]
    assert wc["exact_first_pass"] == 0 and wc["exact_words"] == wc["words"] == 2 and wc["rewrite_rounds"] == 1  # "5:" is font
    assert wc["doubtful"] == [] and "Rewriting doubtful words" in stages


def test_digits_are_always_drawn_from_the_font():
    """Numbers are exact by construction; letters around them are still generated."""
    from hw.glyphs import segments
    from hw.model import CHARSET

    assert segments("0.09,", CHARSET) == [(c, False) for c in "0.09,"]
    assert segments("B2.", CHARSET) == [("B", True), ("2", False), (".", False)]
    assert segments("No.", CHARSET) == [("No.", True)]



def test_tables_are_written_as_ruled_tables_with_wrapped_cells():
    from hw.compose import Row, tokens_of

    text = ("IA Activity 1\nSr.No. | Interaction and Observation | Reaction or Response | Why?\n"
            "1. | A housewife speaks rudely to her maid and treats her disrespectfully | Reaction | "
            "She behaves according to her irritation instead of communicating respectfully.\n"
            "2. | The maid gets upset and decides to leave the job. | Reaction | She responds emotionally.\nDone.")
    paras = tokenize(text, keep_breaks=True)
    rows = [p for p in paras if isinstance(p, Row)]
    assert len(rows) == 3 and {r.table for r in rows} == {0} and [len(r.cells) for r in rows] == [4, 4, 4]
    buf = io.BytesIO()
    ruled_page().save(buf, "PNG")
    r = run({"text": text, "seed": 1, "bumps": {}, "paper": "ruled"}, {"reference": buf.getvalue()}, SimGenerator())
    m = r.manifest
    assert m["issues"] == []  # nothing clipped or overlapping
    placed = [w["word"] for p in m["pages"] for w in p["words"]]
    assert sorted(placed) == sorted(w for _, w in tokens_of(paras))  # every word written once
    # the long "Interaction" cell wraps onto several lines, so the row spans more baselines than the short ones
    lines = m["pages"][0]["lines"]
    assert len([l for l in lines if "rudely" in l["text"] or "disrespectfully" in l["text"]]) >= 2
    # words of column 2 start right of column 1's rule: x of "Reaction" > x of "1."
    boxes = {w["word"]: w["box"] for w in m["pages"][0]["words"]}
    assert boxes["Reaction"][0] > boxes["housewife"][0] > boxes["1."][0]


class ScriptReader:
    """Test double for TrOCR: returns the expected words in reading order (bank building), else a fixed reading."""

    name, device = "script-reader", "cpu"

    def __init__(self, words):
        self.words = list(words)

    def read(self, images):
        out, self.words = self.words[: len(images)], self.words[len(images) :]
        return out + ["?"] * (len(images) - len(out))


def test_collage_engine_reuses_the_writers_own_words_and_letters():
    from hw.collage import CollageGenerator
    from hw.glyphs import segments

    rows = ["bland cadet label", "table dance blend", "talent cable bent", "lance dental debt", "candle tablet decal"]
    img = Image.new("RGB", (1400, 850), "white")
    d = ImageDraw.Draw(img)
    for i, r in enumerate(rows):
        x = 60
        for w in r.split():
            d.text((x, 60 + i * 150), w, font=font(56), fill=(30, 40, 90))
            x += d.textlength(w, font=font(56)) + 90
    words = " ".join(rows).split()
    gen = CollageGenerator(ScriptReader(words))
    gen.prepare([img], " ".join(rows))
    assert set(words) <= set(gen.words)  # every crop was labelled from the transcript
    assert {"a", "b", "e", "l", "n", "t"} <= gen.charset and "z" not in gen.charset  # unseen letters go to the font
    assert segments("zeal", gen.charset, gen.writes_digits) == [("z", False), ("eal", True)]
    real, built = gen.generate(["table", "beat"], [], [1, 2])
    assert real.size[0] > 40 and built.size[0] > 40
    assert np.asarray(gen.generate(["table"], [], [1])[0]).tobytes() == np.asarray(real).tobytes()  # seeded = repeatable


def test_collage_engine_needs_enough_handwriting():
    from hw.collage import CollageGenerator

    with pytest.raises(ValueError, match="upload more pages"):
        CollageGenerator(ScriptReader([])).prepare([ruled_page(("one",))], "one")
    with pytest.raises(ValueError, match="word checker"):
        CollageGenerator(None)
