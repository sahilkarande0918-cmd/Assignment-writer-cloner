// Cloud GPU start-up (Modal, workers/handwriting/modal_app.py). The trigger only wakes a GPU container; the
// container then claims work through the normal worker API and exits when the queue is empty, so a duplicate or
// missed trigger is harmless.
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "./db";

export const cloudGpu = () => !!(process.env.GPU_TRIGGER_URL && process.env.WORKER_TOKEN);

export async function startGpu() {
  if (!cloudGpu()) return false;
  const r = await fetch(process.env.GPU_TRIGGER_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => (console.error("[gpu] trigger failed", e), null));
  return !!r?.ok;
}

/** Re-wake the GPU for a job still queued after `seconds` (a retry, or a container that died). updated_at doubles
 * as the last-trigger time, so polling clients cause at most one trigger per job per interval. */
export async function nudgeGpu(jobId: string, seconds = 120) {
  if (!cloudGpu()) return;
  const rows = await db()
    .update(s.renderJobs)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(s.renderJobs.id, jobId), eq(s.renderJobs.status, "queued"), sql`${s.renderJobs.updatedAt} < now() - make_interval(secs => ${seconds})`))
    .returning({ id: s.renderJobs.id });
  if (rows.length) await startGpu();
}
