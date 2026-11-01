// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { docxSpans, openDocx, parseXml, W } from "@/lib/doc/docx";
import { docText, itemsToLines, looksScanned, textToSpans } from "@/lib/doc/model";

describe("itemsToLines", () => {
  it("groups items by baseline, orders them, and restores word gaps", () => {
    const lines = itemsToLines(
      [
        { str: "World", x: 60, y: 100, w: 30, h: 10, font: "Times" },
        { str: "Hello", x: 10, y: 101, w: 30, h: 10, font: "Times" },
        { str: "Second", x: 10, y: 120, w: 40, h: 10, font: "Arial" },
        { str: "  ", x: 0, y: 140, w: 5, h: 10, font: "Arial" },
      ],
      0,
    );
    expect(lines.map((l) => l.text)).toEqual(["Hello World", "Second"]);
    expect(lines[0].box).toEqual({ x: 10, y: 100, w: 80, h: 11 });
    expect(lines[1].font).toBe("Arial");
  });
});

describe("text helpers", () => {
  it("splits text files into line spans and rebuilds plain text per page", () => {
    const spans = textToSpans("a\r\n\r\nb\n");
    expect(spans.map((s) => s.text)).toEqual(["a", "b"]);
    expect(docText({ kind: "txt", origin: "text", pages: [{ width: 0, height: 0 }], spans, fonts: [], warnings: [] })).toBe("a\nb");
    expect(looksScanned([], 2)).toBe(true);
    expect(looksScanned([{ id: "x", page: 0, text: "x".repeat(50) }], 1)).toBe(false);
  });
});

const docXml = `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body>
<w:p><w:r><w:t>Name: </w:t></w:r><w:r><w:t>A. Kulkarni</w:t></w:r></w:p>
<w:p><w:r><w:t>Old</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:tab/><w:t>tail</w:t></w:r></w:p>
<w:p/>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>V</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>4.2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

const TYPES = `<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

async function docx(parts: Record<string, string>) {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(parts)) zip.file(k, v);
  return zip.generateAsync({ type: "uint8array" });
}

describe("docx", () => {
  it("extracts paragraphs (skipping tracked deletions) and table cells with stable ids", async () => {
    const { xml } = await openDocx(await docx({ "[Content_Types].xml": TYPES, "word/document.xml": docXml }));
    const spans = docxSpans(parseXml(xml));
    expect(spans.map((s) => [s.id, s.text])).toEqual([
      ["b0", "Name: A. Kulkarni"],
      ["b1", "Old\ttail"],
      ["t0r0c0", "V"],
      ["t0r0c1", "4.2"],
    ]);
  });
  it("rejects corrupt, non-Word, encrypted and macro documents", async () => {
    await expect(openDocx(new Uint8Array([1, 2, 3]))).rejects.toThrow(/corrupt/);
    await expect(openDocx(await docx({ "a.txt": "x" }))).rejects.toThrow(/not a Word/);
    await expect(openDocx(await docx({ EncryptedPackage: "x" }))).rejects.toThrow(/Password/);
    await expect(openDocx(await docx({ "[Content_Types].xml": TYPES + "vbaProject", "word/document.xml": docXml }))).rejects.toThrow(/Macro/);
  });
});
