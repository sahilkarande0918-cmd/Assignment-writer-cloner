// Signs in once as the owner (password from the git-ignored .owner-password) and saves the session for all tests.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync("test-results", { recursive: true });
  const state = "test-results/owner-session.json";
  if (!existsSync(".owner-password")) {
    writeFileSync(state, JSON.stringify({ cookies: [], origins: [] }));
    return; // no password configured: the app serves localhost without sign-in
  }
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const r = await ctx.post("/api/auth/login", { data: { password: readFileSync(".owner-password", "utf8").trim() } });
  if (!r.ok()) throw new Error(`Owner sign-in failed: ${r.status()} ${await r.text()}`);
  await ctx.storageState({ path: state });
  await ctx.dispose();
}
