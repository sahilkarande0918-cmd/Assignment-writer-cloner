import { cancelJob } from "@/lib/server/jobs";
import { ownerRoute, uuidOk } from "@/lib/server/http";

export const POST = ownerRoute(async (_req, ctx: RouteContext<"/api/jobs/[id]/cancel">) => {
  const { id } = await ctx.params;
  return uuidOk(id) && (await cancelJob(id)) ? Response.json({ ok: true }) : Response.json({ error: "This job can no longer be cancelled." }, { status: 409 });
});
