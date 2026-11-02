# Decisions (ADR log)

## ADR-001 Next.js 16 App Router + TypeScript + Tailwind v4 (phase 1)
Scaffolded with `create-next-app@latest` (Next 16.4.3, React 19.3, `cacheComponents` on). Vercel-native, server route handlers keep secrets server-side.

## ADR-002 shadcn/ui pattern, not the CLI (phase 1)
Components are owned source in `src/components/ui` built on Radix (Switch, Dialog) + `cn()` — the shadcn approach without generating unused components. Native `<select>`/`<input type=range>` are used where they are fully accessible and smaller.

## ADR-003 Motion: CSS first, `motion` for in-view reveals, no GSAP/Lenis (phase 1)
CSS keyframes handle the hero; `motion` (`MotionConfig reducedMotion="user"`) handles scroll reveals. GSAP ScrollTrigger was not genuinely needed for the effects used; Lenis was skipped because smooth-scroll hijacking hurts keyboard/assistive navigation. Revisit only if a specific effect needs them.

## ADR-004 Hero: lightweight react-three-fiber scene instead of stock video (phase 1)
The cinematic element is a procedurally textured WebGL paper scene (no external assets, so no licensing risk). It is lazy-loaded on idle and skipped for reduced-motion, phones, low-core devices, Save-Data and no-WebGL; a CSS paper stack is the static fallback. No footage was downloaded or hotlinked. A licensed clip can be added later if the owner supplies one.

## ADR-005 Magic UI / Inspira UI (phase 1)
Inspira UI is Vue/Nuxt — not installed (no Vue inside Next.js). Magic UI components were not needed for the current effects; none copied.

## ADR-006 Browser-first document processing (planned, phases 2–3)
PDF.js, pdf-lib, JSZip and Tesseract (wasm) run in the browser so essential editing works without the GPU worker or cloud storage, and large files never pass through serverless body limits. Native PDF redaction-quality edits (PyMuPDF) run in the optional worker and are labelled as such.

## ADR-007 Ponytail plugin (phase 1)
Installed as a Claude Code plugin (`ponytail@ponytail`); its hook and skills (`ponytail-review`, `ponytail-audit`) are active in this environment. It is an engineering-discipline plugin, not a design system.

## ADR-008 MiniMind is not part of this product
`jingyaogong/minimind` trains small *language* models. It cannot generate handwriting images, and planning is handled by Groq. It will not be trained or integrated (re-confirmed in RESEARCH.md, phase 4).

## ADR-009 Convert Handwriting as its own mode (owner request, 2026-11-01)
Owner asked for: upload assignment 1 (content) + assignment 2 (handwriting) → assignment 1's content written in assignment 2's handwriting. It is a separate studio mode rather than a toggle inside Clone, because its inputs and checks differ: content comes from an OCR transcript of assignment 1 that the owner must review before generation (no instruction required), and assignment 2 is used for style only. Paper can come from assignment 1, assignment 2, or a labelled approximation; line breaks can be kept or reflowed. Pipeline: OCR (ph2) → transcript review (ph2) → style extraction + generation + composition (ph4) → OCR back-check vs transcript (ph4).

## ADR-010 Plan contract: model proposes, code verifies (phase 2)
Groq returns a flat, strict-mode-compatible JSON plan (every key required, nullable instead of optional). Every operation must quote the exact original text; `resolvePlan` checks it against the real spans and marks ok/ambiguous/unresolved/invalid. Ambiguous ops need the owner to pick an occurrence. Model output that fails Zod is retried once on `gpt-oss-120b`, then rejected. Document text is wrapped as untrusted data with tag neutralisation. Manual find & replace builds the same plan without AI.

## ADR-011 Local OCR first, Groq vision only with consent (phase 2)
Tesseract.js runs in the browser; the image never leaves the device (the English model file is fetched from the jsDelivr CDN on first use). Handwriting OCR is weak, so Convert mode offers "Improve transcript with Groq vision" behind an explicit consent checkbox; images are downscaled to fit Vercel's request limit.

