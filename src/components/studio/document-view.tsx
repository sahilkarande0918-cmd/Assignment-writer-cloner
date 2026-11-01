"use client";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { Span } from "@/lib/doc/model";
import { cn } from "@/lib/utils";
import type { DocState } from "./use-document";

export type Marks = { selected?: Set<string>; targets?: Set<string> };

function DocxPreview({ file }: { file: Blob }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    import("docx-preview").then(({ renderAsync }) => live && renderAsync(file, el, undefined, { inWrapper: false, ignoreLastRenderedPageBreak: false }));
    return () => {
      live = false;
      el.replaceChildren();
    };
  }, [file]);
  return <div ref={ref} className="docx-preview overflow-auto bg-paper p-6 text-ink" />;
}

export function DocumentView({
  state,
  file,
  page,
  zoom,
  marks,
  onSpan,
  label,
}: {
  state: DocState;
  file?: Blob;
  page: number;
  zoom: number;
  marks?: Marks;
  onSpan?: (id: string) => void;
  label: string;
}) {
  if (state.status === "empty") return null;
  if (state.status === "loading")
    return (
      <div role="status" className="grid aspect-[1/1.414] place-items-center rounded-sm bg-paper text-sm text-ink-2">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {state.message}…
        </span>
      </div>
    );
  if (state.status === "error")
    return (
      <p role="alert" className="rounded-sm bg-paper p-6 text-sm text-danger">
        {state.message}
      </p>
    );

  const { model, previews } = state.loaded;
  if (model.kind === "docx" && file) return <DocxPreview file={file} />;
  if (!previews.length)
    return <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-sm bg-paper p-6 font-mono text-sm leading-relaxed">{model.spans.map((s) => s.text).join("\n")}</pre>;

  const preview = previews[Math.min(page, previews.length - 1)];
  const size = model.pages[page] ?? model.pages[0];
  const pageSpans = model.spans.filter((s) => s.page === page && s.box);
  return (
    <div className="overflow-auto rounded-sm bg-paper shadow-[0_24px_60px_-40px_rgba(27,26,24,0.55)]">
      <div className="relative" style={{ width: `${zoom * 100}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local rendered page */}
        <img src={preview.url} alt={`${label}, page ${page + 1}`} className="block w-full" />
        <svg viewBox={`0 0 ${size.width} ${size.height}`} className="absolute inset-0 size-full" aria-hidden>
          {pageSpans.map((s) => (
            <SpanBox key={s.id} s={s} marks={marks} onSpan={onSpan} />
          ))}
        </svg>
      </div>
    </div>
  );
}

function SpanBox({ s, marks, onSpan }: { s: Span; marks?: Marks; onSpan?: (id: string) => void }) {
  const sel = marks?.selected?.has(s.id);
  const tgt = marks?.targets?.has(s.id);
  if (!sel && !tgt && !onSpan) return null;
  const b = s.box!;
  return (
    <rect
      x={b.x - 1}
      y={b.y - 1}
      width={b.w + 2}
      height={b.h + 2}
      rx={1}
      onClick={onSpan ? () => onSpan(s.id) : undefined}
      className={cn(
        "transition-colors",
        onSpan && "cursor-pointer fill-transparent hover:fill-[#8c6a43]/10",
        sel && "fill-[#8c6a43]/15 stroke-[#8c6a43]",
        tgt && "fill-[#e8c46a]/35 stroke-[#b8892a]",
      )}
      strokeWidth={sel || tgt ? 0.8 : 0}
    />
  );
}
