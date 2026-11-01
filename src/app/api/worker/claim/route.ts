import { LEASE_MS, claimJob, workerAuth } from "@/lib/server/jobs";

export async function POST(req: Request) {
  const auth = workerAuth(req);
  if (auth instanceof Response) return auth;
  const job = claimJob(auth.workerId);
  if (!job) return new Response(null, { status: 204 });
  return Response.json({ job: { id: job.id, kind: job.kind, payload: job.payload, inputs: [...job.inputs.keys()], leaseSeconds: LEASE_MS / 1000 } });
}
