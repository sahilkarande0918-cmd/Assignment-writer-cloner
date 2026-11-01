// Document model shared by previews, planning and editing. Coordinates are PDF points,
// origin top-left of the page, so PDF text, OCR boxes and overlays share one space.
import type { InputKind } from "../formats";

export type Box = { x: number; y: number; w: number; h: number };

/** A line of text (PDF/OCR), a paragraph or a table cell (DOCX). The unit plans target. */
export type Span = {
  id: string;
  page: number; // 0-based; DOCX/TXT have no real pages, so 0
  text: string;
  box?: Box;
  font?: string;
  size?: number;
  confidence?: number; // OCR only, 0..100
  cell?: { table: number; row: number; col: number };
};

export type Origin = "digital" | "scanned" | "text";

export type DocModel = {
  kind: InputKind;
  origin: Origin;
  pages: { width: number; height: number }[];
  spans: Span[];
  fonts: { name: string; embedded: boolean | null }[];
  warnings: string[];
  /** OCR heuristic, never a guarantee. Undefined for digital text. */
  handwritingLikely?: boolean;
};

export type RawItem = { str: string; x: number; y: number; w: number; h: number; font: string };

/** Merge PDF text items that share a baseline into line spans (reading order: top→bottom, left→right). */
export function itemsToLines(items: RawItem[], page: number): Span[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { items: RawItem[]; y: number; h: number }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, Math.min(l.h, it.h) * 0.5));
    if (line) line.items.push(it);
    else lines.push({ items: [it], y: it.y, h: it.h });
  }
  return lines.map((l, i) => {
    const parts = l.items.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | undefined;
    for (const p of parts) {
      // Insert a space when there is a visible gap and neither side already has one.
      if (prevEnd !== undefined && p.x - prevEnd > p.h * 0.15 && !text.endsWith(" ") && !p.str.startsWith(" ")) text += " ";
      text += p.str;
      prevEnd = p.x + p.w;
    }
    const x = Math.min(...parts.map((p) => p.x));
    const top = Math.min(...parts.map((p) => p.y));
    const right = Math.max(...parts.map((p) => p.x + p.w));
    const bottom = Math.max(...parts.map((p) => p.y + p.h));
    const font = mode(parts.map((p) => p.font));
    return { id: `p${page}l${i}`, page, text: text.trim(), box: { x, y: top, w: right - x, h: bottom - top }, font, size: Math.round(l.h * 10) / 10 };
  });
}

function mode<T>(xs: T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** Plain text for the whole document, pages separated by form feeds. */
export function docText(m: DocModel) {
  return m.pages.map((_, p) => m.spans.filter((s) => s.page === p).map((s) => s.text).join("\n")).join("\n\f\n");
}

/** Mean OCR word confidence below this suggests handwriting (heuristic, labelled as such in UI). */
export const HANDWRITING_CONFIDENCE = 72;

/** A PDF page with almost no extractable text is treated as a scan. */
export function looksScanned(spans: Span[], pageCount: number) {
  const chars = spans.reduce((n, s) => n + s.text.length, 0);
  return chars < 20 * pageCount;
}

export function textToSpans(text: string): Span[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, i) => ({ id: `l${i}`, page: 0, text: line }))
    .filter((s) => s.text.trim());
}
