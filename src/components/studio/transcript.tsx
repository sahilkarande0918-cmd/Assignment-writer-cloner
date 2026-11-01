"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PagePreview } from "@/lib/doc/load";

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

/** Convert mode: the transcript of assignment 1 is the content that will be written — the owner must confirm it. */
export function Transcript({
  value,
  onChange,
  confirmed,
  onConfirm,
  previews,
  aiReady,
}: {
  value: string;
  onChange: (v: string) => void;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  previews: PagePreview[];
  aiReady: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function improve() {
    setError(undefined);
    const pages: string[] = [];
    try {
      for (let i = 0; i < previews.length; i++) {
        setBusy(`Transcribing page ${i + 1} of ${previews.length} with Groq vision`);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consent: true, image: await pageToJpeg(previews[i].url) }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Transcription failed.");
        pages.push(json.text);
      }
      onChange(pages.join("\n\f\n"));
      onConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-labelledby="tr-h" className="flex flex-col rounded-2xl border border-line bg-paper p-4">
      <h2 id="tr-h" className="font-display text-2xl">
        Transcript of assignment 1
      </h2>
      <p className="mt-1 text-xs text-muted">This exact text will be written in assignment 2&apos;s handwriting. OCR of handwriting is imperfect — correct it here. A form feed (page break) separates pages.</p>
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
      <div className="mt-3 space-y-2 rounded-xl bg-ivory p-3">
        <label className="flex items-start gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!aiReady} className="mt-0.5 accent-[var(--color-bronze)]" />
          <span>I agree to send page images of assignment 1 to Groq for a better handwriting transcription.{!aiReady && " (Groq is not configured.)"}</span>
        </label>
        <Button size="sm" variant="secondary" disabled={!consent || !aiReady || !!busy || !previews.length} onClick={improve}>
          {busy ?? "Improve transcript with Groq vision"}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={confirmed} disabled={!value.trim()} onChange={(e) => onConfirm(e.target.checked)} className="size-4 accent-[var(--color-bronze)]" />
        I have checked this transcript
      </label>
    </section>
  );
}
