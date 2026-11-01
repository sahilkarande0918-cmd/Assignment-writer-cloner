// Supported input matrix + signature (magic byte) checks. Shared by client and server.

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PAGES = 60;

export type InputKind = "pdf" | "docx" | "png" | "jpeg" | "webp" | "txt" | "md";

export const INPUT_FORMATS: Record<InputKind, { label: string; ext: string[]; mime: string[] }> = {
  pdf: { label: "PDF", ext: [".pdf"], mime: ["application/pdf"] },
  docx: {
    label: "Word (DOCX)",
    ext: [".docx"],
    mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  png: { label: "PNG", ext: [".png"], mime: ["image/png"] },
  jpeg: { label: "JPEG", ext: [".jpg", ".jpeg"], mime: ["image/jpeg"] },
  webp: { label: "WEBP", ext: [".webp"], mime: ["image/webp"] },
  txt: { label: "Plain text", ext: [".txt"], mime: ["text/plain"] },
  md: { label: "Markdown", ext: [".md"], mime: ["text/markdown", "text/x-markdown"] },
};


const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Identify a file by its leading bytes; returns null for anything unsupported. */
export function sniffKind(head: Uint8Array, filename: string): InputKind | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  const lower = filename.toLowerCase();
  // DOCX is a ZIP container; the docx-specific parts are verified when the archive is opened.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return lower.endsWith(".docx") ? "docx" : null;
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    // Text must not contain NUL bytes (binary/executable disguised as text).
    if (head.includes(0)) return null;
    return lower.endsWith(".md") ? "md" : "txt";
  }
  return null;
}

export type Validation = { ok: true; kind: InputKind } | { ok: false; reason: string };

export function validateUpload(head: Uint8Array, filename: string, size: number, allowed: InputKind[]): Validation {
  if (size === 0) return { ok: false, reason: "The file is empty." };
  if (size > MAX_FILE_BYTES) return { ok: false, reason: `Files are limited to ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  const kind = sniffKind(head, filename);
  if (!kind) return { ok: false, reason: "Unsupported or unrecognised file. Use PDF, DOCX, PNG, JPEG, WEBP, TXT or MD." };
  if (!allowed.includes(kind)) return { ok: false, reason: `${INPUT_FORMATS[kind].label} is not accepted here.` };
  return { ok: true, kind };
}

/** Keep only safe filename characters; never trust client paths. */
export function sanitizeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return clean.replace(/^\.+/, "") || "file";
}

export async function readHead(file: Blob, n = 16) {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}
