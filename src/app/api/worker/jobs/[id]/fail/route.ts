import { failJob, workerAuth } from "@/lib/server/jobs";

export async function POST(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/fail">) {
  const auth = workerAuth(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json().catch(() => null)) as { error?: string; retryable?: boolean } | null;
  const r = failJob((await ctx.params).id, auth.workerId, String(body?.error ?? "Unknown worker error"), !!body?.retryable);
  return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: r }, { status: 409 });
}
