import { heartbeat, workerAuth } from "@/lib/server/jobs";

export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/heartbeat">) {
  const auth = workerAuth(req);
  if (auth instanceof Response) return auth;
  const r = heartbeat((await ctx.params).id, auth.workerId);
  return r ? Response.json(r) : Response.json({ error: "Lease not held." }, { status: 409 });
}
