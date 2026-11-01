// Native edits on digital PDFs with MuPDF (WASM, browser or Node).
// Only the changed glyphs are redacted (text-only: line art and images are kept), then the new text is
// drawn at the original baseline, reusing the original embedded font whenever it contains every glyph.
import type * as MuPDF from "mupdf";
import type { SpanEdit } from "./ops";
import { itemsToLines } from "../doc/model";
import { applyToText } from "./ops";

type Mu = typeof MuPDF;
type Char = { c: string; x: number; y: number; font: MuPDF.Font; size: number; color: number[]; quad: number[] };
type Line = { chars: Char[]; text: string; bbox: number[] };

export type PdfEditReport = {
  opId: string;
  page: number;
  status: "applied" | "failed";
  font?: { name: string; reused: boolean; substitute?: string };
  widthDelta?: number;
  warnings: string[];
};

/** Browser: load MuPDF from /public at runtime (never bundled). Node (tests): the npm package. */
export async function loadMupdf(): Promise<Mu> {
  const url = typeof window === "undefined" ? "mupdf" : "/mupdf/mupdf.js";
  return import(/* webpackIgnore: true */ url);
}

// Windows-1252 code points outside Latin-1 that MuPDF's Latin simple encoding supports.
const CP1252: Record<string, number> = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };

export function encodeLatin(text: string): Uint8Array | null {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) out.push(cp);
    else if (CP1252[ch]) out.push(CP1252[ch]);
    else return null;
  }
  return Uint8Array.from(out);
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

function readLines(page: MuPDF.PDFPage): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  page.toStructuredText("preserve-whitespace").walk({
    beginLine: (bbox) => {
      cur = { chars: [], text: "", bbox: [...bbox] };
    },
    onChar: (c, origin, font, size, quad, color) => {
      cur!.chars.push({ c, x: origin[0], y: origin[1], font, size, color: [...color], quad: [...quad] });
      cur!.text += c;
    },
    endLine: () => {
      if (cur?.chars.length) lines.push(cur);
      cur = null;
    },
  });
  return lines;
}

const overlaps = (a: number[], b: { x: number; y: number; w: number; h: number }) => a[0] < b.x + b.w && a[2] > b.x && a[1] < b.y + b.h && a[3] > b.y;

