import { artifactUrl, getJob, ownsJob } from "@/lib/server/jobs";
import { userRoute, uuidOk } from "@/lib/server/http";

// The job's own user only; redirects to a short-lived signed URL on the private bucket.
export const GET = userRoute(async (_req, ctx: RouteContext<"/api/jobs/[id]/artifacts/[name]">, user) => {
  const { id, name } = await ctx.params;
  const job = uuidOk(id) ? await getJob(id) : null;
  const url = job && ownsJob(job, user) && /^[\w.-]{1,64}$/.test(name) ? await artifactUrl(id, name) : null;
  return url ? Response.redirect(url, 302) : Response.json({ error: "Not found." }, { status: 404 });
});
