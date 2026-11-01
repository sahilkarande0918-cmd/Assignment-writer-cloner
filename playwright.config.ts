import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// E2E runs against the Neon *dev* branch: its credentials override .env.local (real env beats .env files in Next.js).
const testEnv = existsSync(".env.test.local")
  ? Object.fromEntries(
      readFileSync(".env.test.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
    )
  : {};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", storageState: "test-results/owner-session.json" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000, env: testEnv },
});
