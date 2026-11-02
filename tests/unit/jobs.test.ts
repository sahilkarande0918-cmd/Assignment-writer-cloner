import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { afterFailure, afterLostLease, ephemeralToken, workerAuth } from "@/lib/server/jobs";
import { isOwnerAccount } from "@/lib/account";
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

  it("accepts short-lived cloud tokens until they expire, and nothing forged", () => {
    process.env.WORKER_TOKEN = "s3cret-token";
    const req = (t: string) => new Request("http://x/api/worker/claim", { method: "POST", headers: { authorization: `Bearer ${t}` } });
    const t = ephemeralToken(60);
    expect(workerAuth(req(t))).toEqual({ workerId: "worker" });
    expect((workerAuth(req(ephemeralToken(-1))) as Response).status).toBe(401); // expired
    expect((workerAuth(req(t.replace(/\.(\d+)\./, (_, e) => `.${+e + 3600}.`))) as Response).status).toBe(401); // extended expiry, old signature
    expect((workerAuth(req("eph.9999999999.abc")) as Response).status).toBe(401);
    delete process.env.WORKER_TOKEN;
  });
});

describe("owner account", () => {
  it("needs the owner's address and a verified email", () => {
    expect(isOwnerAccount(" SahilKarande0918@gmail.com ", true)).toBe(true);
    expect(isOwnerAccount("sahilkarande0918@gmail.com", false)).toBe(false); // anyone could sign up with it unverified
    expect(isOwnerAccount("student@college.edu", true)).toBe(false);
  });
});

describe("OCR back-check metrics", () => {
  it("computes character error rate and missed words", () => {
    expect(cer("hello world", "hello  world")).toBe(0);
    expect(cer("abcd", "abxd")).toBe(0.25);
    expect(missedWords("Aim: verify Ohm's law", "aim verify ohms law")).toEqual(["ohm's"]);
  });
});

describe("kaggle run script", () => {
  it("carries only the short-lived token, never WORKER_TOKEN", async () => {
    process.env.WORKER_TOKEN = "permanent-secret-token";
    const { kaggleScript } = await import("@/lib/server/gpu");
    const eph = ephemeralToken(60);
    const py = kaggleScript("https://site.example", eph);
    expect(py).toContain(JSON.stringify(eph));
    expect(py).not.toContain("permanent-secret-token");
    expect(py).toMatch(/worker\.py", "--drain"/);
    execFileSync("python", ["-I", "-c", "import ast, sys; ast.parse(sys.stdin.read())"], { input: py }); // valid Python
    delete process.env.WORKER_TOKEN;
  });
});
