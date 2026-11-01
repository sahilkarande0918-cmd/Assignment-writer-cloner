import { getJob, publicJob, workerOnline } from "@/lib/server/jobs";
import { ownerRoute, uuidOk } from "@/lib/server/http";

export const GET = ownerRoute(async (_req, ctx: RouteContext<"/api/jobs/[id]">) => {
  const { id } = await ctx.params;
  const job = uuidOk(id) ? await getJob(id) : null;
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  return Response.json({ job: await publicJob(job), worker: await workerOnline() });
});
