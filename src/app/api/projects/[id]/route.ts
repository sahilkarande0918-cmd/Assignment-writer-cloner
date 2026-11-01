import { z } from "zod";
import { ownerRoute, uuidOk } from "@/lib/server/http";
import { MODES, deleteProject, getProject, updateProject } from "@/lib/server/projects";

type Ctx = RouteContext<"/api/projects/[id]">;
const bad = () => Response.json({ error: "Invalid project id." }, { status: 400 });

export const GET = ownerRoute(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  return uuidOk(id) ? Response.json(await getProject(id)) : bad();
});

const Patch = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(MODES).optional(),
  status: z.enum(["draft", "edited", "generated"]).optional(),
  cursor: z.number().int().min(0).max(10_000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = ownerRoute(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!uuidOk(id)) return bad();
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid update." }, { status: 400 });
  const { expectedUpdatedAt, ...patch } = body.data;
  if (patch.settings && JSON.stringify(patch.settings).length > 150_000) return Response.json({ error: "Project text is too large to save." }, { status: 413 });
  return Response.json({ project: await updateProject(id, expectedUpdatedAt, patch) });
});

export const DELETE = ownerRoute(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!uuidOk(id)) return bad();
  await deleteProject(id);
  return Response.json({ ok: true });
});