## ADR-012 DOCX preview via docx-preview (phase 2)
`docx-preview` (Apache-2.0) renders an approximate view; edits will target the original XML runs, not the preview. Labelled approximate in the UI.

## ADR-013 PDF.js assets served same-origin (phase 2)
`scripts/copy-pdfjs.mjs` (postinstall) copies the worker, CMaps, standard fonts, wasm and ICC profiles into `public/pdfjs` (git-ignored). `fontExtraProperties: true` is required to read real font names.

## ADR-014 MuPDF.js (WASM) for native PDF edits and exports (phase 3)
`mupdf@1.28.1` (Artifex, **AGPL-3.0-or-later**) runs in the browser and Node. It gives per-character fonts/positions, text-only redaction (`REDACT_LINE_ART_NONE`, `REDACT_IMAGE_NONE` — rules, borders, underlines and images survive), font embedding and page rendering. AGPL is acceptable for this private, source-available app; anyone distributing a modified hosted version must offer its source. Alternatives rejected: pdf-lib (cannot remove existing text), PyMuPDF-only (would make basic PDF edits depend on the optional worker). Its Node-only `import("module")` is aliased to `src/lib/node-stub.js` for browser builds.

Font policy: redraw with the original embedded font when it can render every new glyph. Subset fonts (`ABCDEF+Name`) keep cmap entries for dropped glyphs, so for them only characters the document already draws with that font are trusted; otherwise a standard-14 font of the same class (serif/sans/mono, bold/italic) is used and the report says "font substituted". Only the changed glyphs through the end of the line are redacted and redrawn (tail keeps its own font runs). Width growth > 2 pt and page overflow are reported. New lines are inserted only into free space; otherwise refused. Rotated pages and non-Latin text are refused for native edits (reported).

## ADR-015 DOCX edits on XML runs (phase 3)
Matches are located across `w:t` nodes (tracked deletions skipped); the replacement inherits the run where the match starts; only `word/document.xml` is rewritten (all other parts byte-identical — unit-tested). New paragraphs clone the source paragraph's formatting. DOCX→PDF/PNG is unavailable in the browser (needs LibreOffice in the worker) and the export dialog says so.

## ADR-016 Scans/photos: erase-and-redraw reconstruction (phase 3)
Ink inside the OCR line box is masked (luminance below paper), long ruled/margin lines are protected, masked pixels are back-filled from the same column, then the new line is drawn once in a typed font with the sampled ink colour. Always labelled "Reconstruction — not exact". Handwritten redraw comes from the GPU worker in phase 4. Scanned PDFs: only edited pages are replaced by an image; other page objects are untouched.

## ADR-017 Versions and undo (phase 3)
Every apply produces a new immutable `File`; the original upload is version 0 and never modified. Undo/redo moves a cursor; applying after undo drops the redo branch. Plans carry the version id and are refused when stale. After each apply the new version is re-extracted and each change is marked verified / not confirmed.

## ADR-018 Handwriting model: DiffusionPen, vendored, reforge not used (phase 4)
DiffusionPen is the only candidate with permissive code, downloadable weights, page-image style input and an 8 GB-friendly
footprint (peak ~1 GB measured). reforge has no licence, so its code is not used; DiffInk needs online stroke data.
Only the files inference needs are downloaded (`download_models.py`, hashes in `models/MANIFEST.json`, git-ignored).

## ADR-019 Word-level generation + our own composition (phase 4)
DiffusionPen generates single words on a 64×256 canvas, stretching every word to full height. Composition restores size
from letter shape (x-height, ascender, descender units), sits words on detected rule baselines, wraps within margins,
breaks pages, and composites a transparent ink layer once over the paper template. A per-page scale clamp was tried and
rejected (it enlarged ascender-free words). Every occurrence has its own seed, so "regenerate line" re-seeds only that line.

