"use client";
import { MAX_PAGES, type InputKind } from "../formats";
import { docxFonts, docxSpans, openDocx, parseXml } from "./docx";
import { HANDWRITING_CONFIDENCE, itemsToLines, looksScanned, textToSpans, type DocModel, type RawItem, type Span } from "./model";
import { ocrPage } from "./ocr";

export type PagePreview = { url: string; width: number; height: number };
export type Loaded = { model: DocModel; previews: PagePreview[] };
export type Progress = (message: string) => void;

export class LoadError extends Error {}

const PREVIEW_SCALE = 1.5; // ~110 dpi previews
const OCR_SCALE = 2.5; // ~180 dpi for OCR

async function canvasToUrl(c: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) throw new LoadError("Could not render a page preview.");
  return URL.createObjectURL(blob);
}

async function loadPdf(file: Blob, progress: Progress, ocr: boolean): Promise<Loaded> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    fontExtraProperties: true, // keeps real font names for the font report
    cMapUrl: "/pdfjs/cmaps/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    if ((e as Error).name === "PasswordException") throw new LoadError("This PDF is password-protected. Remove the password and upload it again.");
    throw new LoadError("This PDF is corrupt or could not be read.");
  }
  if (pdf.numPages > MAX_PAGES) throw new LoadError(`PDFs are limited to ${MAX_PAGES} pages (this one has ${pdf.numPages}).`);

  const pages: DocModel["pages"] = [];
  const previews: PagePreview[] = [];
  const fonts = new Map<string, boolean | null>();
  let spans: Span[] = [];

  for (let p = 0; p < pdf.numPages; p++) {
    progress(`Reading page ${p + 1} of ${pdf.numPages}`);
    const page = await pdf.getPage(p + 1);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ width: vp.width, height: vp.height });
    const tc = await page.getTextContent();
    const items: RawItem[] = [];
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const [, , c, d, e, f] = it.transform as number[];
      const h = it.height || Math.hypot(c, d);
      // PDF space is bottom-left; convert to top-left using the page viewport.
      const [x, yBase] = vp.convertToViewportPoint(e, f);
      items.push({ str: it.str, x, y: yBase - h, w: it.width, h, font: tc.styles[it.fontName]?.fontFamily ?? it.fontName });
    }
    const pageSpans = itemsToLines(items, p);

    const canvas = document.createElement("canvas");
    const pv = page.getViewport({ scale: PREVIEW_SCALE });
    canvas.width = Math.floor(pv.width);
    canvas.height = Math.floor(pv.height);
    await page.render({ canvas, viewport: pv }).promise;
    previews.push({ url: await canvasToUrl(canvas), width: canvas.width, height: canvas.height });

    // After rendering, font objects are resolved: record names and whether a font file is embedded.
    for (const it of tc.items) {
      if (!("fontName" in it) || fonts.has(it.fontName)) continue;
      try {
        const f = page.commonObjs.get(it.fontName) as { name?: string; missingFile?: boolean };
        fonts.set(f.name ?? it.fontName, f.missingFile === undefined ? null : !f.missingFile);
      } catch {
        fonts.set(it.fontName, null);
      }
    }
    spans = spans.concat(pageSpans);
  }

  const warnings: string[] = [];
  let origin: DocModel["origin"] = "digital";
  let handwritingLikely: boolean | undefined;
  if (looksScanned(spans, pdf.numPages)) {
    origin = "scanned";
    if (!ocr) spans = [];
  }
  if (ocr && origin === "scanned") {
    spans = [];
    for (let p = 0; p < pdf.numPages; p++) {
      progress(`Recognising text on page ${p + 1} of ${pdf.numPages} (local OCR)`);
      // Re-render at OCR resolution; boxes are mapped back to PDF points.
      const page = await pdf.getPage(p + 1);
      const ov = page.getViewport({ scale: OCR_SCALE });
      const c = document.createElement("canvas");
      c.width = Math.floor(ov.width);
      c.height = Math.floor(ov.height);
      await page.render({ canvas: c, viewport: ov }).promise;
      spans = spans.concat(await ocrPage(c, p, OCR_SCALE));
    }
    handwritingLikely = meanConfidence(spans) < HANDWRITING_CONFIDENCE;
    warnings.push("Scanned PDF: text comes from OCR and edits will be reconstructions, not exact edits.");
  }
  const missing = [...fonts].filter(([, embedded]) => embedded === false).map(([n]) => n);
  if (missing.length) warnings.push(`Fonts not embedded (will be substituted on edit): ${missing.join(", ")}.`);
  await task.destroy();
  return { model: { kind: "pdf", origin, pages, spans, fonts: [...fonts].map(([name, embedded]) => ({ name, embedded })), warnings, handwritingLikely }, previews };
}

function meanConfidence(spans: Span[]) {
  const c = spans.map((s) => s.confidence ?? 0);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0;
}

async function loadImage(file: Blob, kind: InputKind, progress: Progress, ocr: boolean): Promise<Loaded> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LoadError("This image is corrupt or in an unsupported encoding.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  if (ocr) progress("Recognising text (local OCR)");
  const spans = ocr ? await ocrPage(canvas, 0) : [];
  const handwritingLikely = ocr ? meanConfidence(spans) < HANDWRITING_CONFIDENCE : undefined;
  return {
    // Image pages use source pixels as units.
    model: {
      kind,
      origin: "scanned",
      pages: [{ width: bitmap.width, height: bitmap.height }],
      spans,
      fonts: [],
      warnings: ["Photo/scan: text comes from OCR and edits will be reconstructions, not exact edits."],
      handwritingLikely,
    },
    previews: [{ url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height }],
  };
}

async function loadDocx(file: Blob): Promise<Loaded> {
  const { zip, xml } = await openDocx(await file.arrayBuffer());
  const spans = docxSpans(parseXml(xml));
  const fonts = docxFonts(await zip.file("word/fontTable.xml")?.async("string"));
  return {
    model: {
      kind: "docx",
      origin: "digital",
      pages: [],
      spans,
      fonts,
      warnings: ["DOCX preview is an approximation of Word's layout; edits are made to the original XML runs."],
    },
    previews: [],
  };
}

/** `ocr: false` renders previews only (used for style references, whose text is never needed). */
export async function loadDocument(file: Blob, kind: InputKind, progress: Progress = () => {}, ocr = true): Promise<Loaded> {
  try {
    if (kind === "pdf") return await loadPdf(file, progress, ocr);
    if (kind === "docx") return await loadDocx(file);
    if (kind === "txt" || kind === "md") {
      const spans = textToSpans(await file.text());
      return { model: { kind, origin: "text", pages: [{ width: 0, height: 0 }], spans, fonts: [], warnings: [] }, previews: [] };
    }
    return await loadImage(file, kind, progress, ocr);
  } catch (e) {
    if (e instanceof LoadError || (e as Error).name === "DocxError") throw e;
    throw new LoadError(`Could not read this file: ${(e as Error).message}`);
  }
}
