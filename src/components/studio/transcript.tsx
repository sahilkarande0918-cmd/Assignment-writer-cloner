"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PagePreview } from "@/lib/doc/load";
import { garbleScore, GARBLED, tablePage } from "@/lib/transcript";

const CONSENT_KEY = "as_vision_consent";
const remembered = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "yes";
  } catch {
    return false;
  }
};

/** Downscale a rendered page to a JPEG data URL small enough for the serverless body limit. */
async function pageToJpeg(url: string, maxSide = 1600) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

/** The content that will be written (Convert, and Handwriting Clone from a source file) — the user must confirm it.
 * Scans and photos are read with Groq vision (handwriting and tables defeat the local OCR), after consent. */
export function Transcript({
  value,
  onChange,
  confirmed,
  onConfirm,
  previews,
  aiReady,
  scanned,
  fileName,
}: {
  value: string;
  onChange: (v: string) => void;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  previews: PagePreview[];
  aiReady: boolean;
  scanned: boolean;
  fileName?: string;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [readByAi, setReadByAi] = useState(false);
  const auto = useRef<PagePreview[] | null>(null);

  useEffect(() => {
    const id = requestIdleCallback(() => setConsent(remembered()));
    return () => cancelIdleCallback(id);
  }, []);

  async function readWithAi() {
    setError(undefined);
    const pages: string[] = [];
    let header: string | undefined;
    try {
      for (let i = 0; i < previews.length; i++) {
        setBusy(`Reading page ${i + 1} of ${previews.length} with AI`);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consent: true, image: await pageToJpeg(previews[i].url), tableHeader: header }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Transcription failed.");
        const page = tablePage(json.text, header);
        header = page.header;
        pages.push(page.text);
      }
      onChange(pages.join("\n\f\n"));
      onConfirm(false);
      setReadByAi(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  // Scans: read with AI as soon as consent exists (given now or remembered), once per document.
  useEffect(() => {
    if (!scanned || !consent || !aiReady || !previews.length || busy || auto.current === previews) return;
    auto.current = previews;
    const id = requestIdleCallback(() => void readWithAi());
    return () => cancelIdleCallback(id);
  });

  const garbled = !!value.trim() && garbleScore(value) > GARBLED;
  return (
    <section aria-labelledby="tr-h" className="flex flex-col rounded-2xl border border-line bg-paper p-4">
      <h2 id="tr-h" className="font-display text-2xl">
        Content to write
      </h2>
      <p className="mt-1 text-xs text-muted">
        This exact text{fileName ? <> from <strong className="font-medium text-ink-2">{fileName}</strong></> : ""} will be written in the reference handwriting. Check and correct it here. Tables are
        rows with cells separated by &quot; | &quot;; a form feed separates pages.
      </p>
      {scanned && !readByAi && (
        <div className="mt-3 space-y-2 rounded-xl bg-ivory p-3">
          <p className="text-xs text-ink-2">
            This file is a scan or photo. The built-in reader cannot read handwriting or tables reliably, so it is read with AI (Groq vision) instead.
          </p>
          <label className="flex items-start gap-2 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={consent}
              disabled={!aiReady}
              onChange={(e) => {
                setConsent(e.target.checked);
                try {
                  localStorage.setItem(CONSENT_KEY, e.target.checked ? "yes" : "no");
                } catch {}
              }}
              className="mt-0.5 accent-[var(--color-bronze)]"
            />
            <span>Send this file&apos;s page images to Groq to read them (remembered on this device).{!aiReady && " (Groq is not configured.)"}</span>
          </label>
          {busy && <p className="text-xs font-medium text-ink">{busy}…</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {garbled && (
        <p className="mt-2 rounded-lg bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] p-2 text-xs text-danger">
          This text looks garbled ({Math.round(garbleScore(value) * 100)}% of the words are symbols or debris). Generating it would write nonsense — read the file with AI or correct the
          text first.
        </p>
      )}
      <label htmlFor="transcript" className="sr-only">
        Transcript
      </label>
      <textarea
        id="transcript"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onConfirm(false);
        }}
        className="mt-3 min-h-[280px] resize-y rounded-xl border border-line-strong bg-ivory/50 p-3 font-mono text-sm leading-relaxed"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={confirmed} disabled={!value.trim() || !!busy} onChange={(e) => onConfirm(e.target.checked)} className="size-4 accent-[var(--color-bronze)]" />
          I have checked this text
        </label>
        {readByAi && (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={readWithAi}>
            Read again with AI
          </Button>
        )}
        {!scanned && aiReady && (
          <Button size="sm" variant="ghost" disabled={!consent || !!busy || !previews.length} onClick={readWithAi} title={consent ? undefined : "Needs consent to send page images to Groq"}>
            {busy ?? "Read with AI instead"}
          </Button>
        )}
      </div>
    </section>
  );
}
