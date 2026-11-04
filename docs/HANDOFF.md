# Handoff

## Current state (2026-11-05)
- Collage engine integrated (ADR-037): worker `hw/collage.py`, pipeline `prepare` hook, `segments(digits=)`, app Engine
  select in `src/components/studio/generation-panel.tsx`, payload `engine`/`referenceText` in `src/lib/hwjob.ts`, job
  route accepts `reference2..4`. Verified: worker pytest 13/13, `npm test`, lint, build; DSA pipeline run 38/38 exact.
- Not yet verified: a live collage job on the deployed site through the Kaggle GPU (needs the owner signed in).
- Next task: owner tries "Your own ink" on the live site; then polish letter gaps (b/w/q/j, capitals) by asking for a
  page containing the missing letters, or a per-letter upload.
- Last verified push: see `git log -1` (the commit that adds this note).

## Immediately before the previous compaction (2026-11-04)
- Doing: owner's MIT Prototyping Assignment 1 in their own handwriting (reference: owner's DSA-IA activity PDF),
  notebook paper, hand-drawn prototype sketch, name/PRN/batch filled, max 2 pages. **Delivered** as a PDF in chat.
- Built for it: the collage engine (ADR-037), now saved in `workers/handwriting/experiments/collage/` (bank.py,
  collage.py). The one-off generator `make_assignment2.py` (assignment text, sketch, 7 mm ruling, Caveat fallback for
  missing letters) and the private bank/scans stay outside git in `C:\Users\Sahil\AppData\Local\Temp\claude\D--Assignment-writer-cloner\b839fc53-7fb9-48b6-9ed6-c68dba69de1f\scratchpad` (dsa/, out/).
- Product state: unchanged since `4b654f6` (all phases done, deployed). Nothing unfinished in the app.
- Next exact task (needs owner approval first): integrate the collage engine as `HW_ENGINE=collage` in
  `workers/handwriting/worker.py` `load()` — build the bank per job from the reference pages + a Groq transcript
  (`transcribeImage`), then render with `collage.render_pages`; add one pytest in `workers/handwriting/tests`.
  Alternative still open from master_prompt: browser-first rendering (Canvas + Web Worker) — unevaluated.
- Known errors: local DNS/NAT64 to Neon fails intermittently (use `node --dns-result-order=ipv4first`); a full
  live-site VATr++ job was never run end to end for that reason.
- Next test: `cd workers/handwriting && .venv\Scripts\python -m pytest tests` (11 pass) and `npm test`.
- Next git checkpoint: `feat(handwriting): collage engine from the writer's own ink` once integrated.

> Latest: VATr++ default engine, AI reading of scans, handwritten tables (ADR-033…035); accounts + free Kaggle cloud GPU live (PROJECT_STATUS "Post-phase update"). Live GPU test: `KAGGLE_LIVE=1 npm run test:live -- kaggle` (production queue, cleans up).
> Full recovery snapshot: `docs/CONTEXT_SNAPSHOT.md` (state, versions, env names, ML results, schema, restart commands).

## Resume
1. Read `master_prompt.md`, `CLAUDE.md`, `docs/PROJECT_STATUS.md`, this file, `docs/DECISIONS.md`.
2. `git log -5 --oneline && git status`
3. `npm install && npx playwright install chromium`
4. `npm run lint && npm test && npm run build && npm run test:e2e` and `npm run test:int` (Neon dev branch); `npm run db:clean-dev` afterwards (add `GROQ_LIVE=1` for the live E2E plan; `npm run test:live` for the 10-command Groq eval)

## Environment
- Repo path: `D:\Assignment writer_cloner` (moved from OneDrive on 2026-11-02).
- Worker: `workers\handwriting\setup.ps1` then `run-worker.ps1 -Api http://localhost:3000`; live tests need it polling.
- Windows 11, Node 24.13, npm 11.8, Python 3.11 available via `py -3.11`, RTX 5050 Laptop 8 GB.
- Git identity: repository uses the owner's configured global identity (`sahilkarande0918-cmd`). Do not change it. No AI co-author trailers.
- Remote: `origin https://github.com/sahilkarande0918-cmd/Assignment-writer-cloner.git`, branch `main`.
- Env vars: see `.env.example`. Neon values come from `neon env pull --project-id ancient-fog-17705922 --branch production -s postgres -s object-storage -s data-api` (Neon CLI signed in as the owner). `.env.local` exists locally with the owner's `GROQ_API_KEY` (git-ignored — never print or commit it).

