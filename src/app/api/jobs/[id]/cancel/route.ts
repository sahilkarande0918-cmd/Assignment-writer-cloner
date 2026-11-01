import { cancelJob } from "@/lib/server/jobs";
import { guard } from "@/lib/server/guard";

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const blocked = guard(req, 1_000);
  if (blocked) return blocked;
  return cancelJob((await ctx.params).id) ? Response.json({ ok: true }) : Response.json({ error: "This job can no longer be cancelled." }, { status: 409 });
}
