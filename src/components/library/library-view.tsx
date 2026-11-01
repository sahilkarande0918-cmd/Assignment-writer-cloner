"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Download, Pencil, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { CloudError, deleteProject, duplicateProject, getProject, listProjects, patchProject, type ProjectRow } from "@/lib/cloud";
import { MODES } from "@/lib/studio";
import { formatBytes } from "@/lib/utils";

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.id, m.label]));
const STATUS: Record<string, { tone: "neutral" | "ok" | "warn"; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  edited: { tone: "ok", label: "Edited" },
  generated: { tone: "warn", label: "Generated handwriting" },
};

export function LibraryView() {
  const [rows, setRows] = useState<ProjectRow[]>();
  const [meta, setMeta] = useState<{ total: number; limit: number }>();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [renaming, setRenaming] = useState<ProjectRow>();
  const [deleting, setDeleting] = useState<ProjectRow>();

  const load = useCallback(async () => {
    try {
      const r = await listProjects(q, mode);
      setRows(r.projects);
      setMeta({ total: r.total, limit: r.limit });
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, [q, mode]);

  useEffect(() => {
    const t = window.setTimeout(load, 250); // debounce typing
    return () => window.clearTimeout(t);
  }, [load]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof CloudError ? e.message : "That did not work. Nothing was changed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function download(p: ProjectRow) {
    const d = await getProject(p.id);
    const latest = d.versions.find((v) => v.index === d.project.cursor)?.file ?? d.files.find((f) => f.slot === "source") ?? d.files[0];
    if (!latest?.downloadUrl) throw new CloudError("This project has no file to download yet.", 404);
    window.location.assign(latest.downloadUrl);
  }

  return (
    <div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search projects</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="w-full rounded-full border border-line-strong bg-paper py-2 pl-9 pr-4 text-sm" />
        </label>
        <select aria-label="Filter by mode" value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-full border border-line-strong bg-paper px-3 py-2 text-sm">
          <option value="">All modes</option>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {meta && (
          <p className="ml-auto text-sm text-muted">
            {meta.total} of {meta.limit} projects · kept until you delete them
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-danger/30 bg-paper p-4 text-sm text-danger">
          {error}
        </p>
      )}

      {rows === undefined ? (
        <p role="status" className="py-20 text-center text-sm text-muted">
          Loading your library…
        </p>
      ) : rows.length === 0 && !error ? (
        <div className="grid min-h-[36vh] place-items-center py-16 text-center">
          <div className="max-w-md">
            <p className="font-display text-3xl">{q || mode ? "No projects match." : "No saved projects yet."}</p>
            <p className="mt-3 text-ink-2">Open the studio and add a document — projects save automatically.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-col bg-paper p-5">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/studio?project=${p.id}`} className="min-w-0 font-display text-2xl leading-tight hover:underline">
                  <span className="line-clamp-2 break-words">{p.name}</span>
                </Link>
                <Badge tone={STATUS[p.status]?.tone ?? "neutral"}>{STATUS[p.status]?.label ?? p.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">
                {MODE_LABEL[p.mode] ?? p.mode} · {p.versions} version{p.versions === 1 ? "" : "s"} · {formatBytes(p.bytes)} · updated {new Date(p.updatedAt).toLocaleString()}
              </p>
              <div className="mt-auto flex flex-wrap gap-1 pt-5">
                <Link href={`/studio?project=${p.id}`} className={buttonClass({ size: "sm" })}>
                  Open
                </Link>
                <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => setRenaming(p)} aria-label={`Rename ${p.name}`}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => act(p.id, () => duplicateProject(p.id))} aria-label={`Duplicate ${p.name}`}>
                  <Copy className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => act(p.id, () => download(p))} aria-label={`Download ${p.name}`}>
                  <Download className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`} className="ml-auto text-danger">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog.Root open={!!renaming} onOpenChange={(o) => !o && setRenaming(undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-paper p-6">
            <Dialog.Title className="font-display text-3xl">Rename</Dialog.Title>
            <Dialog.Description className="sr-only">Choose a new project name.</Dialog.Description>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                const p = renaming!;
                setRenaming(undefined);
                if (name && name !== p.name) act(p.id, () => patchProject(p.id, p.updatedAt, { name }));
              }}
            >
              <label className="block text-sm font-medium">
                Project name
                <input name="name" defaultValue={renaming?.name} maxLength={120} required className="mt-1.5 w-full rounded-lg border border-line-strong bg-paper px-3 py-2" />
              </label>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="ghost">Cancel</Button>
                </Dialog.Close>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!deleting} onOpenChange={(o) => !o && setDeleting(undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-paper p-6">
            <Dialog.Title className="font-display text-3xl">Delete project?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-ink-2">
              “{deleting?.name}” and all its files, versions and generated pages will be permanently deleted from your storage. This cannot be undone.
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost">Keep it</Button>
              </Dialog.Close>
              <Button
                className="bg-danger hover:bg-danger/90"
                onClick={() => {
                  const p = deleting!;
                  setDeleting(undefined);
                  act(p.id, () => deleteProject(p.id));
                }}
              >
                Delete permanently
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
