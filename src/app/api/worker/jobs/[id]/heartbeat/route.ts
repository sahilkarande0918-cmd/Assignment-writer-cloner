import { heartbeat } from "@/lib/server/jobs";
import { uuidOk, workerRoute } from "@/lib/server/http";

export const POST = workerRoute(async (_req, ctx: RouteContext<"/api/worker/jobs/[id]/heartbeat">, workerId) => {
  const { id } = await ctx.params;
  const r = uuidOk(id) ? await heartbeat(id, workerId) : null;
  return r ? Response.json(r) : Response.json({ error: "Lease not held." }, { status: 409 });
});
