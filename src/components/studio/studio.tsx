"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Columns2, Minus, PanelRightClose, PanelRightOpen, Plus, Redo2, ScanEye, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_LAYOUT, MODES, missingInputs, slotsFor, type LayoutSettings, type Mode, type Slot } from "@/lib/studio";
import { docText, textToSpans, type Span } from "@/lib/doc/model";
import { manualReplace, resolvePlan } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { UploadCard, type Upload } from "./upload-card";
import { Inspector } from "./inspector";
import { Composer } from "./composer";
import { ExportDialog } from "./export-dialog";
import { PaperPreview } from "./paper-preview";
import { useDocument } from "./use-document";
import { DocumentView } from "./document-view";
import { TextPanel } from "./text-panel";
import { ManualOperation, PlanPanel, type PlanState } from "./plan-panel";
import { Transcript } from "./transcript";
import { DiffView } from "./diff-view";
import { applyPlan, verifyApplied, type OpReport } from "@/lib/edit/apply";
import { exportDocument, exportUnavailable } from "@/lib/export";
import { lineDiff } from "@/lib/diff";
import type { ResolvedOp } from "@/lib/plan";

type AiStatus = { configured: boolean; available?: Record<string, boolean>; error?: string } | null;
/** An immutable edited version. The original upload is version 0 and is never modified. */
type Version = { upload: Upload; label: string; method: string; ops: ResolvedOp[]; reports: OpReport[] };
type History = { source?: Upload; versions: Version[]; cursor: number };

