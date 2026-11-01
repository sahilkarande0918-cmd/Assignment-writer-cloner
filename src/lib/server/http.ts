// Shared route wrapper: owner check, same-origin/size/rate guard on mutations, cloud-config check, safe errors.
import { connection } from "next/server";
import { requireOwner } from "./auth";
import { cloudConfigured } from "./db";
import { guard } from "./guard";
import { Conflict, Invalid, NotFound } from "./projects";

export function ownerRoute<C>(fn: (req: Request, ctx: C) => Promise<Response>, maxBytes = 200_000) {
  return async (req: Request, ctx: C) => {
    await connection();
    const denied = await requireOwner(req);
    if (denied) return denied;
    if (req.method !== "GET") {
      const blocked = guard(req, maxBytes);
      if (blocked) return blocked;
    }
    if (!cloudConfigured()) return Response.json({ error: "Cloud storage is not configured (DATABASE_URL, AWS_* and STORAGE_BUCKET).", cloud: false }, { status: 503 });
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof NotFound) return Response.json({ error: e.message }, { status: 404 });
      if (e instanceof Conflict) return Response.json({ error: e.message }, { status: 409 });
      if (e instanceof Invalid) return Response.json({ error: e.message }, { status: 400 });
      console.error("[api]", e);
      return Response.json({ error: "The server could not complete this request. Nothing was changed." }, { status: 500 });
    }
  };
}

export const uuidOk = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Worker routes: bearer token instead of the owner session; same safe error handling. */
export function workerRoute<C>(fn: (req: Request, ctx: C, workerId: string) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    await connection();
    const { workerAuth } = await import("./jobs");
    const auth = workerAuth(req);
    if (auth instanceof Response) return auth;
    if (!cloudConfigured()) return Response.json({ error: "Cloud storage is not configured on the server." }, { status: 503 });
    try {
      return await fn(req, ctx, auth.workerId);
    } catch (e) {
      console.error("[worker-api]", e);
      return Response.json({ error: "Server error." }, { status: 500 });
    }
  };
}
