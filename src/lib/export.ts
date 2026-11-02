// Deterministic exports. Native files are passed through unchanged; conversions are labelled best effort.
import JSZip from "jszip";
import type { InputKind } from "./formats";
import type { DocModel } from "./doc/model";
import type { ExportFormat, PageSize } from "./studio";
import { loadMupdf } from "./edit/pdf";

export const PAGE_PT: Record<PageSize, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792] };

export type ExportSource = { bytes: Uint8Array; kind: InputKind; model: DocModel; name: string };
export type ExportRequest = { format: ExportFormat; dpi: number; pageSize: PageSize };
export type ExportResult = { blob: Blob; filename: string; note?: string };

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain;charset=utf-8",
  md: "text/markdown;charset=utf-8",
};

/** Why a format cannot be produced for this source, or null when it can. Keeps the dialog honest. */
export function exportUnavailable(kind: InputKind, format: ExportFormat): string | null {
  if (kind === "docx" && (format === "pdf" || format === "png" || format === "jpeg"))
    return "Rendering DOCX to PDF/images needs LibreOffice, which only the local worker can run. Export DOCX, or print from Word.";
  return null;
}

const base = (name: string) => name.replace(/\.[^.]+$/, "") || "document";

function pagesText(model: DocModel) {
  const paged = model.kind === "pdf" || model.origin === "scanned";
  const count = paged ? model.pages.length : 1;
  return Array.from({ length: count }, (_, p) => model.spans.filter((s) => !paged || s.page === p).map((s) => s.text));
}

export async function imagesToPdf(images: Uint8Array[], size: PageSize) {
  const mupdf = await loadMupdf();
  const doc = new mupdf.PDFDocument();
  const [pw, ph] = PAGE_PT[size];
  for (const data of images) {
    const img = new mupdf.Image(data);
    const k = Math.min(pw / img.getWidth(), ph / img.getHeight());
    const [w, h] = [img.getWidth() * k, img.getHeight() * k];
    const res = doc.addObject({ XObject: { Im0: doc.addImage(img) } });
    const content = `q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${((pw - w) / 2).toFixed(3)} ${((ph - h) / 2).toFixed(3)} cm /Im0 Do Q`;
    doc.insertPage(-1, doc.addPage([0, 0, pw, ph], 0, res, content));
  }
  return doc.saveToBuffer("compress").asUint8Array();
}

/** Simple typeset PDF (Helvetica 11 pt, word-wrapped) for text-only sources. */
export async function textToPdf(pages: string[][], size: PageSize) {
  const mupdf = await loadMupdf();
  const doc = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  const fontRef = doc.addSimpleFont(font, "Latin");
  const [pw, ph] = PAGE_PT[size];
  const margin = 56, fs = 11, lead = 15, maxW = pw - margin * 2;
  const width = (s: string) => [...s].reduce((w, ch) => w + font.advanceGlyph(font.encodeCharacter(ch)) * fs, 0);
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e]/g, "?");
  const wrapped = pages.map((lines) =>
    lines.flatMap((line) => {
      const out: string[] = [];
      let cur = "";
      for (const word of line.split(/\s+/)) {
        const next = cur ? `${cur} ${word}` : word;
        if (width(next) > maxW && cur) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
      return out;
    }),
  );
  const perPage = Math.floor((ph - margin * 2) / lead);
  for (const lines of wrapped) {
    for (let i = 0; i < Math.max(1, lines.length); i += perPage) {
      const chunk = lines.slice(i, i + perPage);
      const body = chunk.map((l, j) => `1 0 0 1 ${margin} ${(ph - margin - fs - j * lead).toFixed(2)} Tm (${esc(l)}) Tj`).join("\n");
      const res = doc.addObject({ Font: { F1: fontRef } });
      doc.insertPage(-1, doc.addPage([0, 0, pw, ph], 0, res, `BT /F1 ${fs} Tf\n${body}\nET`));
    }
  }
  return doc.saveToBuffer("compress").asUint8Array();
}

