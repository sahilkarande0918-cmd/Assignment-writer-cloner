import { defineConfig } from "drizzle-kit";

// Migrations run over the direct (unpooled) connection. Pick the branch with --env-file: .env.test.local (dev) or .env.local (production).
export default defineConfig({
  schema: "./src/lib/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
