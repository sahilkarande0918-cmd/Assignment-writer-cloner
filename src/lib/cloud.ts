"use client";
// Browser client for the owner's project library. Files go straight to private storage via signed URLs.

export type ProjectRow = { id: string; name: string; mode: string; status: string; cursor: number; createdAt: string; updatedAt: string; bytes: number; versions: number; jobs: number };
export type CloudFile = { id: string; slot: string; name: string; kind: string | null; mime: string; bytes: number; status: string; url: string | null; downloadUrl: string | null };
export type CloudProject = {
  project: { id: string; name: string; mode: string; status: string; settings: Record<string, unknown>; cursor: number; updatedAt: string; createdAt: string };
  files: CloudFile[];
  versions: { id: string; index: number; label: string; method: string; file: CloudFile | null; operations: { op: unknown; report: unknown }[] }[];
  jobs: { id: string; status: string; createdAt: string; manifest: unknown }[];
};

export class CloudError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new CloudError(body.error ?? `Request failed (${r.status}).`, r.status);
  return body as T;
}

export const listProjects = (q = "", mode = "") => call<{ projects: ProjectRow[]; total: number; limit: number }>(`/api/projects?${new URLSearchParams({ ...(q && { q }), ...(mode && { mode }) })}`);
export const createProject = (name: string, mode: string) => call<{ project: CloudProject["project"] }>("/api/projects", { method: "POST", body: JSON.stringify({ name, mode }) });
export const getProject = (id: string) => call<CloudProject>(`/api/projects/${id}`);
export const patchProject = (id: string, expectedUpdatedAt: string, patch: Record<string, unknown>) =>
  call<{ project: CloudProject["project"] }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ expectedUpdatedAt, ...patch }) });
export const deleteProject = (id: string) => call<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" });
export const duplicateProject = (id: string) => call<{ project: CloudProject["project"] }>(`/api/projects/${id}/duplicate`, { method: "POST" });

/** Signed PUT straight to storage, then server-side size + signature confirmation. */
export async function uploadFile(projectId: string, slot: "source" | "reference" | "paper" | "version", file: File) {
  const mime = file.type || "application/octet-stream";
  const { fileId, uploadUrl } = await call<{ fileId: string; uploadUrl: string }>(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: JSON.stringify({ slot, name: file.name, size: file.size, mime }),
  });
  const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": mime } });
  if (!put.ok) throw new CloudError("Upload to storage failed.", put.status);
  return (await call<{ file: CloudFile & { projectUpdatedAt: string } }>(`/api/projects/${projectId}/files/${fileId}/confirm`, { method: "POST" })).file;
}

export const addVersion = (projectId: string, body: { fileId: string; index: number; label: string; method: string; operations: { op: unknown; report: unknown }[] }) =>
  call<{ version: { id: string; projectUpdatedAt: string } }>(`/api/projects/${projectId}/versions`, { method: "POST", body: JSON.stringify(body) });

/** Re-materialise a stored file as a File for the in-browser engines. */
export async function fetchFile(f: CloudFile) {
  const r = await fetch(f.url!);
  if (!r.ok) throw new CloudError(`Could not load ${f.name}.`, r.status);
  return new File([await r.blob()], f.name, { type: f.mime });
}
