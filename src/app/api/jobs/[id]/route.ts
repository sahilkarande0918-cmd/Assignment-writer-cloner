import { after } from "next/server";
import { cloudGpu, nudgeGpu } from "@/lib/server/gpu";
import { getJob, ownsJob, publicJob, workerOnline } from "@/lib/server/jobs";
import { userRoute, uuidOk } from "@/lib/server/http";

export const GET = userRoute(async (_req, ctx: RouteContext<"/api/jobs/[id]">, user) => {
  const { id } = await ctx.params;
  const job = uuidOk(id) ? await getJob(id) : null;
  if (!job || !ownsJob(job, user)) return Response.json({ error: "Job not found." }, { status: 404 });
  if (job.status === "queued") after(() => nudgeGpu(id));
  return Response.json({ job: await publicJob(job), worker: { ...(await workerOnline()), cloud: cloudGpu() } });
});
