// Integration tests against the real Neon **dev** branch (Postgres + its branch-scoped bucket).
// Run: npm run test:int   (loads .env.test.local; never touches production)
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema as s } from "@/lib/server/db";
import { objectSize } from "@/lib/server/storage";
import * as jobs from "@/lib/server/jobs";
import * as projects from "@/lib/server/projects";
import type { User } from "@/lib/account";
import { quota, quotaBlock, recordPlan } from "@/lib/server/usage";

const branch = process.env.NEON_BRANCH ?? "";
const enabled = !!process.env.DATABASE_URL && !!process.env.AWS_ENDPOINT_URL_S3 && branch !== "" && !/production|main/.test(branch);
const stamp = Date.now();
const alice: User = { id: `int-alice-${stamp}`, email: "alice@example.test", name: "Alice", owner: false };
const bob: User = { id: `int-bob-${stamp}`, email: "bob@example.test", name: "Bob", owner: false };
const created: string[] = [];
const createdJobs: string[] = [];
const png = new Uint8Array(readFileSync("tests/fixtures/ruled-page.png"));
const pdf = new Uint8Array(readFileSync("tests/fixtures/digital-2page.pdf"));

async function upload(projectId: string, slot: projects.Slot, name: string, bytes: Uint8Array, mime: string) {
  const { fileId, uploadUrl } = await projects.createUpload(alice, projectId, slot, name, bytes.length, mime);
  const r = await fetch(uploadUrl, { method: "PUT", body: bytes as BodyInit, headers: { "content-type": mime } });
  expect(r.ok).toBe(true);
  return fileId;
}

afterAll(async () => {
  for (const id of created) await projects.deleteProject(alice, id).catch(() => {});
  await db().execute(sql`delete from usage_events where user_id in (${alice.id}, ${bob.id})`);
  if (createdJobs.length) await db().execute(sql`delete from render_jobs where id in (${sql.join(createdJobs.map((j) => sql`${j}::uuid`), sql`, `)})`);
}, 180_000);

