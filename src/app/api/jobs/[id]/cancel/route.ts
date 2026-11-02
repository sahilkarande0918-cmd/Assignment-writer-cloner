import { cancelJob, getJob, ownsJob } from "@/lib/server/jobs";
import { userRoute, uuidOk } from "@/lib/server/http";

export const POST = userRoute(async (_req, ctx: RouteContext<"/api/jobs/[id]/cancel">, user) => {
  const { id } = await ctx.params;
  const job = uuidOk(id) ? await getJob(id) : null;
  if (!job || !ownsJob(job, user)) return Response.json({ error: "Job not found." }, { status: 404 });
  return (await cancelJob(id)) ? Response.json({ ok: true }) : Response.json({ error: "This job can no longer be cancelled." }, { status: 409 });
});
