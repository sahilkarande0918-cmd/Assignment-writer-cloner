import { readInput } from "@/lib/server/jobs";
import { uuidOk, workerRoute } from "@/lib/server/http";

export const GET = workerRoute(async (_req, ctx: RouteContext<"/api/worker/jobs/[id]/inputs/[name]">, workerId) => {
  const { id, name } = await ctx.params;
  if (!uuidOk(id) || !/^[\w-]{1,32}$/.test(name)) return Response.json({ error: "Invalid input." }, { status: 400 });
  const r = await readInput(id, workerId, name);
  if (r === "not-owned") return Response.json({ error: "Lease not held." }, { status: 409 });
  if (r === "missing") return Response.json({ error: "No such input." }, { status: 404 });
  return new Response(r.data as BodyInit, { headers: { "content-type": r.type, "x-sha256": r.sha256 } });
});
