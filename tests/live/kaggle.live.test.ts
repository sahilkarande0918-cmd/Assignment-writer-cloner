// LIVE: a real job on the production queue is picked up by a Kaggle GPU run started through startGpu().
// Run: KAGGLE_LIVE=1 npm run test:live -- kaggle   (uses .env.local: production DB + Kaggle credentials; ~10 min)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { startGpu } from "@/lib/server/gpu";
import { deletePrefix } from "@/lib/server/storage";
import * as jobs from "@/lib/server/jobs";

const enabled = !!process.env.KAGGLE_LIVE && !!process.env.KAGGLE_USERNAME && !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("Kaggle cloud GPU", () => {
  it("starts a Kaggle run that generates and uploads the pages", { timeout: 90 * 60_000 }, async () => {
    // KAGGLE_TEXT_FILE=<path> benchmarks a real-sized assignment instead (the symbol check is skipped then).
    const custom = process.env.KAGGLE_TEXT_FILE ? readFileSync(process.env.KAGGLE_TEXT_FILE, "utf8") : null;
    const payload = {
      text: custom ?? "Kaggle check: the error was 2% at 25°C, cost £5 © lab {A} [B].\n\nResult: the period depends on the length.",
      pageSize: "A4", paper: "ruled", penColor: "#1f2f5c", sizePt: 14, keepLineBreaks: true, seed: 11, candidates: 3, bumps: {},
      marginLeftMm: 25, marginTopMm: 30, lineSpacingMm: 8,
    };
    const job = await jobs.createJob(payload, { reference: { data: new Uint8Array(readFileSync("tests/fixtures/ruled-page.png")), type: "image/png" } });
    try {
      expect(await startGpu()).toBe(true);
      let j = await jobs.getJob(job.id);
      const seen = new Set<string>();
      const t0 = Date.now();
      while (j && !["succeeded", "failed", "cancelled"].includes(j.status) && Date.now() - t0 < 85 * 60_000) {
        await new Promise((r) => setTimeout(r, 10_000));
        j = await jobs.getJob(job.id);
        const p = j?.progress as { stage?: string; percent?: number } | null;
        const line = `${j?.status} ${p?.stage ?? ""} ${p?.percent ?? ""}`.trim();
        if (!seen.has(line)) console.log(`${Math.round((Date.now() - t0) / 1000)}s ${line}`);
        seen.add(line);
      }
      expect(j?.error ?? null).toBeNull();
      expect(j?.status).toBe("succeeded");
      expect([...seen].some((l) => /^running .+ [0-9.]+$/.test(l))).toBe(true); // a real stage + percentage was reported
      const m = j!.manifest as { font_drawn: string[]; word_check: { candidates: number; exact_words: number; exact_first_pass: number; words: number; cer: number }; seconds: number; pages: unknown[] };
      if (!custom) expect(m.font_drawn).toEqual(expect.arrayContaining(["%", "°", "£", "©", "{", "}", "[", "]"]));
      expect(m.word_check.candidates).toBe(3); // full quality: best of 3 with the word check
      console.log(`generated in ${m.seconds}s on the GPU; total ${Math.round((Date.now() - t0) / 1000)}s including start-up; ${m.pages.length} pages`);
      const wc = m.word_check;
      console.log(`word check: ${wc.exact_words}/${wc.words} exact (first pass ${wc.exact_first_pass}), CER ${(wc.cer * 100).toFixed(1)}%`);
      const pub = await jobs.publicJob(j!);
      expect(pub.artifacts).toContain("page-01.png");
      const page = await fetch((await jobs.artifactUrl(job.id, "page-01.png"))!);
      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/kaggle-page-01.png", new Uint8Array(await page.arrayBuffer())); // for visual review
    } finally {
      await db().execute(sql`delete from render_jobs where id = ${job.id}::uuid`);
      await deletePrefix(`jobs/${job.id}/`);
    }
  });
});
