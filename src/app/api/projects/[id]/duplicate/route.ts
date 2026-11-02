import { userRoute, uuidOk } from "@/lib/server/http";
import { duplicateProject } from "@/lib/server/projects";

export const POST = userRoute(async (_req, ctx: RouteContext<"/api/projects/[id]/duplicate">, user) => {
  const { id } = await ctx.params;
  if (!uuidOk(id)) return Response.json({ error: "Invalid project id." }, { status: 400 });
  return Response.json({ project: await duplicateProject(user, id) }, { status: 201 });
});