function charRect(cs: Char[]): [number, number, number, number] {
  const xs = cs.flatMap((c) => [c.quad[0], c.quad[2], c.quad[4], c.quad[6]]);
  const ys = cs.flatMap((c) => [c.quad[1], c.quad[3], c.quad[5], c.quad[7]]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Pick a standard-14 substitute that resembles the original font. */
function substituteName(f: MuPDF.Font) {
  const b = f.isBold(), i = f.isItalic();
  if (f.isMono()) return ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"][(+b) + 2 * (+i)];
  if (f.isSerif()) return ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"][(+b) + 2 * (+i)];
  return ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"][(+b) + 2 * (+i)];
}

// Subset fonts ("ABCDEF+Name") keep cmap entries for glyphs they dropped, so only characters the
// document already draws with that font are trusted; full embedded fonts are checked via their cmap.
const isSubset = (f: MuPDF.Font) => /^[A-Z]{6}\+/.test(f.getName());
const hasGlyphs = (f: MuPDF.Font, text: string, used: Map<string, Set<string>>) =>
  [...text].every((ch) => ch === " " || (isSubset(f) ? !!used.get(f.getName())?.has(ch) : f.encodeCharacter(ch) > 0));

type Segment = { text: string; font: MuPDF.Font; size: number; color: number[] };

/** Edit a digital PDF. Edits must target text lines (spans with boxes) from the PDF loader. */
export async function editPdf(bytes: Uint8Array, edits: SpanEdit[]): Promise<{ bytes: Uint8Array; reports: PdfEditReport[] }> {
  const mupdf = await loadMupdf();
  const doc = new mupdf.PDFDocument(bytes);
  const reports: PdfEditReport[] = [];
  const byPage = new Map<number, SpanEdit[]>();
  for (const e of edits) byPage.set(e.span.page, [...(byPage.get(e.span.page) ?? []), e]);

  // Characters each font already draws anywhere in the document.
  const used = new Map<string, Set<string>>();
  for (let p = 0; p < doc.countPages(); p++)
    for (const l of readLines(doc.loadPage(p) as MuPDF.PDFPage)) for (const c of l.chars) {
      const k = c.font.getName();
      if (!used.has(k)) used.set(k, new Set());
      used.get(k)!.add(c.c);
    }

  let fontSeq = 0;
  for (const [p, pageEdits] of byPage) {
    const page = doc.loadPage(p) as MuPDF.PDFPage;
    const [, , pw] = page.getBounds();
    const m = page.getTransform();
    if (Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6) {
      for (const e of pageEdits) reports.push({ opId: e.opId, page: p, status: "failed", warnings: ["Rotated pages are not supported for native edits yet."] });
      continue;
    }
    const toPdf = mupdf.Matrix.invert(m);
    const lines = readLines(page);
    const draws: { segs: Segment[]; x: number; y: number; report: PdfEditReport; oldEnd?: number }[] = [];

    for (const e of pageEdits) {
      const report: PdfEditReport = { opId: e.opId, page: p, status: "failed", warnings: [] };
      reports.push(report);
      const box = e.span.box;
      const candidates = lines.filter((l) => (!box || overlaps(l.bbox, box)) && (e.newLine ? true : l.text.includes(e.match)));
      const line = e.newLine ? candidates.at(-1) : candidates[0];
      if (!line) {
        report.warnings.push("The text was not found at its recorded position; nothing was changed.");
        continue;
      }

      if (e.newLine) {
        // New line below: only when the band is free, otherwise it would overlap existing content.
        const first = line.chars[0];
        const gap = first.size * 1.35;
        const band = [line.bbox[0], line.bbox[3] + 1, pw, line.bbox[3] + gap + 1];
        if (lines.some((l) => l !== line && l.bbox[1] < band[3] && l.bbox[3] > band[1] && l.bbox[2] > band[0])) {
          report.warnings.push("There is no free space below this line to insert text without overlapping. Use a DOCX source or shorten the page first.");
          continue;
        }
        draws.push({ segs: [{ text: e.replacement, font: first.font, size: first.size, color: first.color }], x: first.x, y: first.y + gap, report });
        continue;
      }

      // Redact from the first changed character to the end of the line, then redraw replacement + tail.
      const start = line.text.indexOf(e.match);
      const newTail = applyToText(line.text.slice(start), e);
      const changed = line.chars.slice(start);
      const anchor = changed[0];
      const segs: Segment[] = [];
      const firstLen = newTail.length - (line.text.length - start - e.match.length);
      // Replacement takes the style of the first replaced glyph; the untouched tail keeps its own runs.
      if (e.all) segs.push({ text: newTail, font: anchor.font, size: anchor.size, color: anchor.color });
      else {
        if (firstLen > 0) segs.push({ text: newTail.slice(0, firstLen), font: anchor.font, size: anchor.size, color: anchor.color });
        for (const ch of line.chars.slice(start + e.match.length)) {
          const last = segs.at(-1);
          if (last && last.font === ch.font && last.size === ch.size && last.color.join() === ch.color.join()) last.text += ch.c;
          else segs.push({ text: ch.c, font: ch.font, size: ch.size, color: ch.color });
        }
      }
      const rect = charRect(changed);
      page.createAnnotation("Redact").setRect(rect);
      draws.push({ segs, x: anchor.x, y: anchor.y, report, oldEnd: rect[2] });
    }

    // Text-only redaction: keep images and every vector path (rules, borders, underlines).
    page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE);

    const pageObj = page.getObject();
    let res = pageObj.get("Resources");
    if (res.isNull()) {
      res = doc.newDictionary();
      const inherited = pageObj.getInheritable("Resources");
      if (!inherited.isNull()) inherited.forEach((v, k) => res.put(k, v));
      pageObj.put("Resources", res);
    }
    let fonts = res.get("Font");
    if (fonts.isNull()) {
      fonts = doc.newDictionary();
      res.put("Font", fonts);
    }

    const fontRefs = new Map<MuPDF.Font | string, string>();
    const resourceFor = (f: MuPDF.Font | string) => {
      let name = fontRefs.get(f);
      if (!name) {
        name = `ASF${++fontSeq}`;
        fonts.put(name, doc.addSimpleFont(typeof f === "string" ? new mupdf.Font(f) : f, "Latin"));
        fontRefs.set(f, name);
      }
      return name;
    };

    let ops = "";
    for (const d of draws) {
      let x = d.x;
      let ok = true;
      for (const seg of d.segs) {
        const bytes = encodeLatin(seg.text);
        if (!bytes) {
          d.report.warnings.push("The new text contains characters this PDF engine cannot encode (only Latin text is supported).");
          ok = false;
          break;
        }
        const reuse = hasGlyphs(seg.font, seg.text.replace(/ /g, ""), used);
        const sub = reuse ? null : substituteName(seg.font);
        const font = reuse ? seg.font : new mupdf.Font(sub!);
        if (!d.report.font) d.report.font = { name: seg.font.getName(), reused: reuse, ...(sub ? { substitute: sub } : {}) };
        else if (!reuse) d.report.font = { ...d.report.font, reused: false, substitute: sub! };
        const name = resourceFor(reuse ? seg.font : sub!);
        const [r, g, b] = seg.color.length >= 3 ? seg.color : [0, 0, 0];
        // Words are placed one by one so a subset font without a space glyph still spaces correctly.
        const spaceAdv = (font.encodeCharacter(" ") > 0 ? font.advanceGlyph(font.encodeCharacter(" ")) : 0.25) * seg.size;
        for (const [i, word] of seg.text.split(" ").entries()) {
          if (i > 0) x += spaceAdv;
          if (!word) continue;
          const [px, py] = [toPdf[0] * x + toPdf[2] * d.y + toPdf[4], toPdf[1] * x + toPdf[3] * d.y + toPdf[5]];
          ops += `BT /${name} ${n(seg.size)} Tf ${n(r)} ${n(g)} ${n(b)} rg 1 0 0 1 ${n(px)} ${n(py)} Tm <${hex(encodeLatin(word)!)}> Tj ET\n`;
          for (const ch of word) x += font.advanceGlyph(font.encodeCharacter(ch)) * seg.size;
        }
      }
      if (!ok) continue;
      d.report.status = "applied";
      if (d.oldEnd !== undefined) {
        d.report.widthDelta = Math.round((x - d.oldEnd) * 10) / 10;
        if (d.report.widthDelta > 2) d.report.warnings.push(`The line is ${d.report.widthDelta} pt longer than before — check it does not cross a table border or margin.`);
      }
      if (x > pw - 4) d.report.warnings.push("The new text runs past the page edge.");
      if (d.report.font && !d.report.font.reused) d.report.warnings.push(`Font substituted: ${d.report.font.name} → ${d.report.font.substitute} (missing glyphs or not embeddable).`);
    }

    if (ops) {
      // Isolate the original content's graphics state, then append ours.
      const contents = pageObj.get("Contents");
      const arr = doc.newArray();
      arr.push(doc.addStream("q\n", {}));
      if (contents.isArray()) contents.forEach((v) => arr.push(v));
      else if (!contents.isNull()) arr.push(contents);
      arr.push(doc.addStream("Q\n", {}));
      arr.push(doc.addStream(ops, {}));
      pageObj.put("Contents", arr);
    }
  }
  const out = doc.saveToBuffer("garbage=compact,compress").asUint8Array();
  return { bytes: new Uint8Array(out), reports };
}

/** Text per page in geometric reading order (same line grouping as the PDF.js loader), for round-trip checks. */
export async function pdfPageTexts(bytes: Uint8Array) {
  const mupdf = await loadMupdf();
  const doc = new mupdf.PDFDocument(bytes);
  return Array.from({ length: doc.countPages() }, (_, p) => {
    const lines = readLines(doc.loadPage(p) as MuPDF.PDFPage);
    const items = lines.flatMap((l) =>
      l.chars.map((c) => {
        const [x0, y0, x1, y1] = charRect([c]);
        return { str: c.c, x: x0, y: y0, w: x1 - x0, h: y1 - y0, font: c.font.getName() };
      }),
    );
    return itemsToLines(items, p).map((l) => l.text).join("\n");
  });
}
