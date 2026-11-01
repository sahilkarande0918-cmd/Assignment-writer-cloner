"use client";
import type { DocModel } from "@/lib/doc/model";
import { Badge } from "@/components/ui/badge";

/** Document facts + extracted text. Checkboxes define the "selected region" scope. */
export function TextPanel({ model, page, selected, onToggle, selectable }: { model: DocModel; page: number; selected: Set<string>; onToggle: (id: string) => void; selectable: boolean }) {
  const paged = model.kind === "pdf" || model.origin === "scanned";
  const spans = paged ? model.spans.filter((s) => s.page === page) : model.spans;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={model.origin === "digital" ? "ok" : "warn"}>{model.origin === "digital" ? "Digital text" : model.origin === "scanned" ? "Scan / photo" : "Plain text"}</Badge>
        {model.handwritingLikely !== undefined && (
          <Badge tone="neutral" title="Estimated from OCR confidence; not a guarantee">
            {model.handwritingLikely ? "Likely handwritten" : "Likely printed"} · heuristic
          </Badge>
        )}
        {model.pages.length > 1 && <Badge>{model.pages.length} pages</Badge>}
      </div>
      {model.fonts.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-ink-2">Fonts ({model.fonts.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {model.fonts.map((f) => (
              <li key={f.name} className="flex justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <span className={f.embedded === false ? "text-warn" : "text-muted"}>{f.embedded === null ? "unknown" : f.embedded ? "embedded" : "not embedded"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {model.warnings.map((w) => (
        <p key={w} className="rounded-lg bg-ivory p-2.5 text-xs text-warn">
          {w}
        </p>
      ))}
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-2">
          Extracted text{paged ? ` · page ${page + 1}` : ""} {selectable && <span className="font-normal text-muted">— tick lines to limit the edit scope</span>}
        </legend>
        {spans.length === 0 ? (
          <p className="text-xs text-muted">No text found on this page.</p>
        ) : (
          <ul className="max-h-[40vh] space-y-0.5 overflow-auto pr-1">
            {spans.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer gap-2 rounded px-1.5 py-1 hover:bg-ivory has-[:checked]:bg-[#efe3cf]/60">
                  {selectable && <input type="checkbox" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} className="mt-0.5 accent-[var(--color-bronze)]" />}
                  <span className="min-w-0 flex-1 break-words text-xs leading-relaxed">{s.text}</span>
                  {s.confidence !== undefined && <span className={`shrink-0 font-mono text-[10px] ${s.confidence < 60 ? "text-warn" : "text-muted"}`}>{s.confidence}%</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
