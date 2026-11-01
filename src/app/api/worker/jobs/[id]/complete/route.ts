import { completeJob, workerAuth } from "@/lib/server/jobs";

export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/complete">) {
  const auth = workerAuth(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json().catch(() => null)) as { manifest?: Record<string, unknown> } | null;
  if (!body?.manifest || typeof body.manifest !== "object") return Response.json({ error: "manifest required" }, { status: 400 });
  const r = completeJob((await ctx.params).id, auth.workerId, body.manifest);
  return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: r }, { status: 409 });
}
