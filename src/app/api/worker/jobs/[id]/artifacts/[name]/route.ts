import { putArtifact, workerAuth } from "@/lib/server/jobs";

const MAX_ARTIFACT = 4_000_000;

export async function PUT(req: Request, ctx: RouteContext<"/api/worker/jobs/[id]/artifacts/[name]">) {
  const auth = workerAuth(req);
  if (auth instanceof Response) return auth;
  const { id, name } = await ctx.params;
  const type = req.headers.get("content-type") ?? "";
  if (type !== "image/png") return Response.json({ error: "Artifacts must be PNG." }, { status: 415 });
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.length > MAX_ARTIFACT) return Response.json({ error: "Artifact too large." }, { status: 413 });
  const r = putArtifact(id, auth.workerId, name, data, type, req.headers.get("x-sha256") ?? "");
  return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: r }, { status: r === "not-owned" ? 409 : 400 });
}
