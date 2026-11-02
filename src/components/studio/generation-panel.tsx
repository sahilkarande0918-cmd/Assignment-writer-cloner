"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cer, missedWords, type HwManifest, type HwPayload } from "@/lib/hwjob";
import { pageImage } from "@/lib/doc/page-image";
import { imagesToPdf } from "@/lib/export";
import type { LayoutSettings } from "@/lib/studio";
import type { Upload } from "./upload-card";

type Progress = { stage: string; done?: number; total?: number; percent: number; eta?: number | null };
type JobView = { id: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; attempts: number; error: string | null; progress: Progress | null; manifest: HwManifest | null; artifacts: string[]; history: { at: number; status: string; note?: string }[] };
type Worker = { online: boolean; lastSeen: number | null; enabled?: boolean; cloud?: boolean };
type Quota = { used: number; limit: number | null; left: number | null };
type Check = { cer: number; missed: string[] };
export type GeneratedSet = { pages: string[]; ink: string[]; paper?: string };

/** Split a job's artifacts into composite pages, ink-only layers and the paper-only template. */
export function artifactSet(id: string, names: string[]): GeneratedSet {
  const url = (n: string) => `/api/jobs/${id}/artifacts/${n}`;
  return { pages: names.filter((n) => n.startsWith("page-")).map(url), ink: names.filter((n) => n.startsWith("ink-")).map(url), paper: names.includes("paper.png") ? url("paper.png") : undefined };
}

const STATUS_TEXT: Record<JobView["status"], string> = {
  queued: "Waiting for a GPU worker",
  running: "Generating",
  succeeded: "Generated",
  failed: "Failed",
  cancelled: "Cancelled",
};

const duration = (s: number) => (s < 60 ? "under a minute" : s < 3600 ? `about ${Math.round(s / 60)} min` : `about ${(s / 3600).toFixed(1)} h`);

