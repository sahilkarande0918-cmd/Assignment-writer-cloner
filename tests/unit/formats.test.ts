import { describe, expect, it } from "vitest";
import { sanitizeFilename, sniffKind, validateUpload } from "@/lib/formats";

const bytes = (...b: number[]) => new Uint8Array([...b, ...Array(16).fill(0x20)]).slice(0, 16);
const ascii = (s: string) => new TextEncoder().encode(s.padEnd(16, " "));

describe("sniffKind", () => {
  it("recognises binary signatures regardless of extension", () => {
    expect(sniffKind(ascii("%PDF-1.7"), "x.bin")).toBe("pdf");
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "a.png")).toBe("png");
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0), "a.jpg")).toBe("jpeg");
    expect(sniffKind(ascii("RIFF....WEBPVP8 "), "a.webp")).toBe("webp");
  });
  it("only treats ZIPs as DOCX when named .docx", () => {
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04), "a.docx")).toBe("docx");
    expect(sniffKind(bytes(0x50, 0x4b, 0x03, 0x04), "a.zip")).toBeNull();
  });
  it("rejects executables and binary text impostors", () => {
    expect(sniffKind(ascii("MZ\x90\x00"), "setup.exe")).toBeNull();
    expect(sniffKind(bytes(0x4d, 0x5a, 0x00, 0x00), "notes.txt")).toBeNull();
    expect(sniffKind(ascii("# Heading"), "notes.md")).toBe("md");
  });
});

describe("validateUpload", () => {
  it("enforces size, emptiness and per-slot kinds", () => {
    expect(validateUpload(ascii("%PDF-"), "a.pdf", 0, ["pdf"]).ok).toBe(false);
    expect(validateUpload(ascii("%PDF-"), "a.pdf", 999 * 1024 * 1024, ["pdf"]).ok).toBe(false);
    expect(validateUpload(ascii("%PDF-"), "a.pdf", 1000, ["png"]).ok).toBe(false);
    expect(validateUpload(ascii("%PDF-"), "a.pdf", 1000, ["pdf"])).toEqual({ ok: true, kind: "pdf" });
  });
});

describe("sanitizeFilename", () => {
  it("strips paths, control and shell characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename(String.raw`C:\Users\x\My <Report>.pdf`)).toBe("My Report.pdf");
    expect(sanitizeFilename("...")).toBe("file");
  });
});
