import { describe, expect, it } from "vitest";
import { afterFailure, afterLostLease, workerAuth } from "@/lib/server/jobs";
import { createSession, localOnly, validSession } from "@/lib/server/auth";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { cer, missedWords } from "@/lib/hwjob";

describe("job state decisions", () => {
  it("re-queues lost leases and retryable failures until the budget is spent", () => {
    expect(afterLostLease(1, 3)).toBe("queued");
    expect(afterLostLease(3, 3)).toBe("failed");
    expect(afterFailure(true, 2, 3)).toBe("queued");
    expect(afterFailure(true, 3, 3)).toBe("failed");
    expect(afterFailure(false, 1, 3)).toBe("failed"); // input errors are not retried
  });

  it("rejects missing or wrong worker tokens and sanitises worker ids", () => {
    process.env.WORKER_TOKEN = "s3cret-token";
    const req = (auth?: string, id?: string) => new Request("http://x/api/worker/claim", { method: "POST", headers: { ...(auth ? { authorization: auth } : {}), ...(id ? { "x-worker-id": id } : {}) } });
    expect((workerAuth(req()) as Response).status).toBe(401);
    expect((workerAuth(req("Bearer nope")) as Response).status).toBe(401);
    expect(workerAuth(req("Bearer s3cret-token", "pc-1;drop table"))).toEqual({ workerId: "pc-1droptable" });
    delete process.env.WORKER_TOKEN;
    expect((workerAuth(req("Bearer s3cret-token")) as Response).status).toBe(503);
  });
});

describe("owner auth", () => {
  it("signs sessions, rejects tampering and expiry", async () => {
    process.env.SESSION_SECRET = "x".repeat(40);
    const s = await createSession(0);
    expect(await validSession(s, 1000)).toBe(true);
    expect(await validSession(s.replace(/.$/, (c) => (c === "A" ? "B" : "A")), 1000)).toBe(false);
    expect(await validSession(`9999999999.${s.split(".")[1]}`, 1000)).toBe(false); // expiry is signed
    expect(await validSession(s, 31 * 86400 * 1000)).toBe(false); // expired
    expect(await validSession(undefined)).toBe(false);
  });

  it("hashes passwords with scrypt and verifies in constant time", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt:\d+:8:1:/);
    expect(h).not.toContain("$"); // safe in .env files
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("without a password only localhost is served", () => {
    expect(localOnly(new Request("http://localhost:3000/"))).toBe(true);
    expect(localOnly(new Request("https://app.vercel.app/", { headers: { host: "app.vercel.app" } }))).toBe(false);
  });
});

describe("OCR back-check metrics", () => {
  it("computes character error rate and missed words", () => {
    expect(cer("hello world", "hello  world")).toBe(0);
    expect(cer("abcd", "abxd")).toBe(0.25);
    expect(missedWords("Aim: verify Ohm's law", "aim verify ohms law")).toEqual(["ohm's"]);
  });
});
