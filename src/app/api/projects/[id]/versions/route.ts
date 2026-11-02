import { z } from "zod";
import { userRoute, uuidOk } from "@/lib/server/http";
import { addVersion } from "@/lib/server/projects";

const Body = z.object({
  fileId: z.string().uuid(),
  index: z.number().int().min(1).max(10_000),
  label: z.string().min(1).max(300),
  method: z.enum(["native", "reconstruction", "text"]),
  operations: z.array(z.object({ op: z.unknown(), report: z.unknown() })).max(100),
});

export const POST = userRoute(async (req, ctx: RouteContext<"/api/projects/[id]/versions">, user) => {
  const { id } = await ctx.params;
  if (!uuidOk(id)) return Response.json({ error: "Invalid project id." }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid version." }, { status: 400 });
  const b = body.data;
  return Response.json({ version: await addVersion(user, id, b.fileId, b.index, b.label, b.method, b.operations) }, { status: 201 });
}, 400_000);
