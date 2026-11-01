"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ExportRequest, ExportResult } from "@/lib/export";
import type { ExportFormat, PageSize } from "@/lib/studio";

const FORMATS: { id: ExportFormat; label: string; note: string }[] = [
  { id: "pdf", label: "PDF", note: "Primary, print-ready" },
  { id: "png", label: "PNG", note: "Per page; ZIP for multi-page" },
  { id: "jpeg", label: "JPEG", note: "Per page; ZIP for multi-page" },
  { id: "docx", label: "DOCX", note: "Native for Word files; text-only otherwise" },
  { id: "txt", label: "TXT", note: "Text extraction" },
  { id: "md", label: "Markdown", note: "Text extraction" },
];

export function ExportDialog({
  pageSize,
  onExport,
  disabledReason,
  unavailable,
}: {
  pageSize: PageSize;
  onExport?: (r: ExportRequest) => Promise<ExportResult>;
  disabledReason?: string;
  unavailable?: (f: ExportFormat) => string | null;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [dpi, setDpi] = useState(200);
  const [size, setSize] = useState<PageSize>(pageSize);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const raster = format === "png" || format === "jpeg";
  const why = unavailable?.(format) ?? null;

  async function run() {
    if (!onExport) return;
    setBusy(true);
    setMsg(undefined);
    try {
      const r = await onExport({ format, dpi, pageSize: size });
      const url = URL.createObjectURL(r.blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: r.filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMsg({ tone: "ok", text: `Saved ${r.filename}.${r.note ? ` ${r.note}` : ""}` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root onOpenChange={() => setMsg(undefined)}>
      <Dialog.Trigger asChild>
        <Button size="sm">
          <Download className="size-4" aria-hidden /> Export
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92svh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-line bg-paper p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <Dialog.Title className="font-display text-3xl">Export</Dialog.Title>
            <Dialog.Close className="rounded-full p-1.5 text-muted hover:bg-line hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted">Exports the current version. Choose a format, page size and image resolution.</Dialog.Description>
          <fieldset className="mt-5 grid grid-cols-2 gap-2">
            <legend className="sr-only">Format</legend>
            {FORMATS.map((f) => {
              const off = unavailable?.(f.id);
              return (
                <label key={f.id} title={off ?? undefined} className="cursor-pointer rounded-lg border border-line p-3 has-[:checked]:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bronze">
                  <input type="radio" name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} className="sr-only" />
                  <span className="block text-sm font-medium">
                    {f.label}
                    {off && <span className="text-xs font-normal text-muted"> · unavailable</span>}
                  </span>
                  <span className="block text-xs text-muted">{f.note}</span>
                </label>
              );
            })}
          </fieldset>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-2">Page size (generated pages)</span>
              <select value={size} onChange={(e) => setSize(e.target.value as PageSize)} className="w-full rounded-lg border border-line-strong bg-paper px-3 py-2">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-2">Image DPI</span>
              <select value={dpi} disabled={!raster} onChange={(e) => setDpi(+e.target.value)} className="w-full rounded-lg border border-line-strong bg-paper px-3 py-2 disabled:text-muted">
                {[150, 200, 300].map((d) => (
                  <option key={d} value={d}>
                    {d} DPI
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(disabledReason || why) && (
            <p role="status" className="mt-4 rounded-lg bg-ivory p-3 text-xs text-ink-2">
              {disabledReason ?? why}
            </p>
          )}
          {msg && (
            <p role={msg.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-lg bg-ivory p-3 text-xs ${msg.tone === "error" ? "text-danger" : "text-ok"}`}>
              {msg.text}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">Close</Button>
            </Dialog.Close>
            <Button disabled={!!disabledReason || !!why || !onExport || busy} onClick={run}>
              {busy ? "Exporting…" : `Export ${FORMATS.find((f) => f.id === format)?.label}`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