## ADR-020 Best-of-N with a recogniser (phase 4)
To reduce misspellings, N samples per word are scored by TrOCR-small and the closest reading wins (prefix-tolerant
distance because TrOCR is a line model that appends junk to single words). N is user-selectable (1/3/6). The manifest
reports exact words, CER and doubtful words; the browser can also run a Tesseract back-check (rough signal).

## ADR-021 Job queue in server memory for now (phase 4) — superseded by ADR-025
The outbound-polling protocol (claim → lease 120 s → heartbeat → checksummed artifacts → complete/fail, retry budget 3,
idempotency keys, owner-only lease actions, cancel) is implemented against an in-memory store with an injectable clock.
It works for one local `next start` process; on Vercel each serverless instance has its own memory, so **phase 5 moves the
same functions onto Neon + object storage**. The UI states that jobs are server-memory only.

## ADR-022 Neon setup: Postgres + Object Storage on project "Assignment cloner" (2026-11-02)
Owner signed in with the official Neon CLI (`neon` 8.16.0, npm package from the neondatabase org) and the Neon Claude Code
plugin (skills + MCP) was installed per https://neon.com/prompts/agent-setup.md. Project `ancient-fog-17705922`
("Assignment cloner", aws-us-east-2, Postgres 18.6), branch `production`, database `neondb`. A **private** bucket
`assignment-files` was created; credentials come from `neon env pull -s object-storage -s data-api` (branch-scoped,
AWS-standard names `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`). Access via the AWS
S3 SDK with `forcePathStyle: true` and presigned URLs; anonymous reads return 403 (verified). `DATABASE_URL` is the pooled
string for serverless, `DATABASE_URL_UNPOOLED` for migrations. Neon's AI Gateway is not used (Groq only). Phase 5 builds
the persistence layer on these; owner authentication is still to be decided in phase 5.

## ADR-023 Single-owner sign-in without an auth service (phase 5)
The app has exactly one owner, so a full identity provider is unnecessary. `OWNER_PASSWORD_HASH` holds a Node scrypt hash
(N=2^15, r=8, p=1; `:`-separated because Next's env loader expands `$`), set by `scripts/set-owner-password.mjs` (plaintext
only in git-ignored `.owner-password`). Sessions are `exp.HMAC-SHA256(SESSION_SECRET)` in an HttpOnly, SameSite=Lax,
Secure-on-HTTPS cookie (30 days), verified with Web Crypto in both `src/proxy.ts` (page redirects) and every API route
(`requireOwner`) — the proxy alone is never trusted. Without a hash configured, only localhost is served. Login attempts
are limited to 5/min per IP. Neon Auth (Managed Better Auth) is the upgrade path if more users are ever needed.

## ADR-024 Persistence: Drizzle on Neon, bytes in the private bucket (phase 5)
Drizzle ORM (`drizzle-orm/neon-http`) with schema `src/lib/server/db/schema.ts`; migrations in `drizzle/`, generated by
drizzle-kit and applied **first to the `dev` branch** (`npm run db:migrate:dev`), then production (`db:migrate:prod`).
Tables: projects, source_files, reference_styles, document_versions, operations, render_jobs, output_artifacts, workers
(owner = env config). Files never pass through Vercel functions: the server issues a 10-minute signed PUT, the browser
uploads directly (bucket CORS verified), then `confirm` checks size and magic bytes and deletes impostors. Reads use
signed GETs. Project edits use optimistic locking on `updated_at` (stale writes → 409 "Changed elsewhere"); the studio
serialises its own writes. Versions are immutable files; applying after undo deletes the redo branch (rows + objects).
Limits: 50 projects, 60 files/project, 25 MB/file; nothing expires automatically. Integration tests and E2E run on the
`dev` branch (`.env.test.local`), never on production; `npm run db:clean-dev` removes their data.

