import { connection } from "next/server";
import { getJob } from "@/lib/server/jobs";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]/artifacts/[name]">) {
  await connection();
  const { id, name } = await ctx.params;
  const a = getJob(id)?.artifacts.get(name);
  if (!a) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(a.data as BodyInit, { headers: { "content-type": a.type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
