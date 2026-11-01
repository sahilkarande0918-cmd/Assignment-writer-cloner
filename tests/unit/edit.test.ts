// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { docxSpans, openDocx, parseXml, W } from "@/lib/doc/docx";
import { editDocx } from "@/lib/edit/docx";
import { applyToText, editPlainText, toEdits, type SpanEdit } from "@/lib/edit/ops";
import { lineDiff } from "@/lib/diff";
import type { ResolvedOp } from "@/lib/plan";
import type { Span } from "@/lib/doc/model";

const SRC = new Uint8Array(readFileSync("tests/fixtures/lab-report.docx"));

async function spansOf(bytes: Uint8Array) {
  const { xml } = await openDocx(bytes);
  return docxSpans(parseXml(xml));
}
const e = (span: Span, match: string, replacement: string, extra: Partial<SpanEdit> = {}): SpanEdit => ({ opId: "op1", span, match, replacement, all: false, ...extra });

describe("editDocx", () => {
  it("replaces text inside its run, keeps run formatting and leaves every other package part byte-identical", async () => {
    const spans = await spansOf(SRC);
    const name = spans.find((s) => s.text.includes("Aditya"))!;
    const { bytes, reports } = await editDocx(SRC, [e(name, "Aditya Kulkarni", "Sahil Karande")]);
    expect(reports[0].status).toBe("applied");
    const after = await spansOf(bytes);
    expect(after.find((s) => s.id === name.id)?.text).toBe("Name: Sahil Karande");

    const { xml } = await openDocx(bytes);
    const run = Array.from(parseXml(xml).getElementsByTagNameNS(W, "t")).find((t) => t.textContent === "Sahil Karande")!.parentElement!;
    expect(run.getElementsByTagNameNS(W, "b").length).toBe(1); // bold kept

    const [a, b] = await Promise.all([JSZip.loadAsync(SRC), JSZip.loadAsync(bytes)]);
    for (const path of Object.keys(a.files).filter((p) => p !== "word/document.xml" && !a.files[p].dir)) {
      expect(await b.file(path)!.async("string"), path).toBe(await a.file(path)!.async("string"));
    }
  });

  it("edits a table cell, adds a paragraph after another, and deletes a whole paragraph", async () => {
    const spans = await spansOf(SRC);
    const cell = spans.find((s) => s.cell && s.text === "4.2")!;
    const concl = spans.find((s) => s.text.startsWith("Conclusion"))!;
    const prn = spans.find((s) => s.text.startsWith("PRN"))!;
    const { bytes, reports } = await editDocx(SRC, [
      e(cell, "4.2", "4.7"),
      { ...e(concl, "", "Precautions: connections should be tight."), opId: "op2", newLine: true },
      { ...e(prn, prn.text, ""), opId: "op3" },
    ]);
    expect(reports.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    const texts = (await spansOf(bytes)).map((s) => s.text);
    expect(texts).toContain("4.7");
    expect(texts.indexOf("Precautions: connections should be tight.")).toBe(texts.indexOf(concl.text) + 1);
    expect(texts.some((t) => t.startsWith("PRN"))).toBe(false);
  });

  it("matches text split across several runs", async () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Experi</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>ment 3</w:t></w:r><w:r><w:t> done</w:t></w:r></w:p></w:body></w:document>`;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types>wordprocessingml.document</Types>");
    zip.file("word/document.xml", xml);
    const src = await zip.generateAsync({ type: "uint8array" });
    const [span] = await spansOf(src);
    const { bytes } = await editDocx(src, [e(span, "Experiment 3", "Experiment 4")]);
    expect((await spansOf(bytes))[0].text).toBe("Experiment 4 done");
  });
});

const op = (o: Partial<ResolvedOp>): ResolvedOp => ({
  id: "op1", status: "ok", targets: ["l0"], reason: null, type: "replace_text", page: null, spanId: null, match: "", replacement: "",
  position: null, occurrence: "single", cell: null, field: null, constraints: [], confidence: 1, warning: null, ...o,
});

describe("toEdits / text engine", () => {
  const spans: Span[] = [{ id: "l0", page: 0, text: "Name: A" }, { id: "l1", page: 0, text: "End" }];
  it("maps insert positions and skips unsupported or unresolved ops with reasons", () => {
    const { edits, skipped } = toEdits(
      [
        op({ type: "insert_text", position: "before", match: "A", replacement: "Dr. " }),
        op({ id: "op2", type: "insert_text", position: "after", match: "End", replacement: "New line", targets: ["l1"] }),
        op({ id: "op3", type: "change_style", match: "A" }),
        op({ id: "op4", status: "ambiguous", reason: "twice" }),
      ],
      spans,
    );
    expect(edits.map((x) => [x.match, x.replacement, !!x.newLine])).toEqual([["A", "Dr. A", false], ["", "New line", true]]);
    expect(skipped.map((s) => s.opId)).toEqual(["op3", "op4"]);
  });
  it("replaces one or all occurrences and inserts lines in plain text", () => {
    expect(applyToText("a-a-a", { match: "a", replacement: "b", all: false })).toBe("b-a-a");
    expect(applyToText("a-a-a", { match: "a", replacement: "$&", all: true })).toBe("$&-$&-$&");
    expect(editPlainText("x\n\ny", [{ opId: "1", span: { id: "l2", page: 0, text: "y" }, match: "y", replacement: "z", all: false }, { opId: "2", span: { id: "l0", page: 0, text: "x" }, match: "", replacement: "after x", all: false, newLine: true }])).toBe("x\nafter x\n\nz");
  });
});

describe("lineDiff", () => {
  it("marks replaced, inserted and deleted lines", () => {
    const d = lineDiff(["a", "b", "c"], ["a", "B", "c", "d"]).map((x) => `${x.kind}:${x.text}`);
    expect(d).toEqual(["same:a", "del:b", "add:B", "same:c", "add:d"]);
  });
});
