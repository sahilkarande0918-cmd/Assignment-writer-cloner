"use client";
// Renders one page of an upload to a JPEG small enough to send to the job API (Vercel ~4.5 MB body limit).
import type { InputKind } from "../formats";
import { loadMupdf } from "../edit/pdf";

export async function pageImage(file: Blob, kind: InputKind, page = 0, maxSide = 2200): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number };
  if (kind === "pdf") {
    const mupdf = await loadMupdf();
    const doc = new mupdf.PDFDocument(new Uint8Array(await file.arrayBuffer()));
    if (page >= doc.countPages()) throw new Error(`The PDF has no page ${page + 1}.`);
    const p = doc.loadPage(page);
    const [, , w, h] = p.getBounds();
    const k = maxSide / Math.max(w, h);
    const png = p.toPixmap(mupdf.Matrix.scale(k, k), mupdf.ColorSpace.DeviceRGB, false).asPNG();
    source = await createImageBitmap(new Blob([png as BlobPart], { type: "image/png" }));
  } else if (kind === "png" || kind === "jpeg" || kind === "webp") {
    source = await createImageBitmap(file);
  } else throw new Error("Handwriting and paper references must be PDF pages or images.");

  const k = Math.min(1, maxSide / Math.max(source.width, source.height));
  const c = document.createElement("canvas");
  [c.width, c.height] = [Math.round(source.width * k), Math.round(source.height * k)];
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  for (const q of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 1_800_000) return blob;
  }
  throw new Error("The page image is too large to send; use a smaller scan.");
}
