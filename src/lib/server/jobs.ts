// Render-job queue for the outbound-polling GPU worker.
// ponytail: in-memory store — survives only while one server process lives (local `next start`/dev).
// Phase 5 moves the same state machine onto Neon + object storage for Vercel.
import { createHash, timingSafeEqual } from "node:crypto";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type Blob_ = { data: Uint8Array; type: string; sha256: string };
export type Job = {
  id: string;
  kind: "handwriting";
  status: JobStatus;
  payload: Record<string, unknown>;
  inputs: Map<string, Blob_>;
  artifacts: Map<string, Blob_>;
  manifest?: Record<string, unknown>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  leaseUntil?: number;
  workerId?: string;
  idempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
  history: { at: number; status: JobStatus; note?: string }[];
};

export const LEASE_MS = 120_000;
const ONLINE_MS = 30_000;
const MAX_JOBS = 50;

const jobs = new Map<string, Job>();
const workersSeen = new Map<string, number>();

export const sha256 = (d: Uint8Array) => createHash("sha256").update(d).digest("hex");

function set(job: Job, status: JobStatus, now: number, note?: string) {
  job.status = status;
  job.updatedAt = now;
  job.history.push({ at: now, status, note });
}

export function createJob(payload: Record<string, unknown>, inputs: Record<string, { data: Uint8Array; type: string }>, idempotencyKey?: string, now = Date.now()): Job {
  if (idempotencyKey) for (const j of jobs.values()) if (j.idempotencyKey === idempotencyKey) return j;
  if (jobs.size >= MAX_JOBS) {
    // Drop the oldest finished job to bound memory.
    const old = [...jobs.values()].filter((j) => j.status !== "queued" && j.status !== "running").sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!old) throw new Error("The job queue is full. Wait for running jobs to finish.");
    jobs.delete(old.id);
  }
  const job: Job = {
    id: crypto.randomUUID(),
    kind: "handwriting",
    status: "queued",
    payload,
    inputs: new Map(Object.entries(inputs).map(([k, v]) => [k, { ...v, sha256: sha256(v.data) }])),
    artifacts: new Map(),
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, status: "queued" }],
  };
  jobs.set(job.id, job);
  return job;
}

export const getJob = (id: string) => jobs.get(id);

/** Expired leases go back to the queue until the retry budget is spent. */
function reap(now: number) {
  for (const j of jobs.values())
    if (j.status === "running" && (j.leaseUntil ?? 0) < now) {
      if (j.attempts < j.maxAttempts) set(j, "queued", now, "Worker stopped responding; re-queued.");
      else {
        j.error = "The worker stopped responding too many times.";
        set(j, "failed", now, j.error);
      }
    }
}

export function claimJob(workerId: string, now = Date.now()): Job | undefined {
  workersSeen.set(workerId, now);
  reap(now);
  const job = [...jobs.values()].filter((j) => j.status === "queued").sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!job) return;
  job.attempts++;
  job.workerId = workerId;
  job.leaseUntil = now + LEASE_MS;
  job.artifacts.clear();
  set(job, "running", now, `Attempt ${job.attempts} on ${workerId}`);
  return job;
}

/** Only the worker holding the lease may act on a running job. */
function owned(id: string, workerId: string, now: number) {
  workersSeen.set(workerId, now);
  const job = jobs.get(id);
  if (!job || job.status !== "running" || job.workerId !== workerId) return null;
  return job;
}

export function heartbeat(id: string, workerId: string, now = Date.now()) {
  const job = jobs.get(id);
  if (job?.status === "cancelled") return { cancelled: true };
  const j = owned(id, workerId, now);
  if (!j) return null;
  j.leaseUntil = now + LEASE_MS;
  return { cancelled: false };
}

export function putArtifact(id: string, workerId: string, name: string, data: Uint8Array, type: string, claimedSha: string, now = Date.now()) {
  const j = owned(id, workerId, now);
  if (!j) return "not-owned";
  if (!/^[\w.-]{1,64}$/.test(name)) return "bad-name";
  if (sha256(data) !== claimedSha) return "checksum-mismatch";
  j.artifacts.set(name, { data, type, sha256: claimedSha });
  j.leaseUntil = now + LEASE_MS;
  return "ok";
}

export function completeJob(id: string, workerId: string, manifest: Record<string, unknown>, now = Date.now()) {
  const j = owned(id, workerId, now);
  if (!j) return "not-owned";
  const listed = (manifest.artifacts as { name: string; sha256: string }[] | undefined) ?? [];
  if (!listed.length || listed.some((a) => j.artifacts.get(a.name)?.sha256 !== a.sha256)) return "artifacts-mismatch";
  j.manifest = manifest;
  j.leaseUntil = undefined;
  set(j, "succeeded", now);
  return "ok";
}

export function failJob(id: string, workerId: string, error: string, retryable: boolean, now = Date.now()) {
  const j = owned(id, workerId, now);
  if (!j) return "not-owned";
  j.error = error.slice(0, 500);
  j.leaseUntil = undefined;
  if (retryable && j.attempts < j.maxAttempts) set(j, "queued", now, `Retrying after: ${j.error}`);
  else set(j, "failed", now, j.error);
  return "ok";
}

export function cancelJob(id: string, now = Date.now()) {
  const j = jobs.get(id);
  if (!j || j.status === "succeeded" || j.status === "failed") return false;
  set(j, "cancelled", now, "Cancelled by owner.");
  return true;
}

export function workerOnline(now = Date.now()) {
  const last = Math.max(0, ...workersSeen.values());
  return { online: now - last < ONLINE_MS, lastSeen: last || null };
}

export function publicJob(j: Job, now = Date.now()) {
  reap(now);
  return {
    id: j.id,
    status: j.status,
    attempts: j.attempts,
    error: j.error ?? null,
    manifest: j.manifest ?? null,
    artifacts: [...j.artifacts.keys()].sort(),
    history: j.history,
    store: "memory" as const,
  };
}

/** Constant-time bearer check for worker endpoints. */
export function workerAuth(req: Request): { workerId: string } | Response {
  const token = process.env.WORKER_TOKEN;
  if (!token) return Response.json({ error: "Worker access is disabled: WORKER_TOKEN is not set on the server." }, { status: 503 });
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(got), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Invalid worker token." }, { status: 401 });
  const workerId = (req.headers.get("x-worker-id") ?? "worker").slice(0, 80);
  return { workerId };
}

/** Test helper. */
export function _reset() {
  jobs.clear();
  workersSeen.clear();
}
