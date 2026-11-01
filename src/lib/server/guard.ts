// Request guards shared by API routes: same-origin (CSRF), body size, and a simple rate limit.

// ponytail: per-instance memory window; serverless instances don't share it. Move to Neon/KV if abuse matters.
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit = 20, windowMs = 60_000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit;
}

export function guard(req: Request, maxBytes: number): Response | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > maxBytes) return Response.json({ error: "Request is too large." }, { status: 413 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  return null;
}
