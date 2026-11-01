"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResolvedOp, ResolvedPlan } from "@/lib/plan";

const TONE = { ok: "ok", ambiguous: "warn", unresolved: "danger", invalid: "danger" } as const;
const LABEL: Record<ResolvedOp["type"], string> = {
  replace_text: "Replace",
  insert_text: "Insert",
  delete_text: "Delete",
  reflow_paragraph: "Reflow",
  update_table_cell: "Table cell",
  update_metadata: "Metadata",
  change_style: "Style",
  new_document: "New document",
};

export type PlanState = { plan: ResolvedPlan; source: "groq" | "manual"; model?: string };

/** Review surface: every operation shows original → new, confidence and why it may be unsafe. */
export function PlanPanel({
  state,
  stale,
  included,
  onInclude,
  onChooseTarget,
  onDiscard,
  applyBlockedReason,
  spanText,
}: {
  state: PlanState;
  stale: boolean;
  included: Set<string>;
  onInclude: (id: string, on: boolean) => void;
  onChooseTarget: (opId: string, spanId: string) => void;
  onDiscard: () => void;
  applyBlockedReason: string;
  spanText: (id: string) => string;
}) {
  const { plan } = state;
  return (
    <section aria-labelledby="plan-h" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan-h" className="font-display text-2xl">
          Proposed changes
        </h2>
        <span className="text-xs text-muted">{state.source === "groq" ? `Planned by Groq · ${state.model}` : "Manual operation"}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{plan.summary}</p>
      {plan.clarification && (
        <p role="status" className="mt-3 rounded-lg bg-ivory p-3 text-sm">
          <strong className="font-medium">Needs clarification:</strong> {plan.clarification}
        </p>
      )}
      {stale && (
        <p role="alert" className="mt-3 rounded-lg bg-ivory p-3 text-sm text-danger">
          The document changed after this plan was made. Discard it and plan again.
        </p>
      )}
      {plan.truncated && <p className="mt-3 text-xs text-warn">The document was too long to send in full; changes near the end may be missed.</p>}
      <ol className="mt-4 space-y-3">
        {plan.operations.map((op) => (
          <OpRow key={op.id} op={op} included={included.has(op.id)} onInclude={onInclude} onChooseTarget={onChooseTarget} spanText={spanText} />
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          Discard plan
        </Button>
        <Button size="sm" disabled title={applyBlockedReason}>
          Apply {included.size} change{included.size === 1 ? "" : "s"}
        </Button>
      </div>
      <p className="mt-1 text-right text-xs text-muted">{applyBlockedReason}</p>
    </section>
  );
}

function OpRow({
  op,
  included,
  onInclude,
  onChooseTarget,
  spanText,
}: {
  op: ResolvedOp;
  included: boolean;
  onInclude: (id: string, on: boolean) => void;
  onChooseTarget: (opId: string, spanId: string) => void;
  spanText: (id: string) => string;
}) {
  const [target, setTarget] = useState("");
  const usable = op.status === "ok";
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Include ${LABEL[op.type].toLowerCase()} operation ${op.id}`}
          checked={included}
          disabled={!usable}
          onChange={(e) => onInclude(op.id, e.target.checked)}
          className="accent-[var(--color-bronze)]"
        />
        <span className="text-sm font-medium">{LABEL[op.type]}</span>
        <Badge tone={TONE[op.status]}>{op.status}</Badge>
        <span className="ml-auto font-mono text-[11px] text-muted">confidence {Math.round(op.confidence * 100)}%</span>
      </div>
      {op.type !== "new_document" && op.match && (
        <p className="mt-2 text-sm">
          <del className="bg-[#f3d9d9] text-danger decoration-danger/60">{op.match}</del>
          {op.replacement && (
            <>
              {" → "}
              <ins className="bg-[#dcebdc] text-ok no-underline">{op.replacement}</ins>
            </>
          )}
        </p>
      )}
      {op.type === "new_document" && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ivory p-2 text-xs">{op.replacement}</pre>}
      {(op.reason || op.warning) && <p className="mt-2 text-xs text-warn">{[op.reason, op.warning].filter(Boolean).join(" ")}</p>}
      {op.status === "ambiguous" && (
        <div className="mt-2 flex gap-2">
          <select aria-label="Choose which occurrence to change" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-2 py-1 text-xs">
            <option value="">Choose the occurrence…</option>
            {op.targets.map((t) => (
              <option key={t} value={t}>
                {spanText(t).slice(0, 80)}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" disabled={!target} onClick={() => onChooseTarget(op.id, target)}>
            Use this
          </Button>
        </div>
      )}
    </li>
  );
}

export function ManualOperation({ onAdd, disabled }: { onAdd: (match: string, replacement: string, all: boolean) => void; disabled: boolean }) {
  const [match, setMatch] = useState("");
  const [replacement, setReplacement] = useState("");
  const [all, setAll] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (match.trim()) onAdd(match, replacement, all);
      }}
    >
      <p className="text-xs text-muted">Works without AI: exact find and replace, checked against the document.</p>
      <label className="block text-xs font-medium text-ink-2">
        Find exactly
        <input value={match} onChange={(e) => setMatch(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm" />
      </label>
      <label className="block text-xs font-medium text-ink-2">
        Replace with (empty deletes)
        <input value={replacement} onChange={(e) => setReplacement(e.target.value)} className="mt-1 w-full rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[var(--color-bronze)]" /> Every occurrence
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={disabled || !match.trim()}>
        Add to plan
      </Button>
    </form>
  );
}
