// Exports are written to disk and reopened by independent readers (PyMuPDF, python-docx, Pillow).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportDocument, exportUnavailable, type ExportSource } from "@/lib/export";
import type { DocModel } from "@/lib/doc/model";

const OUT = "test-results/exports";
mkdirSync(OUT, { recursive: true });

const pdfModel: DocModel = {
  kind: "pdf",
  origin: "digital",
  pages: [{ width: 595, height: 842 }, { width: 595, height: 842 }],
  spans: [
    { id: "a", page: 0, text: "Name: Aditya Kulkarni" },
    { id: "b", page: 1, text: "Conclusion: verified." },
  ],
  fonts: [],
  warnings: [],
};
const pdfSrc: ExportSource = { bytes: new Uint8Array(readFileSync("tests/fixtures/digital-2page.pdf")), kind: "pdf", model: pdfModel, name: "lab.pdf" };
const txtModel: DocModel = { kind: "txt", origin: "text", pages: [{ width: 0, height: 0 }], spans: [{ id: "l0", page: 0, text: "Aim: (verify) Ohm's law \\ test" }], fonts: [], warnings: [] };
const txtSrc: ExportSource = { bytes: new TextEncoder().encode("x"), kind: "txt", model: txtModel, name: "notes.txt" };

async function save(src: ExportSource, format: "pdf" | "png" | "jpeg" | "docx" | "txt" | "md", dpi = 100, pageSize: "A4" | "Letter" = "A4") {
  const r = await exportDocument(src, { format, dpi, pageSize });
  const path = `${OUT}/${r.filename}`;
  writeFileSync(path, new Uint8Array(await r.blob.arrayBuffer()));
  return { path, r };
}

let python: string | null = null;
for (const cmd of ["python", "py"]) {
  try {
    execFileSync(cmd, ["-c", "import fitz, docx, PIL"], { stdio: "ignore" });
    python = cmd;
    break;
  } catch {}
}
const verify = (paths: string[]) => JSON.parse(execFileSync(python!, ["-I", "scripts/verify_exports.py", ...paths], { encoding: "utf8", maxBuffer: 50e6 }));

describe.skipIf(!python)("exports reopen in independent readers", () => {
  it("native PDF passes through; PNG ZIP and JPEG per page at the chosen DPI", { timeout: 60_000 }, async () => {
    const pdf = await save(pdfSrc, "pdf");
    const png = await save(pdfSrc, "png", 150);
    const jpg = await save(pdfSrc, "jpeg", 72);
    expect(png.r.filename).toBe("lab-png.zip");
    const v = verify([pdf.path, png.path, jpg.path]);
    expect(v[pdf.path]).toMatchObject({ type: "pdf", pages: 2 });
    expect(v[pdf.path].text).toContain("Aditya Kulkarni");
    const pngs = Object.values(v[png.path].members) as { type: string; size: number[] }[];
    expect(pngs).toHaveLength(2);
    expect(pngs[0]).toMatchObject({ type: "png", size: [1241, 1754] }); // A4 (595.28 pt) at 150 dpi, rounded outward
    expect(Object.values(v[jpg.path].members)[0]).toMatchObject({ type: "jpeg", size: [596, 842] });
  });

  it("text sources typeset to PDF in the chosen page size; DOCX, TXT and MD exports reopen", { timeout: 60_000 }, async () => {
    const letter = await save(txtSrc, "pdf", 100, "Letter");
    const docx = await save(pdfSrc, "docx");
    const txt = await save(pdfSrc, "txt");
    const md = await save(pdfSrc, "md");
    const v = verify([letter.path, docx.path, txt.path, md.path]);
    expect(v[letter.path]).toMatchObject({ type: "pdf", pages: 1, size: [612, 792] });
    expect(v[letter.path].text).toContain("Aim: (verify) Ohm's law \\ test");
    expect(v[docx.path].paragraphs).toContain("Name: Aditya Kulkarni");
    expect(docx.r.note).toMatch(/Text only/);
    expect(v[txt.path].text).toBe("Name: Aditya Kulkarni\n\nConclusion: verified.");
    expect(v[md.path].text).toContain("## Page 2");
  });
});

describe("export availability", () => {
  it("explains formats that cannot be produced instead of offering broken buttons", () => {
    expect(exportUnavailable("docx", "pdf")).toMatch(/LibreOffice/);
    expect(exportUnavailable("docx", "docx")).toBeNull();
    expect(exportUnavailable("png", "pdf")).toBeNull();
  });
});
