import { LEASE_SECONDS, claimJob } from "@/lib/server/jobs";
import { workerRoute } from "@/lib/server/http";

export const POST = workerRoute(async (_req, _ctx, workerId) => {
  const job = await claimJob(workerId);
  if (!job) return new Response(null, { status: 204 });
  return Response.json({ job: { id: job.id, kind: job.kind, payload: job.payload, inputs: Object.keys(job.inputs), leaseSeconds: LEASE_SECONDS } });
});
