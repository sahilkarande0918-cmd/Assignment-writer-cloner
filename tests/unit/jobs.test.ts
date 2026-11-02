import { describe, expect, it } from "vitest";
import { afterFailure, afterLostLease, workerAuth } from "@/lib/server/jobs";
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