## ADR-025 Job queue on Neon (phase 5)
Same protocol as phase 4, now durable: claim is one `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` so concurrent
workers never share a job; expired leases are reaped in SQL (re-queued until `max_attempts`, then failed); inputs and
artifacts live under `jobs/<id>/` in the bucket with SHA-256 verification; artifact reads redirect to signed URLs;
worker liveness in `workers`. Retry decisions are pure functions (`afterLostLease`, `afterFailure`) unit-tested.

## ADR-026 Request hardening (phase 5)
Separate rate-limit budgets (AI 20/min, sign-in 30/min + 5 attempts/min, app traffic 600/min — one shared budget had
starved autosave). Every Groq route is owner-only. Security headers on all responses: CSP (self + jsDelivr for Tesseract
+ `*.neon.tech` for signed URLs, `wasm-unsafe-eval`, `frame-ancestors 'none'`), nosniff, DENY framing, strict referrer,
Permissions-Policy, HSTS, `X-Robots-Tag: noindex`. `'unsafe-inline'` remains for scripts because Next inlines its
bootstrap without nonces (ponytail: nonce-based CSP if the app ever renders untrusted HTML).

## ADR-027 Public accounts with a free tier (2026-11-02, owner request)
Owner asked for anyone to sign up by email, with the owner's address unlimited and everyone else limited to 3
generations, then paused. Neon Auth (managed Better Auth in the same Neon project — no new provider) replaces the
single-owner scrypt password: email + password, sign-up confirmed with an emailed 6-digit code on production (shared
Neon SMTP; custom SMTP is the production upgrade), password reset by code. Owner = **verified** account whose email is
`OWNER_EMAIL` (an unverified sign-up with that address gets nothing extra). `projects.user_id` / `render_jobs.user_id`
scope every query; another user's id behaves as "not found"; legacy rows (NULL) belong to the owner. A "generation" is a
handwriting job (queued/running/succeeded; failed and cancelled are free) or a successful AI edit plan
(`usage_events`); vision transcription and manual edits are free. ponytail: quota is check-then-insert (a simultaneous
double request can pass the last slot).

## ADR-028 Cloud GPU on Modal, started per job (2026-11-02, owner request)
Users must not run commands or install anything. Vercel has no GPUs; Modal runs the existing worker unchanged
(`modal_app.py`): POST `/api/jobs` queues the job and calls a Modal web endpoint (`GPU_TRIGGER_URL`, bearer
`WORKER_TOKEN`) that spawns a GPU function; it loads the models and drains the queue through the same outbound worker
API, then exits (scale to zero). Weights are downloaded from Hugging Face during the image build. Missed triggers are
covered by `nudgeGpu` (a job still queued after 2 min re-triggers, at most once per 2 min, using `updated_at` as the
marker). L4 GPU, `max_containers=3`. Rejected: Hugging Face ZeroGPU (PRO plan, per-call time caps would need chunking),
RunPod (Docker image build/push). The local worker still works for development.

## ADR-029 Characters outside the model's charset (2026-11-02, owner request)
DiffusionPen only writes the 80 IAM characters, so an assignment with `% @ £ © ° ™ { }` failed. Words are split into
model-writable runs and other characters; the runs are generated as before, the others are drawn from Caveat (OFL
handwriting font) or DejaVu Sans (Greek/maths) at the computed x-height, inked in the pen colour and baseline-joined into
one word image. They are not in the writer's style, so the manifest lists them (`font_drawn`) and the studio says so.
Only characters no bundled font has (e.g. CJK) are refused. Progress: the worker heartbeat (every 4 s) carries
`{stage, done, total, percent, eta}`, stored in `render_jobs.progress` and drawn as a progress bar.