export function Studio() {
  const [name, setName] = useState("Untitled assignment");
  const [mode, setMode] = useState<Mode>("edit");
  const [textToAssignment, setTextToAssignment] = useState(true);
  const [uploads, setUploads] = useState<Partial<Record<Slot, Upload>>>({});
  const [instruction, setInstruction] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<"document" | "selection">("document");
  const [layout, setLayout] = useState<LayoutSettings>(DEFAULT_LAYOUT);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [split, setSplit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planState, setPlanState] = useState<PlanState>();
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string>();
  const [ai, setAi] = useState<AiStatus>(null);
  const [consent, setConsent] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptOk, setTranscriptOk] = useState(false);

  const [history, setHistory] = useState<History>({ versions: [], cursor: 0 });
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string>();
  const [showDiff, setShowDiff] = useState(false);
  if (history.source !== uploads.source) setHistory({ source: uploads.source, versions: [], cursor: 0 });
  const { versions, cursor } = history;
  const currentVersion = cursor > 0 ? versions[cursor - 1] : undefined;

  const original = useDocument(uploads.source);
  const edited = useDocument(currentVersion?.upload);
  const doc = currentVersion ? edited : original;
  const ready = doc.status === "ready" ? doc : undefined;
  const versionId = ready?.versionId;
  const originalReady = original.status === "ready" ? original : undefined;

  // New source → reset page and (convert) transcript; any new version → reset selection.
  const [seenSource, setSeenSource] = useState<string>();
  if (seenSource !== originalReady?.versionId) {
    setSeenSource(originalReady?.versionId);
    setPage(0);
    setTranscript(originalReady ? docText(originalReady.loaded.model) : "");
    setTranscriptOk(false);
  }
  const [seenVersion, setSeenVersion] = useState<string>();
  if (seenVersion !== versionId) {
    setSeenVersion(versionId);
    setSelected(new Set());
  }

  async function apply() {
    if (!ready || !planState || !uploads.source) return;
    const ops = planState.plan.operations.filter((o) => included.has(o.id));
    const file = currentVersion?.upload.file ?? uploads.source.file;
    const kind = currentVersion?.upload.kind ?? uploads.source.kind;
    setApplying(true);
    setApplyError(undefined);
    try {
      const r = await applyPlan(file, kind, ready.loaded.model, ops);
      if (!r.reports.some((x) => x.status === "applied")) throw new Error(r.reports.flatMap((x) => x.warnings).join(" ") || "Nothing could be applied.");
      const newKind = r.file.type === "image/png" ? "png" : r.file.type === "image/jpeg" ? "jpeg" : kind;
      const upload: Upload = { file: r.file, kind: newKind, url: URL.createObjectURL(r.file) };
      setHistory((h) => {
        const kept = h.versions.slice(0, h.cursor); // applying after undo drops the redo branch
        return { ...h, versions: [...kept, { upload, label: planState.plan.summary, method: r.method, ops, reports: r.reports }], cursor: kept.length + 1 };
      });
      setPlanState(undefined);
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  const canUndo = cursor > 0 && !applying;
  const canRedo = cursor < versions.length && !applying;
  const undo = () => canUndo && setHistory((h) => ({ ...h, cursor: h.cursor - 1 }));
  const redo = () => canRedo && setHistory((h) => ({ ...h, cursor: h.cursor + 1 }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      if (typing || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    fetch("/api/groq/status")
      .then((r) => r.json())
      .then(setAi)
      .catch(() => setAi({ configured: false, error: "Status check failed." }));
  }, []);

  const slots = slotsFor(mode, textToAssignment);
  const composing = mode === "clone" && textToAssignment;
  const missing = missingInputs(mode, textToAssignment, uploads, composing ? content : instruction);

  // What the plan is checked against: document spans, the transcript (convert) or the typed content (compose).
  const planSpans: Span[] = useMemo(() => {
    if (composing) return textToSpans(content);
    if (mode === "convert") return textToSpans(transcript);
    return ready?.loaded.model.spans ?? [];
  }, [composing, content, mode, transcript, ready]);
  const planVersion = composing || mode === "convert" ? "text" : (versionId ?? "none");

  const blocked = (() => {
    if (missing.length) return `Add: ${missing.join(", ")}.`;
    if (!composing && doc.status === "loading") return "Wait for the document to finish loading.";
    if (!composing && doc.status === "error") return "The document could not be read.";
    if (mode === "convert" && !instruction.trim()) return "Conversion itself needs the handwriting worker (not built yet). Add notes here to plan transcript changes.";
    if (!ai?.configured) return "Groq is not configured (GROQ_API_KEY). Use manual find & replace in the side panel.";
    if (!consent) return "Tick “Send document text to Groq” to plan with AI.";
    if (scope === "selection" && !selected.size) return "Select lines in the side panel, or switch the scope to the whole document.";
    return undefined;
  })();

  async function plan() {
    setPlanning(true);
    setPlanError(undefined);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          instruction,
          versionId: planVersion,
          spans: planSpans.map(({ id, page, text, cell }) => ({ id, page, text, cell })),
          selection: scope === "selection" && !composing ? [...selected] : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Planning failed.");
      showPlan({ plan: json.plan, source: "groq", model: json.model });
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setPlanning(false);
    }
  }

  function showPlan(s: PlanState) {
    setPlanState(s);
    setIncluded(new Set(s.plan.operations.filter((o) => o.status === "ok").map((o) => o.id)));
  }

  function chooseTarget(opId: string, spanId: string) {
    if (!planState) return;
    const operations = planState.plan.operations.map((o) => (o.id === opId ? { ...o, status: "ok" as const, targets: [spanId], reason: null } : o));
    setPlanState({ ...planState, plan: { ...planState.plan, operations } });
    setIncluded((p) => new Set(p).add(opId));
  }

  const toggleSpan = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const targets = useMemo(() => new Set(planState?.plan.operations.filter((o) => included.has(o.id)).flatMap((o) => o.targets) ?? []), [planState, included]);
  const pageCount = ready ? Math.max(1, ready.loaded.previews.length) : 0;
  const stale = !!planState && planState.plan.versionId !== planVersion;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/95 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="font-display text-xl leading-none">
            AS<span className="sr-only"> — Assignment Studio home</span>
          </Link>
          <span className="h-5 w-px bg-line" aria-hidden />
          <label className="sr-only" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 max-w-[40vw] flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-medium hover:bg-line/50 focus:bg-paper sm:max-w-xs sm:flex-none"
          />
          <Badge tone="pending" className="hidden whitespace-nowrap sm:inline-flex" title="Saving to the library is not built yet">
            Unsaved draft
          </Badge>
          <Badge
            tone={ai?.configured && !ai.error ? "ok" : "pending"}
            className="hidden whitespace-nowrap md:inline-flex"
            title={ai?.error ?? (ai?.configured ? "Groq planning available" : "Set GROQ_API_KEY on the server to enable AI planning")}
          >
            {ai === null ? "AI: checking" : ai.configured && !ai.error ? "AI: Groq ready" : "AI: not configured"}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="size-4" />
            </Button>
            <Link href="/library" className="hidden px-2 text-sm text-ink-2 hover:text-ink sm:inline">
              Library
            </Link>
            <ExportDialog
              pageSize={layout.pageSize}
              disabledReason={!uploads.source ? "Add a document first." : !ready ? "Wait for the current version to finish loading." : undefined}
              unavailable={(f) => (ready ? exportUnavailable(ready.loaded.model.kind, f) : null)}
              onExport={async (req) => {
                const up = currentVersion?.upload ?? uploads.source!;
                return exportDocument({ bytes: new Uint8Array(await up.file.arrayBuffer()), kind: up.kind, model: ready!.loaded.model, name: name || up.file.name }, req);
              }}
            />
          </div>
        </div>
        <nav aria-label="Studio mode" className="flex gap-1 overflow-x-auto border-t border-line px-3 sm:px-5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => {
                setMode(m.id);
                setPlanState(undefined);
              }}
              title={m.blurb}
              className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm text-ink-2 hover:text-ink aria-pressed:border-ink aria-pressed:text-ink"
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      <main id="main" className={cn("grid flex-1 gap-4 p-3 sm:p-5 lg:gap-5", inspectorOpen ? "lg:grid-cols-[300px_minmax(0,1fr)_300px]" : "lg:grid-cols-[300px_minmax(0,1fr)]")}>
        <aside aria-label="Files" className="space-y-3">
          {mode === "clone" && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4">
              <div>
                <label htmlFor="t2a" className="text-sm font-medium">
                  Text → Assignment
                </label>
                <p className="text-xs text-muted">{textToAssignment ? "Creates an entirely new document." : "Rewrites an uploaded source."}</p>
              </div>
              <Switch id="t2a" checked={textToAssignment} onCheckedChange={setTextToAssignment} />
            </div>
          )}
          {slots.map((spec) => (
            <UploadCard key={`${mode}-${spec.slot}`} spec={spec} value={uploads[spec.slot]} onChange={(u) => setUploads((p) => ({ ...p, [spec.slot]: u }))} />
          ))}
          {mode !== "digital" && (
            <p className="px-1 text-xs leading-relaxed text-muted">
              Only use handwriting you are authorised to use. The reference supplies style only — its text is never copied. Signatures and ID documents are not supported.
            </p>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Document canvas" className="flex min-w-0 flex-col rounded-2xl border border-line bg-[#efebe3]">
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
              {!composing && (
                <Button variant="ghost" size="sm" aria-pressed={split} onClick={() => setSplit(!split)} className="aria-pressed:bg-line/70">
                  <Columns2 className="size-4" aria-hidden /> Split view
                </Button>
              )}
              {!composing && mode !== "convert" && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={showDiff}
                  disabled={!currentVersion}
                  title={currentVersion ? "Highlight what changed against the original" : "Available after the first applied change"}
                  onClick={() => {
                    setShowDiff(!showDiff);
                    setSplit(true);
                  }}
                  className="aria-pressed:bg-line/70"
                >
                  <ScanEye className="size-4" aria-hidden /> Diff
                </Button>
              )}
              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="font-mono text-xs tabular-nums" aria-live="polite">
                    {page + 1} / {pageCount}
                  </span>
                  <Button variant="ghost" size="sm" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                  <Minus className="size-4" />
                </Button>
                <span className="w-12 text-center font-mono text-xs tabular-nums" aria-live="polite">
                  {Math.round(zoom * 100)}%
                </span>
                <Button variant="ghost" size="sm" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
                  <Plus className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" className="hidden lg:inline-flex" aria-label={inspectorOpen ? "Hide side panel" : "Show side panel"} onClick={() => setInspectorOpen(!inspectorOpen)}>
                  {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="min-h-[420px] flex-1 overflow-auto p-4 sm:p-6">
              {composing ? (
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="flex flex-col">
                    <label htmlFor="content" className="mb-2 text-sm font-medium">
                      Assignment content
                    </label>
                    <textarea
                      id="content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={"Experiment No. 5\nAim: …\n\nTheory: …"}
                      className="min-h-[360px] flex-1 resize-y rounded-xl border border-line-strong bg-paper p-4 font-mono text-sm leading-relaxed"
                    />
                    <p className="mt-2 text-xs text-muted">{content.trim() ? `${content.trim().split(/\s+/).length} words` : "Type or paste the text to write."}</p>
                  </div>
                  <figure className="mx-auto w-full max-w-[460px]" style={{ zoom }}>
                    <PaperPreview s={layout} />
                    <figcaption className="mt-2 text-center text-xs text-muted">Paper layer only — handwriting appears after generation on your GPU worker.</figcaption>
                  </figure>
                </div>
              ) : uploads.source ? (
                <div className={cn("grid gap-6", split && "md:grid-cols-2")}>
                  <figure className="min-w-0">
                    <figcaption className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-2">{mode === "convert" ? "Assignment 1 — content" : "Original"}</figcaption>
                    <DocumentView
                      state={original}
                      file={uploads.source.file}
                      page={page}
                      zoom={zoom}
                      label="Original"
                      marks={currentVersion ? undefined : { selected, targets }}
                      onSpan={!currentVersion && scope === "selection" && mode !== "convert" ? toggleSpan : undefined}
                    />
                  </figure>
                  {split &&
                    (mode === "convert" ? (
                      <ConvertPlaceholder hasStyle={!!uploads.reference} />
                    ) : (
                      <figure className="min-w-0">
                        <figcaption className="mb-2 flex justify-between gap-2 text-xs uppercase tracking-[0.14em] text-ink-2">
                          {showDiff && currentVersion ? "Changes" : "Edited"}
                          <span className="truncate normal-case tracking-normal text-muted">
                            {currentVersion ? `Version ${cursor} of ${versions.length} · ${currentVersion.method}` : "No edits applied yet"}
                          </span>
                        </figcaption>
                        {!currentVersion ? (
                          <DocumentView state={original} file={uploads.source.file} page={page} zoom={zoom} label="Edited" />
                        ) : showDiff && originalReady && ready ? (
                          ready.loaded.previews[page] && originalReady.loaded.previews[page] ? (
                            <DiffView before={originalReady.loaded.previews[page].url} after={ready.loaded.previews[page].url} label={`Changes on page ${page + 1}`} />
                          ) : (
                            <TextDiff a={originalReady.loaded.model.spans.map((s) => s.text)} b={ready.loaded.model.spans.map((s) => s.text)} />
                          )
                        ) : (
                          <DocumentView
                            state={edited}
                            file={currentVersion.upload.file}
                            page={page}
                            zoom={zoom}
                            label="Edited"
                            marks={{ selected, targets }}
                            onSpan={scope === "selection" ? toggleSpan : undefined}
                          />
                        )}
                      </figure>
                    ))}
                </div>
              ) : (
                <div className="grid h-full min-h-[380px] place-items-center text-center">
                  <div className="max-w-sm">
                    <p className="font-display text-3xl">Nothing on the desk yet.</p>
                    <p className="mt-3 text-sm text-ink-2">Add the {slots.find((s) => s.slot === "source")?.title.toLowerCase() ?? "file"} on the left to preview it here.</p>
                  </div>
                </div>
              )}
            </div>

            {ready && ready.loaded.previews.length > 1 && (
              <nav aria-label="Pages" className="flex gap-2 overflow-x-auto border-t border-line p-3">
                {ready.loaded.previews.map((p, i) => (
                  <button
                    key={p.url}
                    type="button"
                    aria-label={`Page ${i + 1}`}
                    aria-current={i === page ? "page" : undefined}
                    onClick={() => setPage(i)}
                    className="shrink-0 rounded border-2 border-transparent aria-[current=page]:border-ink"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local thumbnail */}
                    <img src={p.url} alt="" className="h-20 w-auto bg-paper" />
                  </button>
                ))}
              </nav>
            )}
          </section>

          {mode === "convert" && ready && (
            <Transcript value={transcript} onChange={setTranscript} confirmed={transcriptOk} onConfirm={setTranscriptOk} previews={ready.loaded.previews} aiReady={!!ai?.configured && !ai.error} />
          )}

          {planError && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-paper p-3 text-sm text-danger">
              {planError}
            </p>
          )}
          {planState && (
            <PlanPanel
              state={planState}
              stale={stale}
              included={included}
              onInclude={(id, on) =>
                setIncluded((p) => {
                  const n = new Set(p);
                  if (on) n.add(id);
                  else n.delete(id);
                  return n;
                })
              }
              onChooseTarget={chooseTarget}
              onDiscard={() => setPlanState(undefined)}
              onApply={apply}
              applying={applying}
              applyBlockedReason={
                composing || mode === "convert"
                  ? "Writing new pages needs the handwriting worker — this plan only prepares the text."
                  : !ready
                    ? "Wait for the document to finish loading."
                    : undefined
              }
              spanText={(id) => planSpans.find((s) => s.id === id)?.text ?? id}
            />
          )}
          {applyError && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-paper p-3 text-sm text-danger">
              {applyError}
            </p>
          )}
          {currentVersion && !composing && mode !== "convert" && <ChangeReport version={currentVersion} state={edited} />}
        </div>

        <aside aria-label="Side panel" className={cn("space-y-3 lg:block", !inspectorOpen && "lg:hidden")}>
          {uploads.source && versions.length > 0 && (
            <details open className="rounded-2xl border border-line bg-paper p-4">
              <summary className="cursor-pointer text-sm font-medium">Versions ({versions.length + 1})</summary>
              <ol className="mt-3 space-y-1 text-xs">
                {[{ label: "Original (never modified)" }, ...versions].map((v, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      aria-current={i === cursor ? "true" : undefined}
                      onClick={() => setHistory((h) => ({ ...h, cursor: i }))}
                      className="w-full truncate rounded px-2 py-1.5 text-left hover:bg-ivory aria-[current=true]:bg-[#efe3cf]/70 aria-[current=true]:font-medium"
                    >
                      {i}. {v.label}
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {ready && mode !== "convert" && (
            <details open className="rounded-2xl border border-line bg-paper p-4">
              <summary className="cursor-pointer text-sm font-medium">Document</summary>
              <div className="mt-3">
                <TextPanel model={ready.loaded.model} page={page} selected={selected} onToggle={toggleSpan} selectable={scope === "selection"} />
              </div>
            </details>
          )}
          {(mode === "edit" || mode === "digital") && (
            <details open className="rounded-2xl border border-line bg-paper p-4">
              <summary className="cursor-pointer text-sm font-medium">Manual find &amp; replace</summary>
              <div className="mt-3">
                <ManualOperation
                  disabled={!ready}
                  onAdd={(m, r, all) => ready && showPlan({ plan: resolvePlan(manualReplace(m, r, all ? "all" : "single"), ready.loaded.model.spans, mode, ready.versionId), source: "manual" })}
                />
              </div>
            </details>
          )}
          {mode !== "digital" && (
            <details open className="rounded-2xl border border-line bg-paper p-4">
              <summary className="cursor-pointer text-sm font-medium">Page &amp; handwriting settings</summary>
              <div className="mt-4">
                <Inspector mode={mode} s={layout} onChange={setLayout} />
              </div>
            </details>
          )}
          {mode === "digital" && (
            <div className="rounded-2xl border border-line bg-paper p-4">
              <Inspector mode={mode} s={layout} onChange={setLayout} />
            </div>
          )}
        </aside>
      </main>

      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-ivory via-ivory to-transparent px-3 pb-3 pt-6 sm:px-5 sm:pb-5">
        <div className="mx-auto max-w-4xl">
          {ai?.configured && (
            <label className="mb-2 flex items-center gap-2 px-2 text-xs text-ink-2">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-[var(--color-bronze)]" />
              Send document text to Groq when planning (files stay in your browser; only extracted text is sent).
            </label>
          )}
          <Composer mode={mode} value={instruction} onChange={setInstruction} scope={scope} onScope={setScope} onSubmit={plan} blockedReason={blocked} busy={planning} />
        </div>
      </div>
    </div>
  );
}

function ChangeReport({ version, state }: { version: Version; state: ReturnType<typeof useDocument> }) {
  const checked = state.status === "ready" ? verifyApplied(state.loaded.model, version.ops, version.reports) : null;
  const rows = checked ?? version.reports.map((r) => ({ ...r, verified: undefined }));
  return (
    <section aria-labelledby="report-h" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-h" className="font-display text-2xl">
          What changed
        </h2>
        <Badge tone={version.method === "native" ? "ok" : version.method === "text" ? "neutral" : "warn"}>
          {version.method === "native" ? "Native edit" : version.method === "text" ? "Text edit" : "Reconstruction — not exact"}
        </Badge>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r, i) => {
          const op = version.ops.find((o) => o.id === r.opId);
          return (
            <li key={`${r.opId}-${i}`} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{op ? `${op.match || "(new line)"} → ${op.replacement || "(removed)"}` : r.opId}</span>
                <Badge tone={r.status === "applied" ? "ok" : "danger"}>{r.status}</Badge>
                {r.status === "applied" && r.verified !== undefined && (
                  <Badge tone={r.verified ? "ok" : "warn"} title="Checked by re-reading the new version">
                    {r.verified ? "verified" : "not confirmed"}
                  </Badge>
                )}
                {r.font && (
                  <Badge tone={r.font.reused ? "ok" : "warn"}>{r.font.reused ? "original font" : `font substituted: ${r.font.substitute}`}</Badge>
                )}
              </div>
              {r.warnings.length > 0 && <p className="mt-1.5 text-xs text-warn">{r.warnings.join(" ")}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TextDiff({ a, b }: { a: string[]; b: string[] }) {
  const rows = lineDiff(a, b).filter((d, i, all) => d.kind !== "same" || all[i - 1]?.kind !== "same" || all[i + 1]?.kind !== "same");
  return (
    <ol aria-label="Text changes" className="max-h-[70vh] space-y-0.5 overflow-auto rounded-sm bg-paper p-4 font-mono text-xs leading-relaxed">
      {rows.map((d, i) => (
        <li key={i} className={d.kind === "add" ? "bg-[#dcebdc] text-ok" : d.kind === "del" ? "bg-[#f3d9d9] text-danger line-through" : "text-muted"}>
          <span aria-hidden>{d.kind === "add" ? "+ " : d.kind === "del" ? "− " : "  "}</span>
          <span className="sr-only">{d.kind === "add" ? "added: " : d.kind === "del" ? "removed: " : ""}</span>
          {d.text}
        </li>
      ))}
    </ol>
  );
}

const CONVERT_STEPS = [
  "Read assignment 1's text with OCR, keeping line and page breaks.",
  "You review and correct the transcript — nothing is generated from unchecked text.",
  "Learn the writing style from assignment 2 (its text is ignored).",
  "Write the transcript in that style on the chosen paper, page by page.",
  "Check the result with OCR against the transcript and flag differences.",
];

function ConvertPlaceholder({ hasStyle }: { hasStyle: boolean }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-2">Converted</figcaption>
      <div className="grid aspect-[1/1.414] place-items-center rounded-sm bg-paper p-6 shadow-[0_24px_60px_-40px_rgba(27,26,24,0.55)]">
        <div className="max-w-xs">
          <Badge tone="pending">Not generated</Badge>
          <p className="mt-3 text-sm text-ink-2">{hasStyle ? "Both assignments are in place. Conversion will run in these steps:" : "Add assignment 2 to choose the target handwriting."}</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
            {CONVERT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </figure>
  );
}
