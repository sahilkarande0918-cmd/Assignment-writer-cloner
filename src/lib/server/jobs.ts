// Render-job queue for the outbound-polling GPU worker, on Neon Postgres + private object storage.
// Rows hold state; inputs/artifacts live under jobs/<id>/ in the bucket. Every transition appends to history.
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "./db";
import { getObject, putObject, signedGet } from "./storage";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export const LEASE_SECONDS = 120;
const ONLINE_SECONDS = 30;
const TERMINAL: JobStatus[] = ["succeeded", "failed", "cancelled"];

export const sha256 = (d: Uint8Array) => createHash("sha256").update(d).digest("hex");

/** Pure decisions (unit-tested): what happens after a lost lease or a reported failure. */
export const afterLostLease = (attempts: number, max: number): JobStatus => (attempts < max ? "queued" : "failed");
export const afterFailure = (retryable: boolean, attempts: number, max: number): JobStatus => (retryable && attempts < max ? "queued" : "failed");

const entry = (status: string, note?: string) => sql`jsonb_build_array(jsonb_build_object('at', (extract(epoch from now()) * 1000)::bigint, 'status', ${status}::text, 'note', ${note ?? null}::text))`;

export async function createJob(payload: Record<string, unknown>, inputs: Record<string, { data: Uint8Array; type: string }>, idempotencyKey?: string, projectId?: string) {
  if (idempotencyKey) {
    const [dup] = await db().select().from(s.renderJobs).where(eq(s.renderJobs.idempotencyKey, idempotencyKey));
    if (dup) return dup;
  }
  const id = crypto.randomUUID();
  const stored: Record<string, { key: string; type: string; sha256: string }> = {};
  for (const [name, f] of Object.entries(inputs)) {
    const key = `jobs/${id}/inputs/${name}`;
    await putObject(key, f.data, f.type);
    stored[name] = { key, type: f.type, sha256: sha256(f.data) };
  }
  const [job] = await db()
    .insert(s.renderJobs)
    .values({ id, projectId: projectId ?? null, payload, inputs: stored, idempotencyKey: idempotencyKey ?? null, history: sql`${entry("queued")}` })
    .returning();
  return job;
}

/** Return expired leases to the queue (or fail them once the retry budget is spent). */
async function reap() {
  await db().execute(sql`
    update render_jobs set
      status = case when attempts < max_attempts then 'queued' else 'failed' end,
      error = case when attempts < max_attempts then error else 'The worker stopped responding too many times.' end,
      lease_until = null, updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('at', (extract(epoch from now()) * 1000)::bigint,
        'status', case when attempts < max_attempts then 'queued' else 'failed' end, 'note', 'Worker stopped responding.'))
    where status = 'running' and lease_until < now()`);
}

async function seen(workerId: string) {
  await db().insert(s.workers).values({ id: workerId }).onConflictDoUpdate({ target: s.workers.id, set: { lastSeen: sql`now()` } });
}

/** Atomically lease the oldest queued job. SKIP LOCKED makes concurrent workers safe. */
export async function claimJob(workerId: string) {
  await seen(workerId);
  await reap();
  const rows = await db().execute<typeof s.renderJobs.$inferSelect & { max_attempts: number; lease_until: string }>(sql`
    update render_jobs set status = 'running', attempts = attempts + 1, worker_id = ${workerId},
      lease_until = now() + make_interval(secs => ${LEASE_SECONDS}), updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('at', (extract(epoch from now()) * 1000)::bigint, 'status', 'running', 'note', 'Attempt ' || (attempts + 1) || ' on ' || ${workerId}::text))
    where id = (select id from render_jobs where status = 'queued' order by created_at for update skip locked limit 1)
    returning id, kind, payload, inputs`);
  if (rows.rows.length) await db().delete(s.outputArtifacts).where(inArray(s.outputArtifacts.jobId, rows.rows.map((r) => r.id as string)));
  return rows.rows[0] as { id: string; kind: string; payload: unknown; inputs: Record<string, { key: string; type: string; sha256: string }> } | undefined;
}

/** The running job held by this worker, or null (only the lease holder may act). */
async function owned(id: string, workerId: string) {
  await seen(workerId);
  const [j] = await db().select().from(s.renderJobs).where(and(eq(s.renderJobs.id, id), eq(s.renderJobs.status, "running"), eq(s.renderJobs.workerId, workerId)));
  return j ?? null;
}

export async function heartbeat(id: string, workerId: string) {
  const [j] = await db().select({ status: s.renderJobs.status }).from(s.renderJobs).where(eq(s.renderJobs.id, id));
  if (j?.status === "cancelled") return { cancelled: true };
  if (!(await owned(id, workerId))) return null;
  await db().update(s.renderJobs).set({ leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: sql`now()` }).where(eq(s.renderJobs.id, id));
  return { cancelled: false };
}

export async function readInput(id: string, workerId: string, name: string) {
  const j = await owned(id, workerId);
  if (!j) return "not-owned" as const;
  const meta = (j.inputs as Record<string, { key: string; type: string; sha256: string }>)[name];
  if (!meta) return "missing" as const;
  return { data: await getObject(meta.key), type: meta.type, sha256: meta.sha256 };
}

