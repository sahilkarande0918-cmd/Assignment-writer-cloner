import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import { editPdf, encodeLatin, pdfPageTexts } from "@/lib/edit/pdf";
import type { SpanEdit } from "@/lib/edit/ops";
import type { Span } from "@/lib/doc/model";

const SRC = new Uint8Array(readFileSync("tests/fixtures/digital-2page.pdf"));

// Spans as the browser loader would produce them (top-left page coordinates, points).
const lineOf = async (page: number, contains: string): Promise<Span> => {
  const doc = new mupdf.PDFDocument(SRC);
  let found: Span | undefined;
  const json = JSON.parse(doc.loadPage(page).toStructuredText("preserve-whitespace").asJSON()) as { blocks: { lines: { text: string; bbox: { x: number; y: number; w: number; h: number } }[] }[] };
  for (const b of json.blocks) for (const l of b.lines) if (!found && l.text.includes(contains)) found = { id: "x", page, text: l.text, box: l.bbox };
  if (!found) throw new Error(`no line with ${contains}`);
  return found;
};

const edit = (span: Span, match: string, replacement: string, opId = "op1", extra: Partial<SpanEdit> = {}): SpanEdit => ({ opId, span, match, replacement, all: false, ...extra });

/** Render a page and return RGB pixels. */
function pixels(bytes: Uint8Array, page: number) {
  const doc = new mupdf.PDFDocument(bytes);
  const pix = doc.loadPage(page).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
  return { w: pix.getWidth(), h: pix.getHeight(), px: pix.getPixels() as Uint8ClampedArray };
}

/** Count differing pixels outside an excluded rectangle (page points). */
function diffOutside(a: ReturnType<typeof pixels>, b: ReturnType<typeof pixels>, ex: number[]) {
  let diff = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      const inside = x / 2 >= ex[0] && x / 2 <= ex[2] && y / 2 >= ex[1] && y / 2 <= ex[3];
      if (inside) continue;
      const i = (y * a.w + x) * 3;
      if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]) > 30) diff++;
    }
  return diff;
}

describe("editPdf (MuPDF)", () => {
  it("replaces a name in place with the original embedded font and leaves the rest of the page untouched", async () => {
    const span = await lineOf(0, "Name: Aditya Kulkarni");
    const { bytes, reports } = await editPdf(SRC, [edit(span, "Aditya Kulkarni", "Sahil Karande")]);
    expect(reports[0]).toMatchObject({ status: "applied", font: { reused: true } });
    const texts = await pdfPageTexts(bytes);
    expect(texts[0]).toContain("Name: Sahil Karande");
    expect(texts[0]).not.toContain("Aditya");
    expect(texts[0]).toContain("PRN: 22010173");
    expect(texts[1]).toContain("Conclusion: Current varies linearly with voltage.");
    // Pixel diff outside the edited line must be zero; page 2 must be identical.
    const b = span.box!;
    expect(diffOutside(pixels(SRC, 0), pixels(bytes, 0), [b.x - 2, b.y - 2, b.x + b.w + 80, b.y + b.h + 2])).toBe(0);
    expect(diffOutside(pixels(SRC, 1), pixels(bytes, 1), [0, 0, -1, -1])).toBe(0);
  });

  it("edits a table cell without erasing the table borders", async () => {
    const span = await lineOf(0, "4.2");
    const { bytes, reports } = await editPdf(SRC, [edit(span, "4.2", "4.7")]);
    expect(reports[0].status).toBe("applied");
    expect((await pdfPageTexts(bytes))[0]).toContain("4.7");
    const b = span.box!;
    // Only glyph pixels inside the cell may change; borders run along the cell edges outside this inset box.
    expect(diffOutside(pixels(SRC, 0), pixels(bytes, 0), [b.x - 1, b.y - 1, b.x + b.w + 1, b.y + b.h + 1])).toBe(0);
  });

  it("substitutes a standard font when the embedded subset lacks glyphs, and says so", async () => {
    const span = await lineOf(0, "PRN: 22010173");
    const { bytes, reports } = await editPdf(SRC, [edit(span, "22010173", "QZ-9X")]);
    expect(reports[0].status).toBe("applied");
    expect(reports[0].font).toMatchObject({ reused: false });
    expect(reports[0].warnings.join(" ")).toMatch(/Font substituted/);
    expect((await pdfPageTexts(bytes))[0]).toContain("QZ-9X");
  });

  it("refuses to insert a new line where it would overlap existing text", async () => {
    const span = await lineOf(0, "Name: Aditya Kulkarni");
    const { reports } = await editPdf(SRC, [edit(span, "", "Division: B", "op1", { newLine: true })]);
    expect(reports[0].status).toBe("failed");
    expect(reports[0].warnings[0]).toMatch(/no free space/);
  });

  it("inserts a new line below the last line when space is free", async () => {
    const span = await lineOf(1, "Conclusion");
    const { bytes, reports } = await editPdf(SRC, [edit(span, "", "Precautions: connections should be tight.", "op1", { newLine: true })]);
    expect(reports[0].status).toBe("applied");
    expect((await pdfPageTexts(bytes))[1]).toContain("Precautions: connections should be tight.");
  });

  it("reports text that is not at its recorded position instead of guessing", async () => {
    const span = await lineOf(0, "Name: Aditya Kulkarni");
    const { reports } = await editPdf(SRC, [edit({ ...span, box: { x: 0, y: 700, w: 10, h: 10 } }, "Aditya", "X")]);
    expect(reports[0].status).toBe("failed");
  });

  it("encodes Latin text and rejects scripts it cannot embed", () => {
    expect(Array.from(encodeLatin("Aé€")!)).toEqual([0x41, 0xe9, 0x80]);
    expect(encodeLatin("नमस्ते")).toBeNull();
  });
});
