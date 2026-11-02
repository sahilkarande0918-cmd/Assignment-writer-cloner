// Single-owner authentication: scrypt password hash in OWNER_PASSWORD_HASH, HMAC-signed HttpOnly session cookie.
// Uses only Web Crypto + node:crypto scrypt (no extra auth package). Neon Auth is the upgrade path for multiple users.

export const SESSION_COOKIE = "as_session";
export const SESSION_DAYS = 30;
const enc = new TextEncoder();

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(data: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters).");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  return `${exp}.${await hmac(`owner:${exp}`)}`;
}

export async function validSession(value: string | undefined, now = Date.now()) {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  return same(sig, await hmac(`owner:${exp}`));
}

export const authEnabled = () => !!process.env.OWNER_PASSWORD_HASH;

/** Without a configured password the app only serves localhost, never a public host. */
export function localOnly(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host).replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function cookieValue(req: Request, name: string) {
  return req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function isOwner(req: Request) {
  if (!authEnabled()) return localOnly(req);
  return validSession(cookieValue(req, SESSION_COOKIE));
}

/** Route-handler guard: null when the owner is signed in, otherwise an error response. */
export async function requireOwner(req: Request): Promise<Response | null> {
  if (await isOwner(req)) return null;
  if (!authEnabled()) return Response.json({ error: "Set OWNER_PASSWORD_HASH to use this app outside localhost." }, { status: 503 });
  return Response.json({ error: "Sign in required." }, { status: 401 });
}

export function sessionCookie(value: string, secure: boolean) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}
export const clearCookie = (secure: boolean) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
