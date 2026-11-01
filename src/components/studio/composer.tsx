"use client";
import { ArrowUp } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import type { Mode } from "@/lib/studio";

const EXAMPLES: Record<Mode, string[]> = {
  edit: ["Replace the name with Sahil Karande and PRN with 22010418", "Fix spelling mistakes on page 1", "Add a conclusion paragraph after the result", "Change the table value in row 3 to 4.7 V"],
  clone: ["Write the aim, theory and conclusion as separate headings", "Keep each answer under one page", "Number every question and leave a blank line between answers"],
  convert: ["Fix spelling while converting, but keep the wording", "Start each question on a new page", "Keep the title underlined"],
  digital: ["Update the date in the header to 12 November 2026", "Replace 'Experiment 3' with 'Experiment 4' everywhere", "Change the title to Ohm's Law Verification"],
};

export function Composer({
  mode,
  value,
  onChange,
  scope,
  onScope,
  onSubmit,
  blockedReason,
  busy,
}: {
  mode: Mode;
  value: string;
  onChange: (v: string) => void;
  scope: "document" | "selection";
  onScope: (s: "document" | "selection") => void;
  onSubmit: () => void;
  blockedReason?: string;
  busy?: boolean;
}) {
  const id = useId();
  const label = mode === "clone" ? "Instructions for the new assignment" : mode === "convert" ? "Optional conversion notes" : "Describe the change";
  return (
    <form
      className="rounded-2xl border border-line-strong bg-paper p-3 shadow-[0_16px_40px_-28px_rgba(27,26,24,0.45)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blockedReason && !busy) onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
        placeholder={
          mode === "clone"
            ? "Optional: how should the content be laid out?"
            : mode === "convert"
              ? "Optional: any notes for the conversion (content stays as in assignment 1)"
              : "e.g. Replace the name with … and keep everything else unchanged"
        }
        className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed placeholder:text-muted focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Example instructions">
          {EXAMPLES[mode].map((ex) => (
            <button key={ex} type="button" onClick={() => onChange(ex)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
              {ex}
            </button>
          ))}
        </div>
        {(mode === "edit" || mode === "digital") && (
          <select aria-label="Edit scope" value={scope} onChange={(e) => onScope(e.target.value as "document" | "selection")} className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs">
            <option value="document">Whole document</option>
            <option value="selection">Selected region</option>
          </select>
        )}
        <Button type="submit" size="sm" disabled={!!blockedReason || busy} title={blockedReason} aria-describedby={blockedReason ? `${id}-b` : undefined}>
          {busy ? "Planning…" : mode === "clone" ? "Plan pages" : mode === "convert" ? "Plan conversion" : "Plan changes"} <ArrowUp className="size-4" aria-hidden />
        </Button>
      </div>
      {blockedReason && (
        <p id={`${id}-b`} className="px-2 pt-1 text-xs text-muted">
          {blockedReason}
        </p>
      )}
    </form>
  );
}
