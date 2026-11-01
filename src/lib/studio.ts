import type { InputKind } from "./formats";

export type Mode = "edit" | "clone" | "convert" | "digital";
export type Slot = "source" | "reference" | "paper";

export const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "edit", label: "Edit Assignment", blurb: "Change parts of an existing handwritten or digital assignment." },
  { id: "clone", label: "Handwriting Clone", blurb: "Write new content in a handwriting style learned from your reference." },
  { id: "convert", label: "Convert Handwriting", blurb: "Keep assignment 1's content, rewrite it in assignment 2's handwriting." },
  { id: "digital", label: "Digital Studio", blurb: "Edit typed PDFs and DOCX while keeping fonts and layout." },
];

export type SlotSpec = { slot: Slot; title: string; hint: string; required: boolean; accept: InputKind[] };

const ALL: InputKind[] = ["pdf", "docx", "png", "jpeg", "webp", "txt", "md"];
const VISUAL: InputKind[] = ["pdf", "png", "jpeg", "webp"];

/** Which upload cards a mode shows. `textToAssignment` only matters in clone mode. */
export function slotsFor(mode: Mode, textToAssignment: boolean): SlotSpec[] {
  if (mode === "digital") {
    return [{ slot: "source", title: "Digital document", hint: "Typed PDF, DOCX, TXT or MD", required: true, accept: ["pdf", "docx", "txt", "md"] }];
  }
  if (mode === "edit") {
    return [
      { slot: "source", title: "Original assignment", hint: "Handwritten scan/photo or digital file", required: true, accept: ALL },
      { slot: "reference", title: "Reference style", hint: "Optional handwriting or paper sample", required: false, accept: VISUAL },
    ];
  }
  if (mode === "convert") {
    return [
      { slot: "source", title: "Assignment 1 — content", hint: "Its text is kept; its handwriting is replaced", required: true, accept: ALL },
      { slot: "reference", title: "Assignment 2 — handwriting", hint: "Only its writing style is used, never its text", required: true, accept: VISUAL },
    ];
  }
  const clone: SlotSpec[] = [
    { slot: "reference", title: "Reference handwriting", hint: "Your authorised handwriting pages (PDF or image)", required: true, accept: VISUAL },
    { slot: "paper", title: "Paper page", hint: "Optional — blank or used sheet; only the paper is reused", required: false, accept: VISUAL },
  ];
  if (!textToAssignment) {
    clone.unshift({ slot: "source", title: "Source to edit", hint: "Existing assignment to rewrite in this style", required: true, accept: ALL });
  }
  return clone;
}

export type PageSize = "A4" | "Letter";
export type PaperStyle = "ruled" | "grid" | "plain" | "reference" | "source";

export type LayoutSettings = {
  pageSize: PageSize;
  paper: PaperStyle;
  marginLeftMm: number;
  marginTopMm: number;
  lineSpacingMm: number;
  penColor: string;
  sizePt: number;
  align: "left" | "justify";
  /** Convert mode: keep the content assignment's line/page breaks instead of reflowing. */
  keepLineBreaks: boolean;
};

export const DEFAULT_LAYOUT: LayoutSettings = {
  pageSize: "A4",
  paper: "ruled",
  marginLeftMm: 25,
  marginTopMm: 30,
  lineSpacingMm: 8,
  penColor: "#1f2f5c",
  sizePt: 14,
  align: "left",
  keepLineBreaks: true,
};

export const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
};

export const PEN_COLORS = [
  { label: "Blue-black", value: "#1f2f5c" },
  { label: "Royal blue", value: "#1d3fae" },
  { label: "Black", value: "#1b1a18" },
  { label: "Red", value: "#a32424" },
  { label: "Green", value: "#2f6b3a" },
];

export type ExportFormat = "pdf" | "png" | "jpeg" | "docx" | "txt" | "md";

/** Number of writable ruled lines on one page for the given layout. */
export function linesPerPage(s: LayoutSettings) {
  const usable = PAGE_MM[s.pageSize].h - s.marginTopMm - 15; // 15 mm bottom margin
  return Math.max(1, Math.floor(usable / s.lineSpacingMm));
}

/** What still blocks planning for the current inputs; empty = ready. */
export function missingInputs(mode: Mode, textToAssignment: boolean, filled: Partial<Record<Slot, unknown>>, text: string) {
  const missing = slotsFor(mode, textToAssignment)
    .filter((s) => s.required && !filled[s.slot])
    .map((s) => s.title);
  // Convert mode needs no instruction: the content comes from assignment 1's transcript.
  if (mode !== "convert" && !text.trim()) missing.push(mode === "clone" && textToAssignment ? "Assignment content" : "Instruction");
  return missing;
}
