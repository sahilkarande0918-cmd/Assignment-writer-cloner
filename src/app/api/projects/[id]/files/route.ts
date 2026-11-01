import { z } from "zod";
import { ownerRoute, uuidOk } from "@/lib/server/http";
import { SLOTS, createUpload } from "@/lib/server/projects";

const Body = z.object({ slot: z.enum(SLOTS), name: z.string().min(1).max(255), size: z.number().int().positive(), mime: z.string().max(120) });

/** Returns a short-lived signed URL; the browser PUTs the bytes straight to private storage, then confirms. */
export const POST = ownerRoute(async (req, ctx: RouteContext<"/api/projects/[id]/files">) => {
  const { id } = await ctx.params;
  if (!uuidOk(id)) return Response.json({ error: "Invalid project id." }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid upload request." }, { status: 400 });
  return Response.json(await createUpload(id, body.data.slot, body.data.name, body.data.size, body.data.mime || "application/octet-stream"), { status: 201 });
});
