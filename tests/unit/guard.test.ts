import { describe, expect, it } from "vitest";
import { guard, rateLimited } from "@/lib/server/guard";

const req = (headers: Record<string, string>) => new Request("http://localhost/api/plan", { method: "POST", headers });

describe("guard", () => {
  it("blocks cross-site and missing-origin requests", () => {
    expect(guard(req({ origin: "https://evil.example", host: "localhost:3000" }), 10)?.status).toBe(403);
    expect(guard(req({ host: "localhost:3000" }), 10)?.status).toBe(403);
    expect(guard(req({ origin: "http://localhost:3000", host: "localhost:3000" }), 10)).toBeNull();
  });
  it("blocks oversized bodies", () => {
    expect(guard(req({ origin: "http://a", host: "a", "content-length": "11" }), 10)?.status).toBe(413);
  });
  it("rate limits per key within the window", () => {
    const t = 1_000;
    for (let i = 0; i < 3; i++) expect(rateLimited("k", 3, 1000, t + i)).toBe(false);
    expect(rateLimited("k", 3, 1000, t + 5)).toBe(true);
    expect(rateLimited("k", 3, 1000, t + 5000)).toBe(false);
  });
});