## ADR-030 Free cloud GPU on Kaggle (2026-11-02, owner request: no card, no quality loss)
Modal refused every GPU without a payment method. Researched no-card options that run the same model at full settings:
Colab (terms forbid web-service backends and workers), Hugging Face ZeroGPU (PRO plan to host), HF compute Spaces
(reportedly paid now), Lightning AI (no documented programmatic start), in-browser WebGPU (same weights but far too slow
on phones), glyph/font renderers (fast but weaker on joined handwriting). Chosen: **Kaggle** — free T4 GPU (~30 h/week,
phone verification, no card) started through its public API (`kernels.KernelsApiService/SaveKernel`) as a private
script that clones this public repo, downloads the weights from Hugging Face and runs `worker.py --drain --idle 300`.
Same DiffusionPen weights, 50 steps, best-of-N word check: quality unchanged. The script holds only a 10-hour
HMAC-signed worker token (`ephemeralToken`), never `WORKER_TOKEN`. No new run is started while one is queued/running or
while a worker (e.g. the owner's PC) is polling. Jobs no GPU claims within 60 minutes fail with a clear message.
Risks: Kaggle's terms do not explicitly cover use as a website backend; start-up takes ~3–5 minutes; one run at a time
works jobs sequentially (ponytail: second account or Modal when concurrency matters).

## ADR-031 Precision pass: rewrite doubtful words, digits from the font (2026-11-02, owner priority)
Measured on the real model (69-word lab report, same seed, RTX 5050): best-of-3 alone left 38/69 words read back
exactly (CER 24.5 %); digits were often wrong ("47"→"(-7", "46.8"→"H6 B") and decimal points dropped. Now:
1. Words whose best sample is read back wrong are written again with fresh seeds, up to 3 rounds × 4 samples, keeping
   the best reading → 50/69 exact, CER 12.2 % (time 36 s → 89 s). The checker (TrOCR-small) also selects, so these
   numbers are an upper bound; pages were reviewed by eye as well.
2. Digits are always drawn from the handwriting font: exact by construction and consistent on the page. A "best
   of the model's tries, else font" rule was tried first and rejected: mixed model/font numbers looked inconsistent,
   and the checker passed a doubtful "0.17". Letters stay generated in the writer's style.
Remaining limit: long or rare words can still be misspelt by the model; the studio lists them (Doubtful) and
"regenerate line" retries them.

## ADR-032 Speed without quality loss (2026-11-02, owner request)
Measured where a job's time goes: generation ~90 %, word check ~10 % (more with the rewrite pass). Changes, each
checked with the same seeds before adopting:
- DPM-Solver++ (multistep) 20 steps instead of DDIM 50: 2.2x faster, mean pixel difference 1.7/255, read-back
  39 vs 37 of 96 exact, side-by-side identical by eye.
- fp16 autocast for the UNet: 0.8/255 difference, no accuracy change (big gain on T4s, small on RTX 50).
- Batch 32 (+12 %), and one model replica per GPU (Kaggle's "NvidiaTeslaT4" machine has two T4s).
- TrOCR stays fp32 (fp16 changed 9/400 readings) but is split across GPUs (identical readings; small gain — CPU-side
  preprocessing dominates).
Result: 69-word lab report 89 s → 44.5 s locally (53/69 exact vs 50); 1,420-word, 5-page assignment on Kaggle in
8.5 min total (≈45–60 min estimated before), 1,103/1,370 handwritten words exact, CER 7.1 %.
Rejected for quality reasons: fewer samples per word, reusing samples for repeated words, Gemini-style image models
(cannot clone a writer's style; Gemini is excluded by the project rules; Groq has no image model).
Candidates to evaluate later on real handwriting (released weights): Eruku (Apache-2.0, line-level, built for text
fidelity), VATr++ (MIT, GAN, single pass — very fast), DiffBrush (ICCV 2025, line-level), One-DM (ECCV 2024).

## ADR-033 Content from scans: AI reading, garble guard, clear roles, handwritten tables (2026-11-02, owner bug report)
Report: two PDFs in Handwriting Clone produced unreadable pages of the *other* PDF's content with no table. Causes:
(1) the first card ("Source to edit") is the content and the second the handwriting — easy to swap by mistake;
(2) the content of a handwritten table scan came from local Tesseract OCR, which produced debris ("| | ] ;"), and
nothing stopped it from being generated; (3) tables were written as run-on lines.
Fixes: cards renamed "Content — text to write" / "Handwriting — style only", a Swap button, and a line above
Generate ("Writes the text of A in the handwriting of B"); scans are read with Groq vision by default once the user
consents (remembered per device), with a prompt that keeps tables as "cell | cell" rows, drops scanner watermarks and
form labels, does not complete cut-off words, and hints the column header to continuation pages; a garble score warns
before confirming nonsense; the worker lays tables out as ruled grids with wrapped cells (rows kept on one page when
they fit). Word sizing: the letter-class rule now clamps outliers by the measured lowercase body (words with 4+
lowercase letters, 0.75–1.5x) — full re-measurement was tried and rejected (noisy, words grew into the next line).
Measured on the owner's file (Uhv IA-1 page 1 in its own handwriting): 100/110 words read back exactly, no overlaps.
Known limit: style crops taken from a table page are small and noisy, so style fidelity is weaker there.

## ADR-034 Model comparison on the owner's handwriting (2026-11-02)
Same 5 lines, same style (3 clean lines cut from the owner's Uhv IA-1 scan), one sample each, RTX 5050, read back
with TrOCR-small (sheet: scratchpad model-comparison.png; script: compare_models.py).
| Model | Time (5 lines) | CER | Exact lines | Notes |
|---|---|---|---|---|
| DiffusionPen (current) | 33.7 s | 31.2 % | 2/5 | uneven size, several garbled words |
| Eruku (Apache-2.0) | 295 s | failed | 0/5 | copied the style image's ruled lines; 3 lines blank; no KV cache |
| VATr++ (MIT code, IAM-trained weights) | 0.1 s | 1.8 % | 4/5 | legible, even, closest to the writer's round print |
Both newer models need loading workarounds on transformers 5 (built from their own code; weights loaded directly).
Decision pending owner approval: make VATr++ the default engine (per word, so tables/rewrites/layout stay), keep
DiffusionPen as an option; remaining work: transparent word backgrounds (VATr++ patches are light grey) and
resolution (32 px tall).

## ADR-035 VATr++ is the default engine (2026-11-02, owner approved)
`hw/vatr.py` wraps the upstream VATr++ package (downloaded to models/vatrpp; built directly because transformers 5
cannot from_pretrained() it). Same generator interface, so layout, tables, digits-from-font, the word check and
rewrites are unchanged. Findings while integrating:
- Its noise option gives variety but costs accuracy (37 vs 48 of 54 words exact), so noise is off and candidates
  differ by the order of the 15 style samples (8 orders; 100 % distinct images, accuracy unchanged).
- Style uses 15 crops from the reference (it was trained with 15).
- The word check is now case-insensitive: TrOCR reads clearly drawn capitals as lowercase, which triggered useless
  rewrites.
- Grey sample backgrounds are normalised to the paper tone before inking.
Measured: Uhv page 1 table in its own handwriting 106/110 exact (DiffusionPen 100/110), 30 s vs 52 s; 69-word lab
report 68/69 exact, CER 1.5 %, 7 s (DiffusionPen 53/69, 10.3 %, 44.5 s). DiffusionPen stays available with
HW_ENGINE=diffusionpen. Weights: MIT code, trained on IAM (non-commercial research data), like DiffusionPen.

## ADR-036 Export saves what the mode produces (2026-11-02, owner bug report)
Report: after changing the name and PRN, Export returned the original scan. Export always saved the uploaded source
(or its latest applied edit), but in Convert / Handwriting Clone the edits live in the text that is handwritten and
the result is the generated pages. Now: in those modes Export saves the generated pages (PDF, PNG/JPEG at the chosen
DPI; TXT/MD = the written text; DOCX refused), is disabled until something is generated, and is blocked when the text
changed after the last generation ("generate again"). In Edit/Digital modes, exporting with no applied change says it
is the ORIGINAL and points handwritten scans to Convert Handwriting (find & replace needs readable text positions,
which the local OCR cannot give for handwriting).
