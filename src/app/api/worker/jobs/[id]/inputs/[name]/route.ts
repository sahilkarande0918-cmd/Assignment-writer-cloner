import { getJob, workerAuth } from "@/lib/server/jobs";

export async function GET(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/inputs/[name]">) {
  const auth = workerAuth(req);
  if (auth instanceof Response) return auth;
  const { id, name } = await ctx.params;
  const job = getJob(id);
  if (!job || job.workerId !== auth.workerId || job.status !== "running") return Response.json({ error: "Lease not held." }, { status: 409 });
  const input = job.inputs.get(name);
  if (!input) return Response.json({ error: "No such input." }, { status: 404 });
  return new Response(input.data as BodyInit, { headers: { "content-type": input.type, "x-sha256": input.sha256 } });
}
