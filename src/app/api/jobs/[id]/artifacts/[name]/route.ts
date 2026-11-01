import { artifactUrl } from "@/lib/server/jobs";
import { ownerRoute, uuidOk } from "@/lib/server/http";

// Owner-only; redirects to a short-lived signed URL on the private bucket.
export const GET = ownerRoute(async (_req, ctx: RouteContext<"/api/jobs/[id]/artifacts/[name]">) => {
  const { id, name } = await ctx.params;
  const url = uuidOk(id) && /^[\w.-]{1,64}$/.test(name) ? await artifactUrl(id, name) : null;
  return url ? Response.redirect(url, 302) : Response.json({ error: "Not found." }, { status: 404 });
});
