// Accounts: Neon Auth (managed Better Auth) — email + password, sign-up confirmed with an emailed code.
// The owner is the verified account with OWNER_EMAIL: unlimited generations and the projects saved before accounts.
import { createNeonAuth } from "@neon/auth/next/server";
import { isOwnerAccount, type User } from "../account";

export type { User };

let instance: ReturnType<typeof createNeonAuth> | undefined;

/** Lazy: the SDK validates its config on creation, which must not run at build time. */
export function auth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL, secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) throw new Error("Accounts are not configured (NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET).");
  instance ??= createNeonAuth({ baseUrl, cookies: { secret } });
  return instance;
}

export const authConfigured = () => !!(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);

export async function currentUser(): Promise<User | null> {
  if (!authConfigured()) return null;
  const { data } = await auth().getSession();
  const u = data?.user;
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name ?? "", owner: isOwnerAccount(u.email, !!u.emailVerified) };
}

/** Route-handler guard: the signed-in user, or an error response. */
export async function requireUser(): Promise<User | Response> {
  if (!authConfigured()) return Response.json({ error: "Accounts are not configured on the server." }, { status: 503 });
  return (await currentUser()) ?? Response.json({ error: "Sign in required." }, { status: 401 });
}
