import { z } from "zod";
import { authEnabled, createSession, sessionCookie } from "@/lib/server/auth";
import { guard, rateLimited } from "@/lib/server/guard";
import { verifyPassword } from "@/lib/server/password";

export async function POST(req: Request) {
  const blocked = guard(req, 2_000, { bucket: "auth", limit: 30 });
  if (blocked) return blocked;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(`login:${ip}`, 5, 60_000)) return Response.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  if (!authEnabled()) return Response.json({ error: "No owner password is configured (OWNER_PASSWORD_HASH)." }, { status: 503 });
  const body = z.object({ password: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success || !(await verifyPassword(body.data.password, process.env.OWNER_PASSWORD_HASH!)))
    return Response.json({ error: "Wrong password." }, { status: 401 });
  const secure = new URL(req.url).protocol === "https:";
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": sessionCookie(await createSession(), secure) } });
}
