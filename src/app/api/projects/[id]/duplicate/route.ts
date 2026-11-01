import { ownerRoute, uuidOk } from "@/lib/server/http";
import { duplicateProject } from "@/lib/server/projects";

export const POST = ownerRoute(async (_req, ctx: RouteContext<"/api/projects/[id]/duplicate">) => {
  const { id } = await ctx.params;
  if (!uuidOk(id)) return Response.json({ error: "Invalid project id." }, { status: 400 });
  return Response.json({ project: await duplicateProject(id) }, { status: 201 });
});
