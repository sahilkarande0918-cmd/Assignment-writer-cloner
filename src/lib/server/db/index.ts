// Neon Postgres via Drizzle over HTTP (one round trip per query; fits serverless).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let client: ReturnType<typeof drizzle<typeof schema>> | undefined;

export const cloudConfigured = () => !!(process.env.DATABASE_URL && process.env.AWS_ENDPOINT_URL_S3 && process.env.STORAGE_BUCKET);

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  client ??= drizzle(neon(url), { schema });
  return client;
}

export { schema };
