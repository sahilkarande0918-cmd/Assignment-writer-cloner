import JSZip from "jszip";
import type { Span } from "./model";

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export class DocxError extends Error {
  name = "DocxError";
}

export async function openDocx(data: ArrayBuffer | Uint8Array) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new DocxError("This DOCX file is corrupt or not a Word document.");
  }
  if (zip.file("EncryptedPackage") || zip.file("EncryptionInfo")) throw new DocxError("Password-protected DOCX files are not supported.");
  const types = await zip.file("[Content_Types].xml")?.async("string");
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!types || !xml || !types.includes("wordprocessingml.document")) throw new DocxError("This ZIP file is not a Word (DOCX) document.");
  if (types.includes("vbaProject") || zip.file("word/vbaProject.bin")) throw new DocxError("Macro-enabled documents are not accepted.");
  return { zip, xml };
}

export function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new DocxError("The document XML could not be read.");
  return doc;
}

const kids = (el: Element, local: string) => Array.from(el.children).filter((c) => c.namespaceURI === W && c.localName === local);

/** Visible text of a paragraph: w:t, tabs and breaks, skipping deleted (tracked) runs. */
export function paragraphText(p: Element) {
  let out = "";
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === "del") continue;
      if (c.localName === "t") out += c.textContent ?? "";
      else if (c.localName === "tab") out += "\t";
      else if (c.localName === "br" || c.localName === "cr") out += "\n";
      else walk(c);
    }
  };
  walk(p);
  return out;
}

/** Body paragraphs become `b<i>` spans and table cells `t<t>r<r>c<c>`; indexes stay stable for editing. */
export function docxSpans(doc: Document): Span[] {
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) return [];
  const spans: Span[] = [];
  let table = 0;
  Array.from(body.children).forEach((el, i) => {
    if (el.namespaceURI !== W) return;
    if (el.localName === "p") {
      const text = paragraphText(el);
      if (text.trim()) spans.push({ id: `b${i}`, page: 0, text });
    }
    if (el.localName === "tbl") {
      kids(el, "tr").forEach((tr, r) =>
        kids(tr, "tc").forEach((tc, c) =>
          spans.push({ id: `t${table}r${r}c${c}`, page: 0, text: kids(tc, "p").map(paragraphText).join("\n"), cell: { table, row: r, col: c } }),
        ),
      );
      table++;
    }
  });
  return spans;
}

export function docxFonts(fontTableXml?: string) {
  if (!fontTableXml) return [];
  const doc = parseXml(fontTableXml);
  return Array.from(doc.getElementsByTagNameNS(W, "font")).map((f) => ({
    name: f.getAttributeNS(W, "name") ?? f.getAttribute("w:name") ?? "?",
    embedded: Array.from(f.children).some((c) => c.localName.startsWith("embed")),
  }));
}
