import { userRoute, uuidOk } from "@/lib/server/http";
import { confirmUpload } from "@/lib/server/projects";

export const POST = userRoute(async (_req, ctx: RouteContext<"/api/projects/[id]/files/[fileId]/confirm">, user) => {
  const { id, fileId } = await ctx.params;
  if (!uuidOk(id) || !uuidOk(fileId)) return Response.json({ error: "Invalid id." }, { status: 400 });
  return Response.json({ file: await confirmUpload(user, id, fileId) });
});
