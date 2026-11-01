// Turns resolved plan operations into concrete per-span edits that every engine understands.
import type { Span } from "../doc/model";
import type { ResolvedOp } from "../plan";

/** `match` → `replacement` inside one span. `newLine` inserts `replacement` as a new line/paragraph after the span. */
export type SpanEdit = { opId: string; span: Span; match: string; replacement: string; all: boolean; newLine?: boolean };
export type Skipped = { opId: string; reason: string };

export function toEdits(ops: ResolvedOp[], spans: Span[]): { edits: SpanEdit[]; skipped: Skipped[] } {
  const edits: SpanEdit[] = [];
  const skipped: Skipped[] = [];
  for (const op of ops) {
    if (op.status !== "ok") {
      skipped.push({ opId: op.id, reason: op.reason ?? "Not resolved." });
      continue;
    }
    for (const id of op.targets) {
      const span = spans.find((s) => s.id === id);
      if (!span) {
        skipped.push({ opId: op.id, reason: `Target ${id} no longer exists.` });
        continue;
      }
      const all = op.occurrence === "all";
      switch (op.type) {
        case "replace_text":
        case "update_table_cell":
          edits.push({ opId: op.id, span, match: op.match || span.text, replacement: op.replacement, all });
          break;
        case "delete_text":
          edits.push({ opId: op.id, span, match: op.match, replacement: "", all });
          break;
        case "insert_text":
          if (op.position === "after" && op.match.trim() === span.text.trim()) edits.push({ opId: op.id, span, match: "", replacement: op.replacement, all: false, newLine: true });
          else if (op.position === "before") edits.push({ opId: op.id, span, match: op.match, replacement: op.replacement + op.match, all });
          else edits.push({ opId: op.id, span, match: op.match, replacement: op.position === "replace" ? op.replacement : op.match + op.replacement, all });
          break;
        default:
          skipped.push({ opId: op.id, reason: `${op.type.replace(/_/g, " ")} is not supported by the deterministic engines yet.` });
      }
    }
  }
  return { edits, skipped };
}

export function applyToText(text: string, e: Pick<SpanEdit, "match" | "replacement" | "all">) {
  if (!e.match) return text;
  return e.all ? text.split(e.match).join(e.replacement) : text.replace(e.match, () => e.replacement);
}

/** Line-based engine for TXT/MD: edits whole lines by span id (`l<index>`). */
export function editPlainText(source: string, edits: SpanEdit[]) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const after = new Map<number, string[]>();
  for (const e of edits) {
    const i = Number(e.span.id.slice(1));
    if (e.newLine) after.set(i, [...(after.get(i) ?? []), e.replacement]);
    else lines[i] = applyToText(lines[i], e);
  }
  return lines.flatMap((l, i) => [l, ...(after.get(i) ?? [])]).join("\n");
}