/** Progress bar fed by the worker heartbeat; indeterminate while the GPU starts. */
function JobProgress({ job, cloud }: { job: JobView; cloud?: boolean }) {
  const p = job.status === "running" ? job.progress : null;
  const label = job.status === "queued" ? (cloud ? "Starting the cloud GPU — usually about a minute" : "Waiting for a GPU worker to pick this up") : p ? p.stage : "Loading the handwriting model";
  const pct = p ? Math.min(100, Math.max(0, p.percent)) : null;
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label="Generation progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={pct === null ? label : `${Math.round(pct)}% — ${label}`}
        className="h-2.5 overflow-hidden rounded-full bg-line"
      >
        <div className={`h-full rounded-full bg-ink transition-[width] duration-700 ${pct === null ? "w-1/3 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="flex flex-wrap justify-between gap-x-4 text-xs text-ink-2">
        <span>
          {label}
          {p?.total && p.stage === "Writing words" ? ` — ${p.done ?? 0} of ${p.total} word samples` : ""}
        </span>
        <span>
          {pct !== null && `${Math.round(pct)}%`}
          {p?.eta ? ` · ${duration(p.eta)} left` : ""}
        </span>
      </p>
    </div>
  );
}

/** Generation for Handwriting Clone and Convert. Jobs run on a cloud GPU started per job (or a local worker) via outbound polling. */
export function GenerationPanel({
  text,
  textReady,
  reference,
  paper,
  layout,
  projectId,
  onPages,
}: {
  text: string;
  textReady: string | null; // reason generation is blocked, or null
  reference?: Upload;
  paper?: { upload: Upload; page: number };
  layout: LayoutSettings;
  projectId: string | null;
  onPages: (v: GeneratedSet) => void;
}) {
  const [worker, setWorker] = useState<Worker>();
  const [quota, setQuota] = useState<Quota>();
  const [job, setJob] = useState<JobView>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [candidates, setCandidates] = useState(3);
  const [bumps, setBumps] = useState<Record<string, number>>({});
  const [sentText, setSentText] = useState("");
  const [check, setCheck] = useState<Check | "running">();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const poll = () => fetch("/api/worker/status").then((r) => r.json()).then(setWorker).catch(() => {});
    poll();
    fetch("/api/me")
      .then((r) => r.json())
      .then((j) => setQuota(j.quota))
      .catch(() => {});
    const t = window.setInterval(poll, 10_000);
    return () => window.clearInterval(t);
  }, []);

  // Follow the job until it reaches a terminal state.
  useEffect(() => {
    if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return;
    timer.current = window.setTimeout(async () => {
      const r = await fetch(`/api/jobs/${job.id}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.error);
        return;
      }
      setJob(j.job);
      setWorker(j.worker);
      if (j.job.status === "succeeded") onPages(artifactSet(j.job.id, j.job.artifacts));
    }, 2000);
    return () => window.clearTimeout(timer.current);
  }, [job, onPages]);

  async function submit(nextBumps = bumps) {
    if (!reference) return;
    setSubmitting(true);
    setError(undefined);
    setCheck(undefined);
    try {
      const payload: HwPayload = {
        text,
        pageSize: layout.pageSize,
        paper: paper ? "reference" : layout.paper === "reference" || layout.paper === "source" ? "ruled" : layout.paper,
        marginLeftMm: layout.marginLeftMm,
        marginTopMm: layout.marginTopMm,
        lineSpacingMm: layout.lineSpacingMm,
        penColor: layout.penColor as HwPayload["penColor"],
        sizePt: layout.sizePt,
        keepLineBreaks: layout.keepLineBreaks,
        seed,
        candidates,
        bumps: nextBumps,
      };
      const form = new FormData();
      form.set("payload", JSON.stringify(payload));
      if (projectId) form.set("projectId", projectId);
      form.set("reference", await pageImage(reference.file, reference.kind), "reference.jpg");
      if (paper) form.set("paper", await pageImage(paper.upload.file, paper.upload.kind, paper.page), "paper.jpg");
      const r = await fetch("/api/jobs", { method: "POST", body: form, headers: { "idempotency-key": crypto.randomUUID() } });
      const j = await r.json();
      if (j.quota) setQuota(j.quota);
      if (!r.ok) throw new Error(j.error ?? "Could not queue the job.");
      setJob(j.job);
      setWorker(j.worker);
      setSentText(text);
      onPages({ pages: [], ink: [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function regenerateLine(occ: number[]) {
    const next = { ...bumps };
    for (const o of occ) next[o] = (next[o] ?? 0) + 1;
    setBumps(next);
    submit(next);
  }

  async function ocrCheck() {
    if (!job?.manifest) return;
    setCheck("running");
    const { ocrPage } = await import("@/lib/doc/ocr");
    let read = "";
    for (const name of job.artifacts.filter((n) => n.startsWith("page-"))) {
      const blob = await (await fetch(`/api/jobs/${job.id}/artifacts/${name}`)).blob();
      read += (await ocrPage(blob, 0)).map((s) => s.text).join("\n") + "\n";
    }
    setCheck({ cer: cer(sentText, read), missed: missedWords(sentText, read) });
  }

  async function download(kind: "pdf" | "png") {
    if (!job) return;
    const pages = await Promise.all(job.artifacts.filter((n) => n.startsWith("page-")).map(async (a) => new Uint8Array(await (await fetch(`/api/jobs/${job.id}/artifacts/${a}`)).arrayBuffer())));
    const blob = kind === "pdf" ? new Blob([(await imagesToPdf(pages, layout.pageSize)) as BlobPart], { type: "application/pdf" }) : new Blob([pages[0] as BlobPart], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: kind === "pdf" ? "handwritten.pdf" : "handwritten-page-01.png" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const busy = submitting || job?.status === "queued" || job?.status === "running";
  const paused = quota?.left === 0;
  const m = job?.manifest;
  return (
    <section aria-labelledby="gen-h" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gen-h" className="font-display text-2xl">
          Generate handwriting
        </h2>
        <Badge tone={worker?.cloud || worker?.online ? "ok" : "pending"} title={worker?.enabled === false ? "WORKER_TOKEN is not set on the server" : undefined}>
          {worker === undefined ? "GPU: checking" : worker.enabled === false ? "GPU: disabled" : worker.cloud ? "Cloud GPU ready" : worker.online ? "GPU worker online" : "GPU worker offline"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        Runs the DiffusionPen handwriting model on {worker?.cloud ? "a cloud GPU that starts when you press Generate" : "a GPU worker"}. Results approximate the reference writer&apos;s style; they are marked as generated and are never identical to real handwriting.
        {worker && !worker.cloud && !worker.online && " Jobs wait in the queue until a worker is running."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-2">
          Quality
          <select value={candidates} onChange={(e) => setCandidates(+e.target.value)} className="rounded-full border border-line-strong bg-paper px-2 py-1">
            <option value={1}>Fast — 1 sample per word</option>
            <option value={3}>Balanced — best of 3</option>
            <option value={6}>Best — best of 6 (slowest)</option>
          </select>
        </label>
        <Button size="sm" disabled={!!textReady || !reference || busy || paused} title={textReady ?? undefined} onClick={() => submit()}>
          {submitting ? "Preparing…" : busy ? "Working…" : job ? "Generate again" : "Generate pages"}
        </Button>
        {busy && job && (
          <Button size="sm" variant="ghost" onClick={() => fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" }).then(() => setJob({ ...job, status: "cancelled" }))}>
            Cancel
          </Button>
        )}
        {textReady && <span className="text-xs text-muted">{textReady}</span>}
        {quota?.limit != null && (
          <span className={`text-xs ${paused ? "text-danger" : "text-muted"}`}>
            {paused ? `All ${quota.limit} free generations used — generation is paused.` : `${quota.left} of ${quota.limit} free generations left`}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {job && (
        <div className="mt-4 space-y-3 text-sm" aria-live="polite">
          <p className="flex items-center gap-2">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            <strong className="font-medium">{STATUS_TEXT[job.status]}</strong>
            {job.attempts > 1 && <span className="text-xs text-muted">attempt {job.attempts}</span>}
          </p>
          {busy && <JobProgress job={job} cloud={worker?.cloud} />}
          {job.error && <p className="text-sm text-danger">{job.error}</p>}
          {m && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="warn">Generated handwriting</Badge>
                <Badge>{m.provenance.model}</Badge>
                <Badge tone={m.paper.source === "reference" ? "ok" : "neutral"}>{m.paper.source === "reference" ? "Paper from reference" : "Synthetic paper (approximation)"}</Badge>
                <Badge>{m.pages.length} page{m.pages.length === 1 ? "" : "s"}</Badge>
                <Badge>{m.seconds}s</Badge>
                <Badge tone={m.issues.length ? "danger" : "ok"}>{m.issues.length ? `${m.issues.length} layout issues` : "No overlaps or clipping"}</Badge>
              </div>
              {m.word_check && (
                <p className="text-xs text-ink-2">
                  Word check ({m.word_check.model}, best of {m.word_check.candidates}): {m.word_check.exact_words}/{m.word_check.words} words read back exactly, character error rate{" "}
                  {(m.word_check.cer * 100).toFixed(1)}%.
                  {m.word_check.doubtful.length > 0 && ` Doubtful: ${m.word_check.doubtful.map((d) => `${d.word} (read “${d.read}”)`).slice(0, 8).join(", ")} — regenerate those lines below.`}
                </p>
              )}
              {!!m.font_drawn?.length && (
                <p className="text-xs text-ink-2">
                  Drawn from a handwriting font (the model cannot write them): {m.font_drawn.join(" ")}
                </p>
              )}
              {[...m.paper.notes, ...m.normalised, ...m.issues].map((n) => (
                <p key={n} className="text-xs text-warn">
                  {n}
                </p>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => download("pdf")}>
                  Download PDF
                </Button>
                <Button size="sm" variant="secondary" onClick={() => download("png")}>
                  Page 1 PNG
                </Button>
                <Button size="sm" variant="secondary" disabled={check === "running"} onClick={ocrCheck}>
                  {check === "running" ? "Reading back…" : "OCR back-check"}
                </Button>
              </div>
              {check && check !== "running" && (
                <p className="text-xs text-ink-2">
                  OCR back-check (Tesseract, weak on handwriting — treat as a rough signal): character error rate {(check.cer * 100).toFixed(1)}%.
                  {check.missed.length ? ` Not recognised: ${check.missed.slice(0, 12).join(", ")}${check.missed.length > 12 ? "…" : ""}.` : " Every word was recognised."}
                </p>
              )}
              <details>
                <summary className="cursor-pointer text-xs font-medium text-ink-2">Lines — regenerate a bad one</summary>
                <ol className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
                  {m.pages.flatMap((p, pi) =>
                    p.lines
                      .filter((l) => l.occ.length)
                      .map((l, li) => (
                        <li key={`${pi}-${li}`} className="flex items-center gap-2">
                          <span className="w-10 shrink-0 font-mono text-muted">
                            {pi + 1}.{li + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{l.text}</span>
                          <Button size="sm" variant="ghost" disabled={busy} aria-label={`Regenerate line ${li + 1} on page ${pi + 1}`} onClick={() => regenerateLine(l.occ)}>
                            <RefreshCcw className="size-3.5" />
                          </Button>
                        </li>
                      )),
                  )}
                </ol>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
