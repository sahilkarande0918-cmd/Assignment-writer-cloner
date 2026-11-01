import { completeJob } from "@/lib/server/jobs";
import { uuidOk, workerRoute } from "@/lib/server/http";

export const POST = workerRoute(async (req, ctx: RouteContext<"/api/worker/jobs/[id]/complete">, workerId) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { manifest?: Record<string, unknown> } | null;
  if (!uuidOk(id) || !body?.manifest || typeof body.manifest !== "object") return Response.json({ error: "manifest required" }, { status: 400 });
  if (JSON.stringify(body.manifest).length > 1_000_000) return Response.json({ error: "manifest too large" }, { status: 413 });
  const r = await completeJob(id, workerId, body.manifest);
  return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: r }, { status: 409 });
});
