import { putArtifact } from "@/lib/server/jobs";
import { uuidOk, workerRoute } from "@/lib/server/http";

const MAX_ARTIFACT = 4_000_000; // stays under the serverless request body limit

export const PUT = workerRoute(async (req, ctx: RouteContext<"/api/worker/jobs/[id]/artifacts/[name]">, workerId) => {
  const { id, name } = await ctx.params;
  if (!uuidOk(id)) return Response.json({ error: "Invalid job id." }, { status: 400 });
  if (req.headers.get("content-type") !== "image/png") return Response.json({ error: "Artifacts must be PNG." }, { status: 415 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_ARTIFACT) return Response.json({ error: "Artifact too large." }, { status: 413 });
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.length > MAX_ARTIFACT) return Response.json({ error: "Artifact too large." }, { status: 413 });
  const r = await putArtifact(id, workerId, name, data, "image/png", req.headers.get("x-sha256") ?? "");
  return r === "ok" ? Response.json({ ok: true }) : Response.json({ error: r }, { status: r === "not-owned" ? 409 : 400 });
});
