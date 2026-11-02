// Transcript helpers for Convert / Handwriting Clone (pure, unit-tested).

/** A table row is written as "cell | cell | cell" (2+ cells). */
export const isTableRow = (line: string) => line.split("|").filter((c) => c.trim()).length >= 2 && line.includes("|");

/** Normalise one page of vision output: tables to "a | b | c" rows (no outer pipes, no --- separator rows), and
 * report the table header to hint the next page with (a table often continues without repeating its header). */
export function tablePage(text: string, header?: string): { text: string; header?: string } {
  const lines: string[] = [];
  let next: string | undefined;
  let sawTable = false;
  for (const raw of text.split("\n")) {
    if (/^\s*\|?\s*:?-{3,}/.test(raw)) continue; // markdown separator row
    if (!isTableRow(raw)) {
      lines.push(raw.trimEnd());
      continue;
    }
    const row = raw
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())
      .join(" | ");
    sawTable = true;
    if (!/^\d+\.?\s*\|/.test(row) && (!next || next === header)) next = row; // a header row does not start with a row number
    lines.push(row);
  }
  return { text: lines.join("\n").trim(), header: sawTable ? (next ?? header) : undefined };
}

/** Share of words that look like OCR debris (table rules, stray brackets, lone symbols). High = do not trust. */
export function garbleScore(text: string): number {
  const words = text.replace(/ \| /g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const junk = words.filter((w) => !/[A-Za-z0-9]/.test(w) || /[[\]{}<>=~\\_|]/.test(w)).length;
  return junk / words.length;
}

export const GARBLED = 0.12;