describe.skipIf(!enabled)(`cloud persistence on Neon branch "${branch}"`, () => {
  it("keeps at least 10 complete projects with files and versions, and lists/searches them", { timeout: 180_000 }, async () => {
    for (let i = 0; i < 10; i++) {
      const p = await projects.createProject(alice, `Integration project ${i} ${Date.now()}`, i % 2 ? "edit" : "digital");
      created.push(p.id);
      const f = await upload(p.id, "source", "lab.pdf", pdf, "application/pdf");
      await projects.confirmUpload(alice, p.id, f);
    }
    const all = await projects.listProjects(alice, "Integration project");
    expect(all.projects.filter((p) => created.includes(p.id))).toHaveLength(10);
    expect(all.projects.find((p) => p.id === created[0])!.bytes).toBe(pdf.length);
    expect((await projects.listProjects(alice, "Integration project 3")).projects.length).toBeGreaterThanOrEqual(1);
    expect((await projects.listProjects(alice, "Integration", "digital")).projects.every((p) => p.mode === "digital")).toBe(true);
  });

  it("signed uploads are verified by signature; impostors are deleted", { timeout: 60_000 }, async () => {
    const p = await projects.createProject(alice, `Upload check ${Date.now()}`, "edit");
    created.push(p.id);
    const bad = await upload(p.id, "source", "notes.pdf", new TextEncoder().encode("MZ not really a pdf at all"), "application/pdf");
    await expect(projects.confirmUpload(alice, p.id, bad)).rejects.toThrow(/not a supported/);
    const good = await upload(p.id, "reference", "page.png", png, "image/png");
    const view = await projects.confirmUpload(alice, p.id, good);
    expect(view).toMatchObject({ kind: "png", status: "ready" });
    expect(await (await fetch(view.url!)).arrayBuffer()).toHaveProperty("byteLength", png.length);
    await expect(projects.createUpload(alice, p.id, "source", "huge.pdf", 99 * 1024 * 1024, "application/pdf")).rejects.toThrow(/limited/);
  });

  it("versions are immutable, redo branches are dropped, and stale writes conflict", { timeout: 60_000 }, async () => {
    const p = await projects.createProject(alice, `Versions ${Date.now()}`, "digital");
    created.push(p.id);
    for (const i of [1, 2]) {
      const f = await upload(p.id, "version", `v${i}.pdf`, pdf, "application/pdf");
      await projects.confirmUpload(alice, p.id, f);
      await projects.addVersion(alice, p.id, f, i, `edit ${i}`, "native", [{ op: { type: "replace_text" }, report: { status: "applied" } }]);
    }
    // Undo to 1, then apply a different edit: version 2 must disappear (with its object).
    const before = await projects.getProject(alice, p.id);
    const v2key = before.versions.find((v) => v.index === 2)!.file!.id;
    const f3 = await upload(p.id, "version", "v2b.pdf", pdf, "application/pdf");
    await projects.confirmUpload(alice, p.id, f3);
    await projects.addVersion(alice, p.id, f3, 2, "edit 2b", "native", []);
    const after = await projects.getProject(alice, p.id);
    expect(after.versions.map((v) => v.label)).toEqual(["edit 1", "edit 2b"]);
    expect(after.versions.some((v) => v.file?.id === v2key)).toBe(false);
    expect(after.versions[0].operations).toHaveLength(1);

    const fresh = after.project.updatedAt.toISOString();
    await projects.updateProject(alice, p.id, fresh, { name: "Renamed" });
    await expect(projects.updateProject(alice, p.id, fresh, { name: "Stale write" })).rejects.toBeInstanceOf(projects.Conflict);
  });

  it("duplicate copies rows and objects; delete removes both", { timeout: 60_000 }, async () => {
    const p = await projects.createProject(alice, `Dup ${Date.now()}`, "edit");
    created.push(p.id);
    const f = await upload(p.id, "source", "lab.pdf", pdf, "application/pdf");
    await projects.confirmUpload(alice, p.id, f);
    const copy = await projects.duplicateProject(alice, p.id);
    created.push(copy.id);
    const c = await projects.getProject(alice, copy.id);
    expect(c.project.name).toMatch(/\(copy\)$/);
    expect(c.files).toHaveLength(1);
    const [row] = await db().select().from(s.sourceFiles).where(sql`${s.sourceFiles.projectId} = ${copy.id}`);
    expect(row.storageKey.startsWith(`projects/${copy.id}/`)).toBe(true);
    expect(await objectSize(row.storageKey)).toBe(pdf.length);
    await projects.deleteProject(alice, copy.id);
    expect(await objectSize(row.storageKey)).toBeNull();
    await expect(projects.getProject(alice, copy.id)).rejects.toBeInstanceOf(projects.NotFound);
  });

  it("users only see their own projects and jobs", { timeout: 60_000 }, async () => {
    const p = await projects.createProject(alice, `Private ${Date.now()}`, "edit");
    created.push(p.id);
    expect((await projects.listProjects(bob)).projects.some((x) => x.id === p.id)).toBe(false);
    await expect(projects.getProject(bob, p.id)).rejects.toBeInstanceOf(projects.NotFound);
    await expect(projects.deleteProject(bob, p.id)).rejects.toBeInstanceOf(projects.NotFound);
    await expect(projects.createUpload(bob, p.id, "source", "x.pdf", 10, "application/pdf")).rejects.toBeInstanceOf(projects.NotFound);
    const j = await jobs.createJob({ text: "x" }, {}, undefined, p.id, alice.id);
    createdJobs.push(j.id);
    await jobs.cancelJob(j.id); // keep it out of the shared queue
    const row = (await jobs.getJob(j.id))!;
    expect(jobs.ownsJob(row, alice)).toBe(true);
    expect(jobs.ownsJob(row, bob)).toBe(false);
  });

  it("free accounts stop after 3 generations; failed and cancelled jobs are not charged", { timeout: 60_000 }, async () => {
    expect(await quota(bob)).toEqual({ used: 0, limit: 3, left: 3 });
    const j1 = await jobs.createJob({ text: "x" }, {}, undefined, undefined, bob.id);
    createdJobs.push(j1.id);
    await jobs.cancelJob(j1.id);
    expect((await quota(bob)).used).toBe(0); // cancelled: free
    await recordPlan(bob);
    await recordPlan(bob);
    const j2 = await jobs.createJob({ text: "x" }, {}, undefined, undefined, bob.id);
    createdJobs.push(j2.id);
    expect((await quotaBlock(bob))?.status).toBe(402); // 2 plans + 1 queued job: in-flight jobs count too
    await db().execute(sql`update render_jobs set status = 'succeeded' where id = ${j2.id}::uuid`);
    expect(await quota(bob)).toEqual({ used: 3, limit: 3, left: 0 });
    expect((await quotaBlock(bob))?.status).toBe(402);
    expect(await quotaBlock({ ...bob, owner: true })).toBeNull(); // the owner is never paused
  });

  it("job queue: exclusive claims, checksums, lease expiry, retry budget, cancel", { timeout: 120_000 }, async () => {
    const payload = { text: "x" };
    const a = await jobs.createJob(payload, { reference: { data: png, type: "image/png" } }, `int-${Date.now()}-a`);
    const b = await jobs.createJob(payload, { reference: { data: png, type: "image/png" } }, `int-${Date.now()}-b`);
    createdJobs.push(a.id, b.id);
    expect((await jobs.createJob(payload, {}, a.idempotencyKey!)).id).toBe(a.id); // idempotent

    // Two workers claim concurrently: they never get the same job.
    const [c1, c2] = await Promise.all([jobs.claimJob("int-w1"), jobs.claimJob("int-w2")]);
    const ours = [c1?.id, c2?.id].filter((id) => id === a.id || id === b.id);
    expect(new Set(ours).size).toBe(ours.length);
    const mine = c1?.id === a.id || c1?.id === b.id ? { job: c1!, w: "int-w1" } : { job: c2!, w: "int-w2" };

    const input = await jobs.readInput(mine.job.id, mine.w, "reference");
    expect(input !== "not-owned" && input !== "missing" && input.data.length).toBe(png.length);
    expect(await jobs.readInput(mine.job.id, "intruder", "reference")).toBe("not-owned");
    expect(await jobs.putArtifact(mine.job.id, mine.w, "page-01.png", png, "image/png", "bad")).toBe("checksum-mismatch");
    expect(await jobs.putArtifact(mine.job.id, mine.w, "page-01.png", png, "image/png", jobs.sha256(png))).toBe("ok");
    expect(await jobs.completeJob(mine.job.id, mine.w, { artifacts: [{ name: "page-01.png", sha256: jobs.sha256(png) }] })).toBe("ok");
    const done = (await jobs.publicJob((await jobs.getJob(mine.job.id))!));
    expect(done).toMatchObject({ status: "succeeded", artifacts: ["page-01.png"] });
    expect(await (await fetch((await jobs.artifactUrl(mine.job.id, "page-01.png"))!)).arrayBuffer()).toHaveProperty("byteLength", png.length);

    // The other job: simulate a dead worker three times -> failed.
    const other = mine.job.id === a.id ? b.id : a.id;
    await db().execute(sql`update render_jobs set status = 'running', attempts = 3, lease_until = now() - interval '1 second', worker_id = 'gone' where id = ${other}::uuid`);
    const j = await jobs.getJob(other);
    expect(j).toMatchObject({ status: "failed", error: "The worker stopped responding too many times." });

    const c = await jobs.createJob(payload, { reference: { data: png, type: "image/png" } });
    createdJobs.push(c.id);
    expect(await jobs.cancelJob(c.id)).toBe(true);
    expect(await jobs.cancelJob(c.id)).toBe(false);
    expect((await jobs.workerOnline()).online).toBe(true); // int-w1/w2 were just seen
  });
});
