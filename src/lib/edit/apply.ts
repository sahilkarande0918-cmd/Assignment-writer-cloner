"use client";
// Chooses the engine for a document and turns a reviewed plan into a new immutable file version.
import type { InputKind } from "../formats";
import type { DocModel } from "../doc/model";
import type { ResolvedOp } from "../plan";
import { editDocx } from "./docx";
import { editPlainText, toEdits, applyToText, type SpanEdit } from "./ops";
import { editPdf, loadMupdf } from "./pdf";
import { redrawLine } from "./raster";

export type OpReport = { opId: string; status: "applied" | "failed" | "skipped"; warnings: string[]; font?: { name: string; reused: boolean; substitute?: string } };
export type ApplyResult = { file: File; reports: OpReport[]; method: "native" | "reconstruction" | "text" };

const RASTER_SCALE = 3; // ~216 dpi re-render of scanned PDF pages

async function canvasBytes(c: HTMLCanvasElement, type: string) {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.95));
  if (!blob) throw new Error("Could not encode the edited page.");
  return new Uint8Array(await blob.arrayBuffer());
}

function rasterEdits(ctx: CanvasRenderingContext2D, edits: SpanEdit[], scale: number, reports: OpReport[]) {
  for (const e of edits) {
    if (e.newLine || !e.span.box) {
      reports.push({ opId: e.opId, status: "failed", warnings: ["Adding new lines to a scan is not supported here; use Handwriting Clone to write new pages."] });
      continue;
    }
    const r = redrawLine(ctx, e.span.box, applyToText(e.span.text, e), scale);
    reports.push({
      opId: e.opId,
      status: "applied",
      warnings: ["Reconstruction: the line was erased and redrawn in a typed font — not an exact edit.", ...(r?.overflow ? ["The new text runs past the page edge."] : [])],
    });
  }
}

async function editImage(file: File, edits: SpanEdit[], reports: OpReport[]) {
  const bitmap = await createImageBitmap(file);
  const c = document.createElement("canvas");
  [c.width, c.height] = [bitmap.width, bitmap.height];
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  rasterEdits(ctx, edits, 1, reports);
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return new File([(await canvasBytes(c, type)) as BlobPart], file.name.replace(/\.\w+$/, type === "image/jpeg" ? ".jpg" : ".png"), { type });
}

/** Scanned PDF: only edited pages are re-rendered and replaced by an image; other pages stay byte-identical objects. */
async function editScannedPdf(file: File, edits: SpanEdit[], reports: OpReport[]) {
  const mupdf = await loadMupdf();
  const doc = new mupdf.PDFDocument(new Uint8Array(await file.arrayBuffer()));
  const byPage = Map.groupBy(edits, (e) => e.span.page);
  for (const [p, pageEdits] of byPage) {
    const page = doc.loadPage(p) as import("mupdf").PDFPage;
    const [, , pw, ph] = page.getBounds();
    const pix = page.toPixmap(mupdf.Matrix.scale(RASTER_SCALE, RASTER_SCALE), mupdf.ColorSpace.DeviceRGB, true);
    const c = document.createElement("canvas");
    [c.width, c.height] = [pix.getWidth(), pix.getHeight()];
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pix.getPixels()), c.width, c.height), 0, 0);
    rasterEdits(ctx, pageEdits, RASTER_SCALE, reports);
    const img = doc.addImage(new mupdf.Image(await canvasBytes(c, "image/png")));
    const obj = page.getObject();
    obj.put("Resources", doc.addObject({ XObject: { Im0: img } }));
    obj.put("Contents", doc.addStream(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`, {}));
  }
  return new File([doc.saveToBuffer("garbage=compact,compress").asUint8Array() as BlobPart], file.name, { type: "application/pdf" });
}

export async function applyPlan(file: File, kind: InputKind, model: DocModel, ops: ResolvedOp[]): Promise<ApplyResult> {
  const { edits, skipped } = toEdits(ops, model.spans);
  const reports: OpReport[] = skipped.map((s) => ({ opId: s.opId, status: "skipped", warnings: [s.reason] }));
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (kind === "docx") {
    const r = await editDocx(bytes, edits);
    reports.push(...r.reports);
    return { file: new File([r.bytes as BlobPart], file.name, { type: file.type }), reports, method: "native" };
  }
  if (kind === "txt" || kind === "md") {
    edits.forEach((e) => reports.push({ opId: e.opId, status: "applied", warnings: [] }));
    return { file: new File([editPlainText(await file.text(), edits)], file.name, { type: file.type || "text/plain" }), reports, method: "text" };
  }
  if (kind === "pdf" && model.origin === "digital") {
    const r = await editPdf(bytes, edits);
    reports.push(...r.reports.map((x) => ({ opId: x.opId, status: x.status, warnings: x.warnings, font: x.font })));
    return { file: new File([r.bytes as BlobPart], file.name, { type: "application/pdf" }), reports, method: "native" };
  }
  if (kind === "pdf") return { file: await editScannedPdf(file, edits, reports), reports, method: "reconstruction" };
  return { file: await editImage(file, edits, reports), reports, method: "reconstruction" };
}

/** After reloading the new version, confirm each applied replacement is present in the extracted text. */
export function verifyApplied(model: DocModel, ops: ResolvedOp[], reports: OpReport[]) {
  const text = model.spans.map((s) => s.text).join("\n");
  return reports.map((r) => {
    const op = ops.find((o) => o.id === r.opId);
    if (r.status !== "applied" || !op) return { ...r, verified: false };
    const expect = op.type === "delete_text" ? null : op.replacement.trim();
    const verified = expect ? text.includes(expect) : !text.includes(op.match);
    return { ...r, verified };
  });
}
