// Signs up a fresh test account on the Neon *dev* branch (email verification is off there) and saves its session
// for all tests. Each run gets its own user, so the 3-generation free tier starts at zero.
import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync("test-results", { recursive: true });
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const email = `e2e-${Date.now()}@example.test`;
  const r = await ctx.post("/api/auth/sign-up/email", { data: { email, password: "e2e-password-123", name: "E2E" } });
  if (!r.ok()) throw new Error(`Test sign-up failed: ${r.status()} ${await r.text()}`);
  await ctx.storageState({ path: "test-results/owner-session.json" });
  await ctx.dispose();
}
