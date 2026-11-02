// Handwriting job contract shared by the studio (client) and the job API (server). Mirrors workers/handwriting/hw/pipeline.py.
import { z } from "zod";

export const HwPayloadSchema = z.object({
  text: z.string().min(1).max(20_000),
  pageSize: z.enum(["A4", "Letter"]),
  paper: z.enum(["ruled", "grid", "plain", "reference", "source"]),
  marginLeftMm: z.number().min(5).max(60),
  marginTopMm: z.number().min(5).max(80),
  lineSpacingMm: z.number().min(5).max(15),
  penColor: z.union([z.literal("match"), z.string().regex(/^#[0-9a-f]{6}$/i)]),
  sizePt: z.number().min(8).max(24),
  keepLineBreaks: z.boolean(),
  seed: z.number().int().min(0).max(2 ** 31 - 1),
  /** Samples per word; the worker keeps the one its word checker reads best (1 = no selection). */
  candidates: z.number().int().min(1).max(8),
  /** occurrence id -> extra re-seed count, for "regenerate this line". */
  bumps: z.record(z.string(), z.number().int().min(0).max(1000)),
});
export type HwPayload = z.infer<typeof HwPayloadSchema>;

export const MAX_JOB_INPUT_BYTES = 4_000_000; // Vercel request body limit is ~4.5 MB

export type HwManifest = {
  provenance: { generated: true; kind: string; model: string; seed: number; reference_use: string; created: string };
  paper: { source: "reference" | "synthetic"; notes: string[] };
  pen: string;
  normalised: string[];
  font_drawn?: string[]; // characters outside the model charset, drawn from a handwriting font
  issues: string[];
  word_check: { model: string; candidates: number; cer: number; exact_words: number; words: number; doubtful: { word: string; read: string }[] } | null;
  pages: { size: [number, number]; lines: { occ: number[]; text: string }[]; words: { occ: number; word: string; box: [number, number, number, number] }[] }[];
  artifacts: { name: string; sha256: string; bytes: number }[];
  seconds: number;
};

/** Character error rate (Levenshtein / reference length), whitespace-normalised and case-sensitive. */
export function cer(reference: string, hypothesis: string) {
  const a = reference.replace(/\s+/g, " ").trim();
  const b = hypothesis.replace(/\s+/g, " ").trim();
  if (!a.length) return b.length ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / a.length;
}

/** Words of the reference that never appear in the OCR output (case-insensitive). */
export function missedWords(reference: string, hypothesis: string) {
  const seen = new Set(hypothesis.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  return [...new Set(reference.toLowerCase().match(/[a-z0-9']+/g) ?? [])].filter((w) => !seen.has(w));
}