export async function putArtifact(id: string, workerId: string, name: string, data: Uint8Array, type: string, claimedSha: string) {
  if (!/^[\w.-]{1,64}$/.test(name)) return "bad-name";
  if (!(await owned(id, workerId))) return "not-owned";
  if (sha256(data) !== claimedSha) return "checksum-mismatch";
  const key = `jobs/${id}/artifacts/${name}`;
  await putObject(key, data, type);
  await db()
    .insert(s.outputArtifacts)
    .values({ jobId: id, name, mime: type, bytes: data.length, sha256: claimedSha, storageKey: key })
    .onConflictDoUpdate({ target: [s.outputArtifacts.jobId, s.outputArtifacts.name], set: { bytes: data.length, sha256: claimedSha, mime: type } });
  await db().update(s.renderJobs).set({ leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})` }).where(eq(s.renderJobs.id, id));
  return "ok";
}

export async function completeJob(id: string, workerId: string, manifest: Record<string, unknown>) {
  const j = await owned(id, workerId);
  if (!j) return "not-owned";
  const listed = (manifest.artifacts as { name: string; sha256: string }[] | undefined) ?? [];
  const stored = await db().select().from(s.outputArtifacts).where(eq(s.outputArtifacts.jobId, id));
  if (!listed.length || listed.some((a) => stored.find((r) => r.name === a.name)?.sha256 !== a.sha256)) return "artifacts-mismatch";
  await db().update(s.renderJobs).set({ status: "succeeded", manifest, leaseUntil: null, updatedAt: sql`now()`, history: sql`${s.renderJobs.history} || ${entry("succeeded")}` }).where(eq(s.renderJobs.id, id));
  if (j.projectId) {
    const style = manifest.style_crops as number[][] | undefined;
    await db().insert(s.referenceStyles).values({ projectId: j.projectId, cropBoxes: style ?? [], inkColor: (manifest.pen as string) ?? null });
    await db().update(s.projects).set({ status: "generated", updatedAt: sql`now()` }).where(eq(s.projects.id, j.projectId));
  }
  return "ok";
}

export async function failJob(id: string, workerId: string, error: string, retryable: boolean) {
  const j = await owned(id, workerId);
  if (!j) return "not-owned";
  const next = afterFailure(retryable, j.attempts, j.maxAttempts);
  const msg = error.slice(0, 500);
  await db()
    .update(s.renderJobs)
    .set({ status: next, error: msg, leaseUntil: null, updatedAt: sql`now()`, history: sql`${s.renderJobs.history} || ${entry(next, next === "queued" ? `Retrying after: ${msg}` : msg)}` })
    .where(eq(s.renderJobs.id, id));
  return "ok";
}

export async function cancelJob(id: string) {
  const rows = await db()
    .update(s.renderJobs)
    .set({ status: "cancelled", leaseUntil: null, updatedAt: sql`now()`, history: sql`${s.renderJobs.history} || ${entry("cancelled", "Cancelled by owner.")}` })
    .where(and(eq(s.renderJobs.id, id), sql`${s.renderJobs.status} not in ('succeeded','failed','cancelled')`))
    .returning({ id: s.renderJobs.id });
  return rows.length > 0;
}

export async function workerOnline() {
  const [r] = await db().select({ last: sql<string | null>`max(${s.workers.lastSeen})` }).from(s.workers);
  const last = r?.last ? new Date(r.last).getTime() : null;
  return { online: last !== null && Date.now() - last < ONLINE_SECONDS * 1000, lastSeen: last };
}

export async function getJob(id: string) {
  await reap();
  const [j] = await db().select().from(s.renderJobs).where(eq(s.renderJobs.id, id));
  return j ?? null;
}

export async function publicJob(j: typeof s.renderJobs.$inferSelect) {
  const artifacts = await db().select({ name: s.outputArtifacts.name }).from(s.outputArtifacts).where(eq(s.outputArtifacts.jobId, j.id));
  return {
    id: j.id,
    status: j.status as JobStatus,
    attempts: j.attempts,
    error: j.error,
    manifest: TERMINAL.includes(j.status as JobStatus) ? j.manifest : null,
    artifacts: j.status === "succeeded" ? artifacts.map((a) => a.name).sort() : [],
    history: j.history,
    store: "neon" as const,
  };
}

export async function artifactUrl(jobId: string, name: string) {
  const [a] = await db().select().from(s.outputArtifacts).where(and(eq(s.outputArtifacts.jobId, jobId), eq(s.outputArtifacts.name, name)));
  return a ? signedGet(a.storageKey) : null;
}

/** Constant-time bearer check for worker endpoints. */
export function workerAuth(req: Request): { workerId: string } | Response {
  const token = process.env.WORKER_TOKEN;
  if (!token) return Response.json({ error: "Worker access is disabled: WORKER_TOKEN is not set on the server." }, { status: 503 });
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(got), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Invalid worker token." }, { status: 401 });
  return { workerId: (req.headers.get("x-worker-id") ?? "worker").replace(/[^\w.-]/g, "").slice(0, 80) || "worker" };
}
