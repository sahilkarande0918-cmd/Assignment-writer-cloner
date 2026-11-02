import { z } from "zod";
import { heartbeat } from "@/lib/server/jobs";
import { uuidOk, workerRoute } from "@/lib/server/http";

const Progress = z.object({
  stage: z.string().max(80),
  done: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  percent: z.number().min(0).max(100),
  eta: z.number().min(0).max(86_400).nullish(),
});

export const POST = workerRoute(async (req, ctx: RouteContext<"/api/worker/jobs/[id]/heartbeat">, workerId) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const progress = Progress.safeParse(body?.progress); // older workers send no body
  const r = uuidOk(id) ? await heartbeat(id, workerId, progress.success ? progress.data : undefined) : null;
  return r ? Response.json(r) : Response.json({ error: "Lease not held." }, { status: 409 });
});