## Checkpoint log
| Phase | Commit message | SHA | Verified via |
|---|---|---|---|
| 1 | feat(phase-1): build foundation and premium workspace | `1b18c16d68a75338ce417b74f938142fe6949ca7` | `git ls-remote origin main` matched 2026-11-01 |
| 2 | feat(phase-2): implement document intake and Groq edit planning | `33b921834e32fa19537beb1f20cf09e54b0b124b` | `git ls-remote origin main` matched 2026-11-01 |
| 3 | feat(phase-3): add layout-aware digital editor and exports | `cdb70dd660c92313a9731903185f735fa8a2eefb` | `git ls-remote origin main` matched 2026-11-02 |
| 4 | feat(phase-4): integrate reference handwriting generation | `6f412e4c0a77d4a4bb4a9ed51c12695265cf7e50` | `git ls-remote origin main` matched 2026-11-02 |
| 5 | feat(phase-5): ship persistent assignment studio | `9d9b9d827d555e326523355954c0bca8be9565da` | `git ls-remote origin main` matched 2026-11-02 |

## Changes since previous phase
Phase 5: Neon persistence (Drizzle, migrations in `drizzle/`), private bucket uploads, owner sign-in (`src/proxy.ts`, `/login`), projects API, library UI, studio autosave/restore, job queue on Neon, security headers, integration tests (`tests/integration`), perf test.

Phase 4: repo moved to `D:\Assignment writer_cloner` (out of OneDrive). Handwriting worker (`workers/handwriting`), job API (`src/app/api/jobs`, `src/app/api/worker`), `src/lib/server/jobs.ts`, `src/lib/hwjob.ts`, Generation panel, live/sim tests. `.env.local` now also holds a random `WORKER_TOKEN` (git-ignored).

Phase 3: `src/lib/edit/*` engines (MuPDF native PDF, DOCX XML runs, raster reconstruction, text), `src/lib/export.ts`, `src/lib/diff.ts`, versions/undo/redo/diff/report UI, working export dialog, `scripts/verify_exports.py`, `scripts/copy-assets.mjs` (renamed from copy-pdfjs; now also copies MuPDF to `public/mupdf`).

Phase 2: document intake (PDF.js/JSZip/docx-preview/Tesseract), Groq plan + transcribe + status APIs, resolver, plan/diff UI, manual find & replace, Convert transcript, fixtures, live eval.

## Deployment
- https://assignment-writer-cloner.vercel.app — Vercel project `assignment-writer-cloner` (team `sahilkarande0918-9163s-projects`); `main` auto-deploys. Manual: `vercel deploy --prod --scope sahilkarande0918-9163s-projects`. Env vars: `vercel env add NAME production` (value via stdin); storage uses `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

## Commands added after phase 5
- `neon neon-auth status|config email-password get --project-id ancient-fog-17705922 --branch production|dev`
- `workers\handwriting\.venv\Scripts\modal deploy modal_app.py` (needs Modal token + payment method; secret `assignment-studio` holds HW_API_URL + HW_WORKER_TOKEN)
- E2E signs up a fresh user on the dev branch (no email verification there); `GENERATE_LIVE=1` runs live generation with a local worker on `HW_API_URL=http://localhost:3100`.

## Commands added in phase 5
- `npm run db:migrate:dev` / `npm run db:migrate:prod` — apply `drizzle/` migrations (dev first).
- `npx drizzle-kit generate --name <change>` — new migration after editing `src/lib/server/db/schema.ts`.
- `neon env pull --project-id ancient-fog-17705922 --branch dev --file .env.test.local -s postgres -s object-storage` (+ `STORAGE_BUCKET=assignment-files`) — test env.

## Open issues
- Background `next start`/worker processes can outlive their task wrapper on Windows; kill by command line (`next start -p 3100`, `worker.py`) before restarting.
- **OneDrive**: this repo lives in a OneDrive-synced folder. Builds/tests hung and left unkillable node processes until a reboot (sync holding handles on `.next`/`node_modules`). If it recurs: reboot or pause sync; long-term move the repo outside OneDrive.
- MuPDF must not be bundled (Turbopack stalls on its 14 MB wasm): it is copied to `public/mupdf` by postinstall and imported at runtime with `webpackIgnore`.
- Bash-tool heredocs mangle backslashes/quotes: write files with the Write tool.
- Playwright needs `workers: 4` and 60 s timeout on this laptop; axe runs after animations settle.
