"use client";
// Local OCR (Tesseract wasm). Images never leave the browser; only the English model is fetched.
import type { Worker } from "tesseract.js";
import type { Span } from "./model";

let worker: Promise<Worker> | undefined;

function getWorker() {
  worker ??= import("tesseract.js").then((t) => t.createWorker("eng"));
  return worker;
}

/** OCR one page image. `scale` maps image pixels back to page units. */
export async function ocrPage(image: HTMLCanvasElement | Blob, page: number, scale = 1): Promise<Span[]> {
  const w = await getWorker();
  const { data } = await w.recognize(image, {}, { blocks: true });
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  return lines
    .filter((l) => l.text.trim())
    .map((l, i) => ({
      id: `p${page}l${i}`,
      page,
      text: l.text.trim(),
      confidence: Math.round(l.confidence),
      box: { x: l.bbox.x0 / scale, y: l.bbox.y0 / scale, w: (l.bbox.x1 - l.bbox.x0) / scale, h: (l.bbox.y1 - l.bbox.y0) / scale },
    }));
}
