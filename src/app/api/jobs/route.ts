import { after } from "next/server";
import { HwPayloadSchema, MAX_JOB_INPUT_BYTES } from "@/lib/hwjob";
import { cloudGpu, startGpu } from "@/lib/server/gpu";
import { createJob, publicJob, workerOnline } from "@/lib/server/jobs";
import { userRoute, uuidOk } from "@/lib/server/http";
import { ownProject } from "@/lib/server/projects";
import { quota, quotaBlock } from "@/lib/server/usage";
import { readHead, sniffKind } from "@/lib/formats";

// Queue a handwriting job and wake the cloud GPU. Body: multipart form with `payload` (JSON), `reference` (PNG/JPEG),
// optional `paper`, optional `projectId`.
export const POST = userRoute(async (req, _ctx, user) => {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Send a multipart form." }, { status: 400 });
  const payload = HwPayloadSchema.safeParse(JSON.parse(String(form.get("payload") ?? "null")));
  if (!payload.success) return Response.json({ error: "Invalid job settings." }, { status: 400 });
  const projectId = String(form.get("projectId") ?? "");
  if (uuidOk(projectId)) await ownProject(projectId, user);

  const inputs: Record<string, { data: Uint8Array; type: string }> = {};
  for (const name of ["reference", "paper"] as const) {
    const f = form.get(name);
    if (!(f instanceof File)) continue;
    const kind = sniffKind(await readHead(f), f.name);
    if (kind !== "png" && kind !== "jpeg") return Response.json({ error: `${name} must be a PNG or JPEG page image.` }, { status: 400 });
    inputs[name] = { data: new Uint8Array(await f.arrayBuffer()), type: kind === "png" ? "image/png" : "image/jpeg" };
  }
  if (!inputs.reference) return Response.json({ error: "A handwriting reference page is required." }, { status: 400 });

  const key = req.headers.get("idempotency-key")?.slice(0, 100);
  const blocked = await quotaBlock(user);
  if (blocked) return blocked;
  const job = await createJob(payload.data, inputs, key ? `${user.id}:${key}` : undefined, uuidOk(projectId) ? projectId : undefined, user.id);
  if (job.status === "queued") after(startGpu);
  return Response.json({ job: await publicJob(job), worker: { ...(await workerOnline()), cloud: cloudGpu() }, quota: await quota(user) }, { status: 202 });
}, MAX_JOB_INPUT_BYTES + 100_000);
