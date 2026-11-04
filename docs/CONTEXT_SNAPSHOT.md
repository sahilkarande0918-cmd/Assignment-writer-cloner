# Context snapshot — session recovery

Written 2026-11-02 before context compaction. Source of truth for requirements: `master_prompt.md` (verbatim, never edit).
Read order for a new session: `master_prompt.md` → `CLAUDE.md` → this file → `docs/PROJECT_STATUS.md` → `docs/HANDOFF.md`
→ `docs/DECISIONS.md` → `git log -5 --oneline && git status`.

## 0a. Update 2026-11-04
Last product push `4b654f6` (export fix). Collage "real handwriting" experiment added (ADR-037, `docs/HANDOFF.md` top).
VATr++ is the default engine (ADR-035); accounts + free Kaggle GPU live (ADR-027..030).

## 0. Update after this snapshot (2026-11-02, later)
Accounts (Neon Auth), font fallback for all characters, progress bar and Modal cloud GPU were added — see
`docs/PROJECT_STATUS.md` "Post-phase update" and ADR-027..029. The owner-password sections below are superseded:
`OWNER_PASSWORD_HASH`/`SESSION_SECRET`/`.owner-password` are no longer used; env now needs `NEON_AUTH_BASE_URL`,
`NEON_AUTH_COOKIE_SECRET`, optional `OWNER_EMAIL`, `GPU_TRIGGER_URL`. Last verified push `d0a360c`.

## 1. Where the project stands
- **All five phases are complete, tested, committed separately and pushed.** Phase 5 includes the Vercel deployment.
- Last verified push: **`91356d9e47e699575abd6dbeaebc58fdc17ac877`** on `main` (`git ls-remote origin main` matched).
- Branch: `main`. Remote: `https://github.com/sahilkarande0918-cmd/Assignment-writer-cloner.git`.
- Working tree at snapshot time: **clean** (no uncommitted work).
- Live: **https://assignment-writer-cloner.vercel.app** (owner sign-in). `main` auto-deploys (Vercel Git connected).
- Repo path on disk: `D:\Assignment writer_cloner` (moved out of OneDrive on 2026-11-02; the old OneDrive folder is empty
  and may still exist because a session held it open — safe to delete by hand).

| Phase | Commit message | Verified SHA |
|---|---|---|
| 1 | feat(phase-1): build foundation and premium workspace | `1b18c16` |
| 2 | feat(phase-2): implement document intake and Groq edit planning | `33b9218` |
| 3 | feat(phase-3): add layout-aware digital editor and exports | `cdb70dd` |
| 4 | feat(phase-4): integrate reference handwriting generation | `6f412e4` |
| 5 | feat(phase-5): ship persistent assignment studio | `9d9b9d8` |
| — | chore(deploy) ×2, docs: record phase-5 checkpoint SHA and verified deployment | `ea35f2e`, `11b51a7`, `91356d9` |

Other commits are docs-only SHA records, `chore: configure Neon Postgres and object storage` (`b976624`) and
`wip(phase-5)` (`63c69c4`, superseded by the phase-5 commit). All 14 commits authored by `sahilkarande0918-cmd
<sahilkarande0918@gmail.com>`; **no Co-authored-by / generated-by / AI attribution anywhere** (audited with git log).

Progress percentage: not stated — every acceptance item is either done with evidence (TEST_MATRIX) or listed as a known
limit below.

