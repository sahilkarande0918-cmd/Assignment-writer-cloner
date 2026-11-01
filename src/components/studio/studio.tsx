"use client";
import { useState } from "react";
import Link from "next/link";
import { Columns2, Minus, PanelRightClose, PanelRightOpen, Plus, Redo2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_LAYOUT, MODES, missingInputs, slotsFor, type LayoutSettings, type Mode, type Slot } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { UploadCard, type Upload } from "./upload-card";
import { Inspector } from "./inspector";
import { Composer } from "./composer";
import { ExportDialog } from "./export-dialog";
import { PaperPreview } from "./paper-preview";

const PENDING_PLAN = "AI planning is not built yet — it arrives with the Groq instruction engine.";
const PENDING_CONVERT = "Conversion needs transcript OCR and the handwriting worker — neither is built yet.";

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

  const slots = slotsFor(mode, textToAssignment);
  const composing = mode === "clone" && textToAssignment;
  const missing = missingInputs(mode, textToAssignment, uploads, composing ? content : instruction);
  const blocked = missing.length ? `Add: ${missing.join(", ")}.` : mode === "convert" ? PENDING_CONVERT : PENDING_PLAN;

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
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled aria-label="Undo" title="Nothing to undo">
              <Undo2 className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled aria-label="Redo" title="Nothing to redo">
              <Redo2 className="size-4" />
            </Button>
            <Link href="/library" className="hidden px-2 text-sm text-ink-2 hover:text-ink sm:inline">
              Library
            </Link>
            <ExportDialog pageSize={layout.pageSize} disabledReason="Export needs the document engine, which is not built yet." />
          </div>
        </div>
        <nav aria-label="Studio mode" className="flex gap-1 overflow-x-auto border-t border-line px-3 sm:px-5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              title={m.blurb}
              className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm text-ink-2 hover:text-ink aria-pressed:border-ink aria-pressed:text-ink"
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      <main id="main" className={cn("grid flex-1 gap-4 p-3 sm:p-5 lg:gap-5", inspectorOpen ? "lg:grid-cols-[300px_minmax(0,1fr)_280px]" : "lg:grid-cols-[300px_minmax(0,1fr)]")}>
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

        <section aria-label="Document canvas" className="flex min-w-0 flex-col rounded-2xl border border-line bg-[#efebe3]">
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            {!composing && (
              <Button variant="ghost" size="sm" aria-pressed={split} onClick={() => setSplit(!split)} className="aria-pressed:bg-line/70">
                <Columns2 className="size-4" aria-hidden /> Split view
              </Button>
            )}
            <Badge tone="pending" className="ml-1" title="Appears once edits exist">
              Diff after edits
            </Badge>
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
              <Button variant="ghost" size="sm" className="hidden lg:inline-flex" aria-label={inspectorOpen ? "Hide settings" : "Show settings"} onClick={() => setInspectorOpen(!inspectorOpen)}>
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
                <Pane title={mode === "convert" ? "Assignment 1 — content" : "Original"} upload={uploads.source} zoom={zoom} />
                {split &&
                  (mode === "convert" ? (
                    <ConvertPlaceholder hasStyle={!!uploads.reference} />
                  ) : (
                    <Pane title="Edited" upload={uploads.source} zoom={zoom} note="No edits applied yet — identical to the original." />
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
        </section>

        <aside aria-label="Page settings" className={cn("lg:block", !inspectorOpen && "lg:hidden")}>
          <details open className="group rounded-2xl border border-line bg-paper p-4 lg:sticky lg:top-32">
            <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
              Page & output settings <span className="text-muted group-open:hidden">(show)</span>
            </summary>
            <div className="mt-4">
              <Inspector mode={mode} s={layout} onChange={setLayout} />
            </div>
          </details>
        </aside>
      </main>

      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-ivory via-ivory to-transparent px-3 pb-3 pt-6 sm:px-5 sm:pb-5">
        <div className="mx-auto max-w-4xl">
          <Composer mode={mode} value={instruction} onChange={setInstruction} scope={scope} onScope={setScope} onSubmit={() => {}} blockedReason={blocked} />
        </div>
      </div>
    </div>
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

function Pane({ title, upload, zoom, note }: { title: string; upload: Upload; zoom: number; note?: string }) {
  const image = upload.file.type.startsWith("image/");
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-ink-2">
        {title}
        {note && <span className="normal-case tracking-normal text-muted">{note}</span>}
      </figcaption>
      <div className="overflow-auto rounded-sm bg-paper shadow-[0_24px_60px_-40px_rgba(27,26,24,0.55)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={upload.url} alt={`${title} page preview`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="block" />
        ) : (
          <div className="grid aspect-[1/1.414] place-items-center p-6 text-center">
            <div>
              <Badge tone="pending">Preview pending</Badge>
              <p className="mt-3 text-sm text-ink-2">{upload.kind.toUpperCase()} page rendering is not built yet.</p>
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}
