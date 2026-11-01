import { PlanRequestSchema, resolvePlan } from "@/lib/plan";
import { requestPlan, safeError } from "@/lib/server/groq";
import { guard } from "@/lib/server/guard";

export async function POST(req: Request) {
  const blocked = guard(req, 1_000_000);
  if (blocked) return blocked;
  const body = PlanRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid plan request." }, { status: 400 });
  try {
    const { plan, truncated, model } = await requestPlan(body.data);
    return Response.json({ plan: resolvePlan(plan, body.data.spans, body.data.mode, body.data.versionId, truncated), model });
  } catch (e) {
    const { status, message } = safeError(e);
    return Response.json({ error: message }, { status });
  }
}
