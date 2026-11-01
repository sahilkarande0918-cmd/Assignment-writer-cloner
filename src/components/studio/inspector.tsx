"use client";
import { useId } from "react";
import { PEN_COLORS, linesPerPage, type LayoutSettings, type Mode } from "@/lib/studio";

const field = "w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm";

function Row({ label, children, hint }: { label: string; children: (id: string) => React.ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex justify-between text-xs font-medium text-ink-2">
        {label}
        {hint && <span className="font-normal text-muted">{hint}</span>}
      </label>
      {children(id)}
    </div>
  );
}

export function Inspector({ mode, s, onChange }: { mode: Mode; s: LayoutSettings; onChange: (s: LayoutSettings) => void }) {
  const set = <K extends keyof LayoutSettings>(k: K, v: LayoutSettings[K]) => onChange({ ...s, [k]: v });
  const handwriting = mode !== "digital";
  return (
    <div className="space-y-5">
      <Row label="Page size">
        {(id) => (
          <select id={id} className={field} value={s.pageSize} onChange={(e) => set("pageSize", e.target.value as LayoutSettings["pageSize"])}>
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="Letter">Letter (8.5 × 11 in)</option>
          </select>
        )}
      </Row>
      {handwriting && (
        <>
          <Row label="Paper style">
            {(id) => (
              <select id={id} className={field} value={s.paper} onChange={(e) => set("paper", e.target.value as LayoutSettings["paper"])}>
                <option value="ruled">Ruled notebook (approximation)</option>
                <option value="grid">Grid (approximation)</option>
                <option value="plain">Plain</option>
                <option value="reference">{mode === "convert" ? "From assignment 2 (handwriting)" : "From paper reference"}</option>
                {mode === "convert" && <option value="source">From assignment 1 (content)</option>}
              </select>
            )}
          </Row>
          {mode === "convert" && (
            <label className="flex items-center justify-between gap-3 text-xs font-medium text-ink-2">
              Keep assignment 1&apos;s line breaks
              <input type="checkbox" checked={s.keepLineBreaks} onChange={(e) => set("keepLineBreaks", e.target.checked)} className="size-4 accent-[var(--color-bronze)]" />
            </label>
          )}
          <Row label="Left margin" hint={`${s.marginLeftMm} mm`}>
            {(id) => <input id={id} type="range" min={10} max={45} value={s.marginLeftMm} onChange={(e) => set("marginLeftMm", +e.target.value)} className="w-full accent-[var(--color-bronze)]" />}
          </Row>
          <Row label="Top margin" hint={`${s.marginTopMm} mm`}>
            {(id) => <input id={id} type="range" min={10} max={60} value={s.marginTopMm} onChange={(e) => set("marginTopMm", +e.target.value)} className="w-full accent-[var(--color-bronze)]" />}
          </Row>
          <Row label="Line spacing" hint={`${s.lineSpacingMm} mm · ${linesPerPage(s)} lines/page`}>
            {(id) => <input id={id} type="range" min={6} max={12} step={0.5} value={s.lineSpacingMm} onChange={(e) => set("lineSpacingMm", +e.target.value)} className="w-full accent-[var(--color-bronze)]" />}
          </Row>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-ink-2">Pen colour</legend>
            <div className="flex flex-wrap gap-2">
              {PEN_COLORS.map((c) => (
                <label key={c.value} className="cursor-pointer">
                  <input type="radio" name="pen" value={c.value} checked={s.penColor === c.value} onChange={() => set("penColor", c.value)} className="peer sr-only" />
                  <span
                    title={c.label}
                    className="block size-7 rounded-full border-2 border-paper ring-1 ring-line-strong peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-bronze"
                    style={{ background: c.value === "match" ? "conic-gradient(#1f2f5c, #1d3fae, #1b1a18, #a32424, #2f6b3a, #1f2f5c)" : c.value }}
                  />
                  <span className="sr-only">{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Row label="Writing size" hint={`${s.sizePt} pt`}>
            {(id) => <input id={id} type="range" min={10} max={22} value={s.sizePt} onChange={(e) => set("sizePt", +e.target.value)} className="w-full accent-[var(--color-bronze)]" />}
          </Row>
          <Row label="Alignment">
            {(id) => (
              <select id={id} className={field} value={s.align} onChange={(e) => set("align", e.target.value as LayoutSettings["align"])}>
                <option value="left">Left (natural)</option>
                <option value="justify">Justified</option>
              </select>
            )}
          </Row>
        </>
      )}
    </div>
  );
}
