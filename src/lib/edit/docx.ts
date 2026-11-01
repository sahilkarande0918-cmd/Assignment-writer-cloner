// DOCX edits on the original XML runs: formatting (rPr), styles, sections, headers/footers, images and
// every other part of the package stay as they were. Only word/document.xml is rewritten.
import { W, openDocx, parseXml } from "../doc/docx";
import type { SpanEdit } from "./ops";

export type DocxEditReport = { opId: string; status: "applied" | "failed"; warnings: string[] };

const isW = (el: Element, name: string) => el.namespaceURI === W && el.localName === name;
const child = (el: Element, name: string) => Array.from(el.children).filter((c) => isW(c, name));

/** Visible w:t nodes of a paragraph in order, skipping tracked deletions. */
function textNodes(p: Element): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI !== W || c.localName === "del") continue;
      if (c.localName === "t") out.push(c);
      else walk(c);
    }
  };
  walk(p);
  return out;
}

function setText(t: Element, text: string) {
  t.textContent = text;
  if (/^\s|\s$/.test(text)) t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
}

/** Replace `match` inside a paragraph; the replacement inherits the formatting of the run where the match starts. */
function replaceInParagraph(p: Element, match: string, replacement: string, all: boolean): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const nodes = textNodes(p);
    const full = nodes.map((n) => n.textContent ?? "").join("");
    const start = full.indexOf(match, from);
    if (start < 0) return count;
    const end = start + match.length;
    from = start + replacement.length;
    let pos = 0;
    let placed = false;
    for (const node of nodes) {
      const text = node.textContent ?? "";
      const a = pos, b = pos + text.length;
      pos = b;
      if (b <= start || a >= end) continue;
      const keepBefore = text.slice(0, Math.max(0, start - a));
      const keepAfter = text.slice(Math.max(0, Math.min(text.length, end - a)));
      setText(node, keepBefore + (placed ? "" : replacement) + keepAfter);
      placed = true;
    }
    count++;
    if (!all || !match) return count;
  }
}

function locate(body: Element, spanId: string): Element[] {
  const kids = Array.from(body.children);
  const para = /^b(\d+)$/.exec(spanId);
  if (para) {
    const el = kids[Number(para[1])];
    return el && isW(el, "p") ? [el] : [];
  }
  const cell = /^t(\d+)r(\d+)c(\d+)$/.exec(spanId);
  if (!cell) return [];
  const tbl = kids.filter((k) => isW(k, "tbl"))[Number(cell[1])];
  const tc = tbl && child(child(tbl, "tr")[Number(cell[2])] ?? tbl, "tc")[Number(cell[3])];
  return tc ? child(tc, "p") : [];
}

export async function editDocx(bytes: Uint8Array, edits: SpanEdit[]): Promise<{ bytes: Uint8Array; reports: DocxEditReport[] }> {
  const { zip, xml } = await openDocx(bytes);
  const doc = parseXml(xml);
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  const reports: DocxEditReport[] = [];
  const removals: Element[] = [];

  // Locate everything before mutating so indexes in span ids stay valid.
  const located = edits.map((e) => ({ e, paras: locate(body, e.span.id) }));
  for (const { e, paras } of located) {
    const report: DocxEditReport = { opId: e.opId, status: "failed", warnings: [] };
    reports.push(report);
    if (!paras.length) {
      report.warnings.push("The paragraph or table cell no longer exists.");
      continue;
    }
    if (e.newLine) {
      const p = paras.at(-1)!;
      const clone = p.cloneNode(true) as Element;
      const nodes = textNodes(clone);
      // Keep paragraph + first run formatting; drop every other run's text.
      nodes.forEach((n, i) => setText(n, i === 0 ? e.replacement : ""));
      if (!nodes.length) {
        report.warnings.push("Could not copy the paragraph formatting for the new line.");
        continue;
      }
      p.after(clone);
      report.status = "applied";
      continue;
    }
    const hit = paras.find((p) => textNodes(p).map((n) => n.textContent).join("").includes(e.match));
    if (!hit) {
      report.warnings.push("The text spans a tab, line break or field and could not be matched exactly in the runs.");
      continue;
    }
    const whole = textNodes(hit).map((n) => n.textContent).join("");
    replaceInParagraph(hit, e.match, e.replacement, e.all);
    // Deleting a whole body paragraph removes the paragraph itself (cells must keep one paragraph).
    if (!e.replacement && whole.trim() === e.match.trim() && hit.parentElement === body) removals.push(hit);
    report.status = "applied";
  }
  removals.forEach((p) => p.remove());

  const declaration = xml.startsWith("<?xml") ? xml.slice(0, xml.indexOf("?>") + 2) : "";
  zip.file("word/document.xml", declaration + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>/, ""));
  const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { bytes: out, reports };
}
