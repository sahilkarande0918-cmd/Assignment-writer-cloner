// Cloud GPU start-up. The trigger only starts a GPU run; the run then claims work through the normal worker API and
// exits once the queue has stayed empty, so a duplicate or missed trigger is harmless.
// Providers: Kaggle (free, no card: a private script run on a T4) or Modal (GPU_TRIGGER_URL, needs billing).
// A worker already polling (e.g. the owner's PC) takes the job first, so no cloud run is started then.
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "./db";
import { ephemeralToken, workerOnline } from "./jobs";

const KAGGLE_API = "https://api.kaggle.com/v1/kernels.KernelsApiService";
const KERNEL = "assignment-studio-gpu";
const REPO = "https://github.com/sahilkarande0918-cmd/Assignment-writer-cloner.git";
const TOKEN_TTL = 10 * 3600; // longer than a Kaggle session (12 h max) is unnecessary; a run drains in minutes to hours

function kaggleAuth() {
  const user = process.env.KAGGLE_USERNAME, token = process.env.KAGGLE_API_TOKEN, key = process.env.KAGGLE_KEY;
  if (!user) return null;
  if (token) return `Bearer ${token}`;
  return key ? `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}` : null;
}

export const cloudGpu = () => !!process.env.WORKER_TOKEN && !!(process.env.GPU_TRIGGER_URL || kaggleAuth());

/** The Python script Kaggle runs. Holds only a short-lived worker token (Kaggle stores script sources). */
export function kaggleScript(api: string, token: string) {
  return `# Assignment Studio: cloud GPU run started by the website. Handles queued handwriting jobs, then stops.
# The worker token below is short-lived and only lets this run claim jobs and upload their pages.
import os, subprocess, sys
API, TOKEN, REPO = ${JSON.stringify(api)}, ${JSON.stringify(token)}, ${JSON.stringify(REPO)}
APP = "/tmp/app"  # not /kaggle/working, so model files are not saved as notebook output
W = APP + "/workers/handwriting"
def sh(*cmd, **kw):
    subprocess.run(cmd, check=True, **kw)
sh("git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO, APP)
sh("git", "-C", APP, "sparse-checkout", "set", "workers/handwriting")
sh(sys.executable, "-m", "pip", "install", "-q", "diffusers>=0.30", "einops", "omegaconf")
sh(sys.executable, "download_models.py", cwd=W, stdout=subprocess.DEVNULL)
env = {**os.environ, "HW_API_URL": API, "HW_WORKER_TOKEN": TOKEN, "HW_BATCH": "32"}
sh(sys.executable, "-u", "worker.py", "--drain", "--idle", "300", cwd=W, env=env)
`;
}

async function kaggle(method: string, body: object) {
  const r = await fetch(`${KAGGLE_API}/${method}`, {
    method: "POST",
    headers: { authorization: kaggleAuth()!, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Kaggle ${method} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j as Record<string, unknown>;
}

async function startKaggle() {
  const user = process.env.KAGGLE_USERNAME!;
  // A run that is queued or running will pick the job up; before the first run the status call fails (no kernel).
  const status = await kaggle("GetKernelSessionStatus", { userName: user, kernelSlug: KERNEL }).catch(() => null);
  if (status && /QUEUED|RUNNING|NEW_SCRIPT/.test(String(status.status))) return true;
  const api = process.env.PUBLIC_URL || "https://assignment-writer-cloner.vercel.app";
  await kaggle("SaveKernel", {
    slug: `${user}/${KERNEL}`,
    newTitle: KERNEL,
    text: kaggleScript(api, ephemeralToken(TOKEN_TTL)),
    language: "python",
    kernelType: "script",
    isPrivate: true,
    enableGpu: true,
    enableInternet: true,
    datasetDataSources: [],
    competitionDataSources: [],
    kernelDataSources: [],
    modelDataSources: [],
    categoryIds: [],
  });
  return true;
}

async function startModal() {
  const r = await fetch(process.env.GPU_TRIGGER_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  });
  return r.ok;
}

export async function startGpu() {
  if (!cloudGpu()) return false;
  if ((await workerOnline()).online) return true; // a worker is already polling
  try {
    return process.env.GPU_TRIGGER_URL ? await startModal() : await startKaggle();
  } catch (e) {
    console.error("[gpu] start failed", e);
    return false;
  }
}

/** Re-wake the GPU for a job still queued after `seconds` (a retry, or a run that ended just before the job came).
 * updated_at doubles as the last-trigger time, so polling clients cause at most one start per job per interval. */
export async function nudgeGpu(jobId: string, seconds = 120) {
  if (!cloudGpu()) return;
  // Honest failure instead of an endless wait (quota used up, provider outage): nothing claimed it within an hour.
  const gaveUp = await db().execute(sql`
    update render_jobs set status = 'failed', updated_at = now(),
      error = 'No GPU picked this job up within an hour (the free GPU quota may be used up). Try again later.',
      history = history || jsonb_build_array(jsonb_build_object('at', (extract(epoch from now()) * 1000)::bigint, 'status', 'failed', 'note', 'No GPU within 60 minutes.'))
    where id = ${jobId}::uuid and status = 'queued' and created_at < now() - interval '60 minutes'`);
  if (gaveUp.rowCount) return;
  const rows = await db()
    .update(s.renderJobs)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(s.renderJobs.id, jobId), eq(s.renderJobs.status, "queued"), sql`${s.renderJobs.updatedAt} < now() - make_interval(secs => ${seconds})`))
    .returning({ id: s.renderJobs.id });
  if (rows.length) await startGpu();
}
