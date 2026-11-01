import { beforeEach, describe, expect, it } from "vitest";
import { LEASE_MS, _reset, cancelJob, claimJob, completeJob, createJob, failJob, getJob, heartbeat, putArtifact, sha256, workerAuth, workerOnline } from "@/lib/server/jobs";
import { cer, missedWords } from "@/lib/hwjob";

const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const input = { reference: { data: png, type: "image/png" } };

beforeEach(_reset);

describe("job queue", () => {
  it("runs queued → running → succeeded with checksummed artifacts", () => {
    const job = createJob({ text: "x" }, input, undefined, 0);
    expect(claimJob("w1", 10)?.id).toBe(job.id);
    expect(claimJob("w2", 11)).toBeUndefined(); // nothing else queued
    expect(putArtifact(job.id, "w1", "page-01.png", png, "image/png", "bad", 12)).toBe("checksum-mismatch");
    expect(putArtifact(job.id, "w1", "../x", png, "image/png", sha256(png), 12)).toBe("bad-name");
    expect(putArtifact(job.id, "w1", "page-01.png", png, "image/png", sha256(png), 12)).toBe("ok");
    expect(completeJob(job.id, "w1", { artifacts: [{ name: "page-01.png", sha256: "nope" }] }, 13)).toBe("artifacts-mismatch");
    expect(completeJob(job.id, "w1", { artifacts: [{ name: "page-01.png", sha256: sha256(png) }] }, 13)).toBe("ok");
    expect(getJob(job.id)!.history.map((h) => h.status)).toEqual(["queued", "running", "succeeded"]);
  });

  it("only the lease holder may act on a job", () => {
    const job = createJob({}, input, undefined, 0);
    claimJob("w1", 1);
    expect(heartbeat(job.id, "intruder", 2)).toBeNull();
    expect(failJob(job.id, "intruder", "x", false, 2)).toBe("not-owned");
    expect(putArtifact(job.id, "intruder", "a.png", png, "image/png", sha256(png), 2)).toBe("not-owned");
  });

  it("re-queues expired leases until the retry budget is spent, then fails", () => {
    const job = createJob({}, input, undefined, 0);
    let t = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(claimJob("w", t)?.attempts).toBe(attempt);
      t += LEASE_MS + 1; // worker vanished (power cut, sleep, crash)
    }
    expect(claimJob("w", t)).toBeUndefined();
    expect(getJob(job.id)).toMatchObject({ status: "failed" });
  });

  it("heartbeats extend the lease; retryable failures re-queue, input errors fail at once", () => {
    const a = createJob({}, input, undefined, 0);
    claimJob("w", 0);
    heartbeat(a.id, "w", LEASE_MS - 10);
    expect(claimJob("w", LEASE_MS + 5)).toBeUndefined(); // lease still valid, not re-queued
    expect(failJob(a.id, "w", "GPU ran out of memory.", true, LEASE_MS + 6)).toBe("ok");
    expect(getJob(a.id)!.status).toBe("queued");
    claimJob("w", LEASE_MS + 7);
    failJob(a.id, "w", "Unsupported characters", false, LEASE_MS + 8);
    expect(getJob(a.id)).toMatchObject({ status: "failed", error: "Unsupported characters" });
  });

  it("idempotency keys dedupe, cancel is reported to the worker, and worker presence expires", () => {
    const a = createJob({}, input, "key-1", 0);
    expect(createJob({}, input, "key-1", 1).id).toBe(a.id);
    claimJob("w", 2);
    expect(cancelJob(a.id, 3)).toBe(true);
    expect(heartbeat(a.id, "w", 4)).toEqual({ cancelled: true });
    expect(workerOnline(5).online).toBe(true);
    expect(workerOnline(60_000).online).toBe(false);
  });

  it("rejects missing or wrong worker tokens in constant time", () => {
    process.env.WORKER_TOKEN = "s3cret-token";
    const req = (auth?: string) => new Request("http://x/api/worker/claim", { method: "POST", headers: auth ? { authorization: auth } : {} });
    expect((workerAuth(req()) as Response).status).toBe(401);
    expect((workerAuth(req("Bearer nope")) as Response).status).toBe(401);
    expect(workerAuth(req("Bearer s3cret-token"))).toEqual({ workerId: "worker" });
    delete process.env.WORKER_TOKEN;
    expect((workerAuth(req("Bearer s3cret-token")) as Response).status).toBe(503);
  });
});

describe("OCR back-check metrics", () => {
  it("computes character error rate and missed words", () => {
    expect(cer("hello world", "hello  world")).toBe(0);
    expect(cer("abcd", "abxd")).toBe(0.25);
    expect(missedWords("Aim: verify Ohm's law", "aim verify ohms law")).toEqual(["ohm's"]);
  });
});
