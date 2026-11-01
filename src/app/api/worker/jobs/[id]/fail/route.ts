import { failJob } from "@/lib/server/jobs";
import { uuidOk, workerRoute } from "@/lib/server/http";

export const POST = workerRoute(async (req, ctx: RouteContext<"/api/worker/jobs/[id]/fail">, workerId) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { error?: string; retryable?: boolean } | null;
  if (!uuidOk(id)) return Response.json({ error: "Invalid job id." }, { status: 400 });
  const r = await failJob(id, workerId, String(body?.error ?? "Unknown worker error"), !!body?.retryable);
  return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: r }, { status: 409 });
});
