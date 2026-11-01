import { connection } from "next/server";
import { getJob, publicJob, workerOnline } from "@/lib/server/jobs";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection();
  const job = getJob((await ctx.params).id);
  if (!job) return Response.json({ error: "Job not found (jobs live in server memory until cloud storage is configured)." }, { status: 404 });
  return Response.json({ job: publicJob(job), worker: workerOnline() });
}