## 2. Product as built (owner-added requirement included)
Modes: **Edit Assignment**, **Handwriting Clone** (with `Text → Assignment` toggle), **Convert Handwriting** (owner request:
assignment 1 content in assignment 2's handwriting; mandatory transcript confirmation), **Digital Studio**; plus
**Library** and **Export**. Landing page with lazy WebGL paper hero (static fallback for phones / reduced motion).

- Intake (browser): PDF.js 6 (previews, lines with geometry, fonts + embedded flags), DOCX via JSZip + docx-preview,
  images/scanned PDFs via Tesseract.js (local OCR, model from jsDelivr), TXT/MD; signature (magic-byte) validation,
  25 MB / 60 pages, encrypted/corrupt/macro rejection.
- Groq planning (server): Zod plan contract, strict JSON schema, retry on 120b, deterministic target resolver
  (ok/ambiguous/unresolved/invalid), injection-safe prompt, manual find & replace without AI, vision transcription with consent.
- Editing engines: MuPDF.js native PDF edits (text-only redaction, original font reuse when glyphs exist, else flagged
  standard-14 substitute), DOCX XML-run edits (other package parts byte-identical), scan/photo erase-and-redraw
  reconstruction (always labelled "not exact"), TXT/MD. Immutable versions, undo/redo (Ctrl+Z), pixel diff + line diff,
  change report with verification.
- Exports: PDF (native pass-through or generated), PNG/JPEG at 150/200/300 DPI (ZIP multi-page), DOCX (native or text-only),
  TXT, MD; DOCX→PDF/PNG disabled with reason (needs LibreOffice in the worker — not built).
- Handwriting (local GPU worker): DiffusionPen word generation, style crops from reference lettering only, paper
  reconstruction (writing removed, rules kept) or labelled synthetic paper, letter-shape sizing, baseline/margin layout,
  page breaks, ink layer composited once, overlap/clip check, best-of-N with TrOCR word check, regenerate line,
  provenance manifest, composite / paper-only / ink-only outputs, Tesseract OCR back-check in browser.
- Persistence (Neon): projects, uploads, versions, operations, jobs, artifacts; autosave + full restore on
  `/studio?project=<id>`; library search/filter/rename/duplicate/delete/download; 50-project quota, no expiry.
- Security: owner sign-in (scrypt + HMAC cookie), proxy + per-route checks, worker bearer token, same-origin + size +
  bucketed rate limits, CSP and security headers, noindex, private bucket with 10-minute signed URLs.

## 3. Architecture and why (full ADRs in `docs/DECISIONS.md`)
- Next.js 16.4.3 App Router (`cacheComponents` on; read `node_modules/next/dist/docs/`), Middleware is now `src/proxy.ts`.
- Browser-first document processing (ADR-006) so editing works without the worker and files never hit serverless limits.
- MuPDF.js (AGPL, ADR-014) served from `public/mupdf` and imported with `webpackIgnore` (Turbopack stalls bundling its
  14 MB wasm). PDF.js assets in `public/pdfjs`. Both copied by `scripts/copy-assets.mjs` (postinstall, git-ignored output).
- Groq only (ADR-010/011). Plan = data, never code.
- Handwriting: DiffusionPen vendored (MIT) — **reforge has no licence, so it was evaluated but not used** (ADR-018);
  DiffInk not integrated (needs stroke data, weights on Drive/Baidu); **MiniMind excluded** (language model, ADR-008).
- Persistence: Drizzle + Neon HTTP driver, bytes in Neon Object Storage, optimistic locking (ADR-024); jobs on Neon with
  `FOR UPDATE SKIP LOCKED` (ADR-025); owner auth without an auth service (ADR-023); hardening (ADR-026).
- **Deviations from the original tech wish-list, deliberate and documented:** shadcn/ui pattern without the CLI
  (ADR-002); `motion` + CSS instead of GSAP/Lenis, no Magic UI components copied (ADR-003, ADR-005: not needed,
  accessibility); stock hero video replaced by a procedural WebGL scene to avoid licensing risk (ADR-004).
  Revisit only with a concrete need.

## 4. Significant files
- App: `src/app/{page,layout}.tsx`, `src/app/{studio,library,login}/`, `src/proxy.ts`, `src/app/robots.ts`.
- API: `src/app/api/{plan,transcribe,groq/status}`, `api/auth/{login,logout}`, `api/projects/**`, `api/jobs/**`, `api/worker/**`.
- Studio UI: `src/components/studio/*` (studio, upload-card, inspector, composer, export-dialog, document-view,
  text-panel, plan-panel, transcript, diff-view, generation-panel, paper-preview, use-document, use-cloud).
- Library: `src/components/library/library-view.tsx`. Landing: `src/components/landing/*`.
- Logic: `src/lib/{formats,studio,plan,hwjob,export,diff,cloud,utils}.ts`, `src/lib/doc/*`, `src/lib/edit/*`,
  `src/lib/server/{groq,guard,auth,password,storage,projects,jobs,http}.ts`, `src/lib/server/db/{schema,index}.ts`.
- DB: `drizzle/0000_init.sql` (+ meta), `drizzle.config.ts`.
- Worker: `workers/handwriting/{worker.py,download_models.py,setup.ps1,run-worker.ps1,README.md,requirements*.txt}`,
  `hw/{model,style,paper,compose,recognize,pipeline}.py`, `vendor/diffusionpen/` (MIT, `SOURCE_COMMIT`), `tests/`.
- Scripts: `scripts/{copy-assets.mjs,groq-check.mjs,make_fixtures.py,verify_exports.py,set-owner-password.mjs,clean-dev.mjs}`.
- Config: `next.config.ts` (CSP/headers), `vercel.json` (framework nextjs, iad1), `.vercelignore`, `playwright.config.ts`
  (injects dev-branch env), `vitest.config.ts`, `eslint.config.mjs`, `.env.example`.
- Tests: `tests/unit/*`, `tests/integration/cloud.int.test.ts`, `tests/live/plan.live.test.ts`, `tests/e2e/*`,
  `tests/fixtures/*` (synthetic).

## 5. Versions actually installed
Node 24.13.1, npm 11.8. next 16.4.3, react 19.3.0, typescript 5.9.3, tailwindcss 4.3.3, motion 14.9.0, three 0.187.0,
@react-three/fiber 9.8.2, @radix-ui/react-dialog 1.3.1, @radix-ui/react-switch 1.4.1, lucide-react 1.66.0, zod 4.6.7,
groq-sdk 1.6.0, pdfjs-dist 6.4.299, mupdf 1.28.1, jszip 3.10.2, docx-preview 0.4.1, tesseract.js 7.0.0,
drizzle-orm 0.45.4, drizzle-kit 0.31.11, @neondatabase/serverless 1.2.0, @aws-sdk/client-s3 + s3-request-presigner
3.1161.0, vitest 5.0.5, @playwright/test 1.64.1, @axe-core/playwright 4.14.0.
Worker (Python 3.11 venv, `requirements.lock.txt`): torch 2.11.0+cu128, torchvision 0.26.0+cu128, diffusers 0.42.1,
transformers 5.22.1, timm 1.0.30, einops 0.8.2, omegaconf, opencv-python-headless 5.0.0.93, pillow 13.0.0,
numpy 2.4.6, huggingface_hub 2.4.0, sentencepiece, protobuf, pytest 9.2.0.
Global CLIs: `neon` 8.16.0 (signed in), `vercel` 65.9.0 (signed in).

## 6. Integrations
| Integration | State |
|---|---|
| Groq (`openai/gpt-oss-20b`, `gpt-oss-120b`, vision `qwen/qwen3.8-27b`) | Done; models verified via models API; 10-command live eval 10/10 |
| Neon Postgres (project `ancient-fog-17705922` "Assignment cloner", branches `production` br-cool-math-b5r7pm8h, `dev`) | Done; migrations applied to both |
| Neon Object Storage (private bucket `assignment-files` on production and dev) | Done; signed URLs, CORS for direct PUT verified |
| Vercel (team `sahilkarande0918-9163s-projects`, project `assignment-writer-cloner`) | Done; 13 prod env vars; Git connected |
| Local GPU worker (outbound polling) | Done; live runs passed on in-memory (ph4) and Neon (ph5) queues |
| Neon Claude Code plugin (skills + MCP) | Installed; its MCP server needs `/mcp` authorization in Claude Code to be usable |
| Pending | LibreOffice DOCX→PDF in worker; Neon Auth only if multi-user is ever needed |

## 7. Environment variable names (values only in git-ignored files / Vercel)
`.env.local` (production): GROQ_API_KEY, GROQ_MODEL, GROQ_REASONING_MODEL, GROQ_VISION_MODEL, DATABASE_URL,
DATABASE_URL_UNPOOLED, NEON_PROJECT_ID, NEON_BRANCH, NEON_DATA_API_URL, API_URL (owner-added duplicate of the Data API
URL, unused), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION, STORAGE_BUCKET,
OWNER_PASSWORD_HASH, SESSION_SECRET, WORKER_TOKEN, VERCEL_OIDC_TOKEN (written by `vercel link`).
`.env.test.local` (Neon dev branch, for integration + E2E): DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH, AWS_*,
STORAGE_BUCKET. `.owner-password` holds the owner password in plaintext (git-ignored).
Vercel production: GROQ_* (4), DATABASE_URL, STORAGE_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID,
S3_SECRET_ACCESS_KEY (Vercel reserves AWS_*), OWNER_PASSWORD_HASH, SESSION_SECRET, WORKER_TOKEN.
Worker shell: HW_API_URL, HW_WORKER_TOKEN, optional HW_MODEL_DIR.

## 8. ML setup and measured results
- GPU: RTX 5050 Laptop, 8 GB, compute 12.0; needs CUDA 12.8 PyTorch (verified kernels run).
- Weights in `workers/handwriting/models/` (git-ignored, hashes in `models/MANIFEST.json`): DiffusionPen `ema_ckpt.pt`
  680 MB (contains UNet + CANINE; keys `module.text_encoder.module.*` remapped), style encoder 11 MB, SD-1.5 VAE fp16
  167 MB + configs, CANINE-c config/tokenizer only, TrOCR-small-handwritten 246 MB. Owner approved all downloads.
- Licences: DiffusionPen MIT (weights trained on IAM, non-commercial research data), SD-1.5 VAE CreativeML OpenRAIL-M,
  CANINE Apache-2.0, TrOCR MIT per microsoft/unilm (HF card has no licence tag).
- Measured: load 8.3 s / 0.81 GB; 0.35 s per word, peak 1.05 GB VRAM; 42-word page best-of-3 ≈ 22 s; word check 27/42
  exact, CER 21.6 %. Style reference in tests is a computer font — **similarity to a real writer not yet measured**.
- Limits: IAM charset (80 chars), English; long words misspell more; generation only while the owner's PC runs the worker.

## 9. Database schema (`src/lib/server/db/schema.ts`, migration `drizzle/0000_init.sql`)
projects (id, name, mode, status, settings jsonb, cursor, timestamps) · source_files (project_id, slot
source|reference|paper|version, name, kind, mime, bytes, storage_key, status pending|ready) · reference_styles ·
document_versions (project_id, index unique per project, file_id, label, method) · operations (version_id, op, report) ·
render_jobs (status, payload, inputs jsonb, attempts, max_attempts, lease_until, worker_id, idempotency_key unique,
error, manifest, history) · output_artifacts (job_id, name unique per job, sha256, storage_key) · workers (id, last_seen).
Owner = env config (no users table).

## 10. Tests actually run (details and history in `docs/TEST_MATRIX.md`)
Last full run (2026-11-02): unit 52 passed / 15 skipped; integration 5/5 on Neon dev branch; lint + build pass;
E2E 28 passed / 16 skipped (signed in, CSP on, live Groq); live generation E2E 2/2 with worker on Neon queue;
worker tests 6 simulated + 2 live; perf + a11y 11 passed; **production smoke test 21/21** on the live URL.
Still worth doing: authorised real-handwriting similarity study; password-protected PDF fixture; photo-with-perspective
fixture.

## 11. Known bugs, blockers, recent failures
- No open blockers.
- Most recent failed command: a Python doc-edit script raised `re.PatternError: bad escape \h` (a Windows path in a regex
  replacement); nothing was written; redone with a literal replacement and committed (`91356d9`).
- During the production smoke test the owner's network briefly failed DNS / IPv6 (NAT64) connections; retries with
  `node --dns-result-order=ipv4first` passed. Not an app bug.
- Environment gotchas: Bash-tool heredocs mangle backslashes/quotes (use the Write tool); background `next start` /
  `worker.py` processes can outlive their task on Windows (kill by command line); OneDrive caused hung builds before the move.
- Known product limits: DOCX→PDF needs worker LibreOffice; native PDF edits are single-line, Latin, unrotated pages;
  CSP keeps `'unsafe-inline'` scripts (Next bootstrap); in-memory rate limits are per serverless instance.

## 12. Next exact step
No phase work remains. Optional next tasks (only on owner request): LibreOffice DOCX→PDF in the worker; similarity
study with the owner's authorised handwriting; nonce-based CSP.

## 13. Restart commands
```powershell
cd "D:\Assignment writer_cloner"
npm install                      # also copies PDF.js + MuPDF assets (postinstall)
npm run dev                      # http://localhost:3000 — sign in with the password in .owner-password
npm run lint; npm test; npm run build
npm run test:int                 # Neon dev branch
npm run test:e2e                 # dev branch env injected by playwright.config.ts; add GROQ_LIVE=1 for live Groq
npm run db:clean-dev             # remove test data from the dev branch
npm run db:migrate:dev; npm run db:migrate:prod
workers\handwriting\setup.ps1    # only if the venv/models are missing (they exist on this PC)
workers\handwriting\run-worker.ps1 -Api https://assignment-writer-cloner.vercel.app   # or http://localhost:3000
vercel deploy --prod --scope sahilkarande0918-9163s-projects                         # manual deploy (main auto-deploys)
```
