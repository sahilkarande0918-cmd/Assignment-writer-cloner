"use client";
import { useId, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { INPUT_FORMATS, readHead, validateUpload, type InputKind } from "@/lib/formats";
import type { SlotSpec } from "@/lib/studio";
import { cn, formatBytes } from "@/lib/utils";

export type Upload = { file: File; kind: InputKind; url: string };

export function UploadCard({ spec, value, onChange }: { spec: SlotSpec; value?: Upload; onChange: (u?: Upload) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [over, setOver] = useState(false);
  const id = useId();
  const accept = spec.accept.flatMap((k) => [...INPUT_FORMATS[k].ext, ...INPUT_FORMATS[k].mime]).join(",");

  async function take(file?: File) {
    if (!file) return;
    const v = validateUpload(await readHead(file), file.name, file.size, spec.accept);
    if (!v.ok) {
      setError(v.reason);
      return;
    }
    setError(undefined);
    if (value) URL.revokeObjectURL(value.url);
    onChange({ file, kind: v.kind, url: URL.createObjectURL(file) });
  }

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={`${id}-t`} className="text-sm font-medium">
          {spec.title}
        </h3>
        <span className="text-[11px] uppercase tracking-[0.12em] text-muted">{spec.required ? "Required" : "Optional"}</span>
      </div>
      {value ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-ivory p-2.5">
          {value.file.type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={value.url} alt="" className="size-12 rounded object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded bg-line/70 font-mono text-[11px] uppercase text-ink-2">{value.kind}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm" title={value.file.name}>
              {value.file.name}
            </p>
            <p className="text-xs text-muted">
              {INPUT_FORMATS[value.kind].label} · {formatBytes(value.file.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(value.url);
              onChange(undefined);
            }}
            className="rounded-full p-1.5 text-muted hover:bg-line hover:text-ink"
            aria-label={`Remove ${value.file.name}`}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files[0]);
          }}
          aria-describedby={`${id}-h`}
          className={cn(
            "mt-3 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center transition-colors hover:border-ink hover:bg-ivory",
            over && "border-ink bg-ivory",
          )}
        >
          <FileUp className="size-5 text-bronze" aria-hidden />
          <span className="text-sm font-medium">Choose or drop a file</span>
          <span id={`${id}-h`} className="text-xs text-muted">
            {spec.hint}
          </span>
        </button>
      )}
      <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
