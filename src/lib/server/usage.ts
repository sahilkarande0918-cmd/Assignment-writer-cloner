// Free tier: every account except the owner gets FREE_GENERATIONS "generations" in total — a handwriting job
// (queued, running or succeeded; failed and cancelled ones are not charged) or an AI edit plan.
import { and, eq, notInArray, sql } from "drizzle-orm";
import { FREE_GENERATIONS, type User } from "../account";
import { db, schema as s } from "./db";

export type Quota = { used: number; limit: number | null; left: number | null };

export async function quota(user: User): Promise<Quota> {
  if (user.owner) return { used: 0, limit: null, left: null };
  const count = sql<number>`count(*)::int`.mapWith(Number);
  const [[jobs], [plans]] = await Promise.all([
    db().select({ n: count }).from(s.renderJobs).where(and(eq(s.renderJobs.userId, user.id), notInArray(s.renderJobs.status, ["failed", "cancelled"]))),
    db().select({ n: count }).from(s.usageEvents).where(eq(s.usageEvents.userId, user.id)),
  ]);
  const used = jobs.n + plans.n;
  return { used, limit: FREE_GENERATIONS, left: Math.max(0, FREE_GENERATIONS - used) };
}

/** null when the user may start another generation, otherwise a 402 response explaining the pause.
 * ponytail: check-then-insert, so two simultaneous requests can both pass on the last free slot; a row lock if it matters. */
export async function quotaBlock(user: User): Promise<Response | null> {
  const q = await quota(user);
  if (q.left === null || q.left > 0) return null;
  return Response.json({ error: `You have used your ${q.limit} free generations. Generation is paused for this account.`, quota: q }, { status: 402 });
}

export async function recordPlan(user: User) {
  if (!user.owner) await db().insert(s.usageEvents).values({ userId: user.id, kind: "plan" });
}
