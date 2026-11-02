import { z } from "zod";
import { userRoute } from "@/lib/server/http";
import { MODES, createProject, listProjects } from "@/lib/server/projects";

export const GET = userRoute(async (req, _ctx, user) => {
  const u = new URL(req.url);
  return Response.json(await listProjects(user, u.searchParams.get("q")?.slice(0, 100) || undefined, u.searchParams.get("mode") ?? undefined));
});

const Body = z.object({ name: z.string().trim().min(1).max(120), mode: z.enum(MODES) });

export const POST = userRoute(async (req, _ctx, user) => {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Give the project a name and mode." }, { status: 400 });
  return Response.json({ project: await createProject(user, body.data.name, body.data.mode) }, { status: 201 });
});
