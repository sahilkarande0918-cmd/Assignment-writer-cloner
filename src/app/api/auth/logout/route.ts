import { clearCookie } from "@/lib/server/auth";
import { guard } from "@/lib/server/guard";

export async function POST(req: Request) {
  const blocked = guard(req, 1_000, { bucket: "auth", limit: 30 });
  if (blocked) return blocked;
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": clearCookie(new URL(req.url).protocol === "https:") } });
}
