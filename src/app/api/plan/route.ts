import { PlanRequestSchema, resolvePlan } from "@/lib/plan";
import { requestPlan, safeError } from "@/lib/server/groq";
import { guard } from "@/lib/server/guard";
import { requireUser } from "@/lib/server/auth";
import { quota, quotaBlock, recordPlan } from "@/lib/server/usage";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const blocked = guard(req, 1_000_000) ?? (await quotaBlock(user));
  if (blocked) return blocked;
  const body = PlanRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid plan request." }, { status: 400 });
  try {
    const { plan, truncated, model } = await requestPlan(body.data);
    await recordPlan(user); // charged only when a plan came back
    return Response.json({ plan: resolvePlan(plan, body.data.spans, body.data.mode, body.data.versionId, truncated), model, quota: await quota(user) });
  } catch (e) {
    const { status, message } = safeError(e);
    return Response.json({ error: message }, { status });
  }
}