export async function pdfToImages(bytes: Uint8Array, dpi: number, format: "png" | "jpeg") {
  const mupdf = await loadMupdf();
  const doc = new mupdf.PDFDocument(bytes);
  const k = dpi / 72;
  return Array.from({ length: doc.countPages() }, (_, i) => {
    const pix = doc.loadPage(i).toPixmap(mupdf.Matrix.scale(k, k), mupdf.ColorSpace.DeviceRGB, false);
    return format === "png" ? pix.asPNG() : pix.asJPEG(92);
  });
}

const xmlEsc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Minimal valid DOCX: one paragraph per line, page breaks between source pages. Layout is not preserved. */
export async function textToDocx(pages: string[][]) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const para = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r></w:p>`;
  const body = pages.map((lines, i) => (i ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` : "") + lines.map(para).join("")).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function zipped(name: string, files: Uint8Array[], ext: string): Promise<ExportResult> {
  if (files.length === 1) return { blob: new Blob([files[0] as BlobPart], { type: MIME[ext] }), filename: `${name}.${ext === "jpeg" ? "jpg" : ext}` };
  const zip = new JSZip();
  files.forEach((f, i) => zip.file(`${name}-page-${String(i + 1).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`, f));
  return { blob: await zip.generateAsync({ type: "blob" }), filename: `${name}-${ext}.zip` };
}

/** Handwriting Clone / Convert: the generated handwritten pages (PNG bytes) and the text they were written from. */
export async function exportGenerated(pages: Uint8Array[], text: string, name: string, req: ExportRequest): Promise<ExportResult> {
  if (!pages.length) throw new Error("Generate the handwriting first.");
  const n = `${base(name)}-handwritten`;
  switch (req.format) {
    case "pdf":
      return { blob: new Blob([(await imagesToPdf(pages, req.pageSize)) as BlobPart], { type: MIME.pdf }), filename: `${n}.pdf` };
    case "png":
    case "jpeg":
      return zipped(n, await pdfToImages(await imagesToPdf(pages, req.pageSize), req.dpi, req.format), req.format);
    case "docx":
      throw new Error("Handwritten pages are images: export PDF, PNG or JPEG.");
    case "txt":
      return { blob: new Blob([text.replace(/\f/g, "\n\n")], { type: MIME.txt }), filename: `${n}.txt` };
    case "md":
      return { blob: new Blob([text.replace(/\f/g, "\n\n---\n\n") + "\n"], { type: MIME.md }), filename: `${n}.md` };
  }
}

export async function exportDocument(src: ExportSource, req: ExportRequest): Promise<ExportResult> {
  const why = exportUnavailable(src.kind, req.format);
  if (why) throw new Error(why);
  const name = base(src.name);
  const pages = pagesText(src.model);
  const isImage = src.kind === "png" || src.kind === "jpeg" || src.kind === "webp";
  const text = src.kind === "txt" || src.kind === "md";

  // A PDF rendition of the source, used for PDF and image exports.
  const asPdf = async () => {
    if (src.kind === "pdf") return src.bytes;
    if (isImage) return imagesToPdf([src.bytes], req.pageSize);
    return textToPdf(pages, req.pageSize);
  };

  switch (req.format) {
    case "pdf": {
      const bytes = await asPdf();
      const note = src.kind === "pdf" ? "Native PDF: original page size kept." : text ? "Typeset in Helvetica; source formatting is not preserved." : undefined;
      return { blob: new Blob([bytes as BlobPart], { type: MIME.pdf }), filename: `${name}.pdf`, note };
    }
    case "png":
    case "jpeg":
      return zipped(name, await pdfToImages(await asPdf(), req.dpi, req.format), req.format);
    case "docx":
      if (src.kind === "docx") return { blob: new Blob([src.bytes as BlobPart], { type: MIME.docx }), filename: `${name}.docx` };
      return { blob: new Blob([(await textToDocx(pages)) as BlobPart], { type: MIME.docx }), filename: `${name}.docx`, note: "Text only: fonts, positions and tables are not reproduced." };
    case "txt":
      return { blob: new Blob([pages.map((l) => l.join("\n")).join("\n\n")], { type: MIME.txt }), filename: `${name}.txt` };
    case "md":
      return {
        blob: new Blob([`# ${name}\n\n` + pages.map((l, i) => (pages.length > 1 ? `## Page ${i + 1}\n\n` : "") + l.join("  \n")).join("\n\n") + "\n"], { type: MIME.md }),
        filename: `${name}.md`,
      };
  }
}
