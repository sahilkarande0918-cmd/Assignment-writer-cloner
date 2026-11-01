# MASTER PROMPT — Assignment Writer & Cloner

You are Claude Code acting as principal full-stack engineer, document-processing specialist, ML engineer, product designer, and quality engineer. Implement the full application, not a demo or just a landing page.

## Mission and repository

Repository: https://github.com/sahilkarande0918-cmd/Assignment-writer-cloner.git

Build a polished, private-use web platform that can import assignments/documents, edit their text and layout, learn a handwriting STYLE from authorized references, generate entirely new text in that style on reconstructed notebook pages, preserve digital-document fonts whenever technically possible, preview results, and export useful formats. Build exactly **FIVE sequential phases**. At the end of **EACH** phase: complete tests, update recovery documentation, **git commit and git push** to the existing repository; verify the pushed commit SHA. Do not combine phases into a single mega-commit. Do not claim a successful push if it failed.

**Non-negotiable provider restrictions:** Use **Groq**, NOT Gemini, for AI instruction interpretation and optional vision. Do not integrate Gemini, Google AI Studio, Supabase or Cloudflare. Frontend and serverless API: Vercel. Persistent data: Neon Postgres; use Neon Object Storage where available, within current plan limits. Use a local Python GPU worker for handwriting inference; optional alternative GPU provider only when documented as a paid/opt-in extension. Keep essential features usable without the worker, with honest status indicators.

**Ponytail is mandatory:** https://github.com/DietrichGebert/ponytail . In Claude Code install with two separate interactive commands: `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail`. Activate its engineering/review workflow, read its documentation, and run its review workflow before phase checkpoints if available. Ponytail is an agent engineering plugin, **not** a visual animation or design system. If plugin installation is blocked, read its official SKILL.md/AGENTS.md, record the limitation, and follow its minimal-code/testing principles. Do not install unverified forks.

**Git identity restriction:** NEVER add Claude, Anthropic, an assistant, a bot, or any AI account as a contributor, co-author, commit author, owner, collaborator, or contributor metadata. Do NOT add `Co-authored-by: Claude` or any generated-by footer in commits/PRs/README/package metadata. Do NOT alter existing Git user.name/user.email or forge another person's identity; use the repository's already configured human Git identity. If identity is missing, report the blocker rather than inventing one. `CLAUDE.md` may exist as a recovery/instruction document but it is not contributor attribution. Never add GitHub Actions that produce bot authorship without a real need.

## Reality checks — design for the actual capabilities

- No system guarantees 100% identical handwriting from arbitrary reference documents. Build best-achievable style similarity with preview, confidence information, and manual corrections; never claim exactness in UI/docs.
- A reference photograph/PDF provides handwriting appearance, not automatically the writer's exact pen dynamics, full alphabet, punctuation, language coverage, or a font file.
- Differentiate **digital native PDF/DOCX vector-text editing** (can often preserve font/position) from **scanned document/photo reconstruction** (requires OCR + region repair and may never be lossless).
- For scanned edits, don't draw opaque boxes over lines or tables, and don't erase borders. Segment text vs background vs line art; reconstruct the underlying paper first and render new content once, on a clean composition layer. Keep source immutable.
- Local GPU inference from Vercel cannot simply call localhost on the user's computer. Implement an **outbound polling job worker**: Vercel stores jobs in Neon and input files in private object storage; running local worker polls authorized jobs over HTTPS, downloads input, computes output, uploads artifacts, updates status. No inbound home-router ports/tunnel required. Worker offline => queued with clear explanation; don't claim cloud 24/7 generation.
- Keep model training OPTIONAL. Start with pretrained style-conditioned inference; benchmark reference styles and character error rate first. Public dataset training does not automatically improve similarity to one particular writer.
- Support authorized handwriting references; do not implement signature/identity-document impersonation. Store a provenance flag in the project manifest for generated handwriting.

## Product modes and exact interaction model

1. **Edit Assignment**: left upload card for original handwritten or digital assignment, adjacent upload card for OPTIONAL reference handwriting/paper style, unified natural-language instruction field; examples: replace a name/PRN, update a paragraph, add a section, fix spelling, modify title/table while preserving rest. Choose a selected region or whole document, review an operation plan, then Apply. Keep original file and editable version snapshots.
2. **Handwriting Clone / New Assignment**: reference handwriting upload (PDF/image), optional paper-page reference (auto-extract from same PDF), large content editor/instruction box, `Text → Assignment` toggle (ON creates an entirely new document; OFF edits an uploaded source). Style extractor must use lettering only for writer style and background only for sheet layout; never copy semantic content from reference by default. Choose page style, margins, line spacing, pen color, sizes and alignment. Auto-compose multi-page documents without clipping or overlaps.
3. **Digital Document Studio**: upload machine-typed PDFs, DOCX and supported docs; edit through the same prompt box while preserving existing fonts, tables, page geometry, headers/footers, images, margins and other content whenever possible. Show exact-match / substituted-font warnings.
4. **My Library**: save/reopen/rename/duplicate/delete/download **at least 10** complete assignment projects including source, reference, edit history, snapshots and outputs. No expiration-based auto-delete for saved projects; explicitly communicate quota limits. Search and filter.
5. **Output**: PDF (primary), PNG/JPEG (per-page or ZIP for multipage), DOCX when meaningful (font/layout best effort, not a promise of fidelity), TXT/Markdown for textual extraction, print-ready A4/Letter. User chooses format, image DPI, page size; no broken conversion buttons.

## Groq — only AI API provider

Official docs: https://console.groq.com/docs/models , https://console.groq.com/docs/structured-outputs , https://console.groq.com/docs/vision . Obtain the private `GROQ_API_KEY` from https://console.groq.com/keys . No hardcoded API keys, no NEXT_PUBLIC_ prefix on secrets.

Default production text/planning model: `openai/gpt-oss-20b` (structured output strict mode where supported). Optional high-accuracy fallback: `openai/gpt-oss-120b`; optional multimodal/visual OCR cross-check: `qwen/qwen3.8-27b`, only when supported/available. Since Groq model support and rate limits change, validate model availability with the models API at setup and allow environment overrides. No Gemini SDK, key, endpoint or feature flags anywhere.

Groq MUST return a strictly validated **edit operation plan**, NEVER executable code or direct unreviewed PDF instructions. Use the Groq SDK server-side and a Zod/json-schema contract with operations such as replace_text, insert_text, delete_text, reflow_paragraph, update_table_cell, update_metadata, change_style, new_document. Each operation must identify target page, region/span anchor or text match, expected original content, new content, constraints, confidence, and a warning if ambiguous. Avoid ambiguous global replacements without preview. Use optimistic locking/version IDs and reject mismatched targets. Validate all output with Zod; use JSON-schema strict where model supports it. Show plan/diff and allow Undo/Redo. Deterministic matching/execution comes from PDF/DOCX engines, not language model guesswork. Retry 429 with capped exponential backoff; enforce timeouts, rate limiting and safe error messages. Prompt-injection defenses: uploaded documents are untrusted data, never trusted system instructions.

Default OCR pipeline: embedded text detection first; PDF.js/pdfplumber/PyMuPDF for text PDFs; for scans use OCR via Tesseract or PaddleOCR/Docling where available. Use Groq vision selectively on ambiguous cropped page images; check privacy before transmitting uploaded content. Never confuse vision interpretation with byte-exact source formatting. Store the source bounding-box map.

## Handwriting ML strategy

Research and integrate, subject to actual compatibility/license checks:
- https://github.com/peterzat/reforge — principal reference-to-writing pipeline built on DiffusionPen, with preprocessing and page composition.
- https://github.com/koninik/DiffusionPen — underlying official PyTorch model and released weights. Verify model-weight terms, dataset usage rights and required dependencies.
- https://github.com/awei669/DiffInk — benchmark/research alternative for online pen trajectories; only integrate if reproducible with available weights and resources.
- https://github.com/jingyaogong/minimind — evaluate and explicitly document that this is for small-language-model training, NOT a direct handwriting image generator; do not train it for this product.
- Research IAM (English handwriting), CVL, RIMES (French), Bentham / other relevant datasets; check access/consent/redistribution licenses. Do not automatically download datasets without checking use rights and actual need.

Implement `workers/handwriting` as a separate Python 3.11+ service with a versioned contract. Accept normalized content, an authorized handwriting reference image or set of crops, paper template, margins, line guides, fonts/color presets, and quality parameters. Use the Reforge path as the first production target after hardware compatibility tests. Support batched output, configurable generation seed, word/line spacing, page breaks, OCR-backcheck for spelling/omissions, basic rejection/regeneration of bad lines, and manual replace-line action. Test 8 GB VRAM compatibility with mixed precision and memory-conscious inference; if OOM, degrade gracefully, log requirements and offer CPU/demo limitations rather than pretending success. Do not commit model weights or huge datasets to Git.

Paper reconstruction: detect page dimensions, perspective, grid/ruled lines, red margin lines, punch holes, shadows, subtle paper texture; separate ink from paper using image segmentation/classic CV; use high-quality inpainting where needed; reconstruct a clean, reusable paper template rather than copy text from source. If extraction is poor, offer a manually selectable blank ruled-paper approximation, clearly labeled not an exact match. Render handwriting on transparent layers and composite once over template; ensure text respects ruled baselines, left margin, headings, figures and tables. Clear overflows automatically on new pages. Provide paper-only, ink-only and composite previews.

## Documents / exact-preservation pipeline

- Backend tooling when needed: PyMuPDF for PDF inspection/edit/redaction/coordinates; Pillow/OpenCV for raster masks and reconstruction; python-docx for DOCX structure; Docling for extraction/layout when needed; LibreOffice headless in Python worker for optional DOC/DOCX/PPTX conversions; fontTools to identify/subset fonts with correct embedding rights.
- Browser tooling: PDF.js for accurate PDF preview/text selection; pdf-lib only for compatible lightweight PDF manipulations; canvas/Konva or Fabric for interactive bounding regions, annotations and placement; dnd-kit for page ordering; libraries selected for real maintenance and licenses.
- For PDFs with embedded fonts preserve non-edited elements byte-for-byte whenever feasible and use original font resource or compatible licensed substitute for edits. If font cannot be embedded/extracted legally, flag the substitution. Prevent inadvertent loss of black table strokes, line art, underlines, page numbers and cell borders. For raster originals, preserve page background and recompose only intentional edit regions; visual diff before approval.
- For DOCX, prefer editing XML runs/styles to preserve typography, section breaks, headers, footers, images and table cells. Round-trip check. PDF export from office formats may differ from native MS Office and must be labeled accordingly.
- Never advertise 'any format' while silently failing. Supported input matrix: PDF, DOCX, PNG, JPG/JPEG, WEBP, TXT, MD; optional HTML/RTF/ODT via documented converter; legacy DOC only if LibreOffice installed. Reject unknown, encrypted or corrupt files with useful messages. Explicit file size/page count limits based on provider and resources.

## Frontend visual direction

Design inspiration: https://www.squarespace.com/ for cinematic premium minimalism and the overall design feeling, NOT copied assets/branding/layout source code. Dominant white / warm ivory, editorial black/charcoal typography, warm neutral grays, muted bronze/taupe accent, generous whitespace, oversized elegant headings, thin separators and disciplined grids. No generic purple-blue AI gradients, blobs or fake glass dashboard overload. Make typography exceptional and functional UI accessible.

Tech: Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui + Radix + Motion (Framer Motion successor or compatible) + GSAP ScrollTrigger where genuinely useful + Lenis only if no accessibility issues + Three.js/react-three-fiber for lightweight 3D hero + Magic UI for selective premium motion. `https://github.com/unovue/inspira-ui` is Vue/Nuxt and is NOT directly React-compatible; do NOT install Vue inside Next.js. Borrow visual inspiration only if compliant with licensing, prefer `https://github.com/magicuidesign/magicui` React components. Prefer CSS animations for low-power devices. Reduce motion automatically when requested. Hero with optimized, licensed local background footage (download only legal, approved footage; no hotlinked Squarespace content) and graceful static fallback. Video should load only as needed and not undermine performance.

Landing: cinematic hero with clear product pitch; workflow teaser showing before/after page; feature storytelling and subtle scroll depth effects; CTA opens workspace. Workspace: top navigation, left file input/reference cards, main split-document canvas and revisions, right slim settings sidebar or collapsible inspector, bottom anchored instruction composer. Show action feedback, multi-page thumbnails, diff toggle, page zoom, thumbnails, progress, undo/redo, project naming, autosave and export. Make the upload cards obvious and easy, not buried under effects. Library: gallery of recent assignments and statuses. Responsive desktop/tablet/mobile; actual editor usable on small screens. WCAG-focused interaction: keyboard access, accessible focus rings, reduced motion and screen reader labels.

## Backend, storage, job system, security

Yes, this project NEEDS a backend for private Groq requests, stored files and persistent jobs, but a large always-on backend is NOT required for normal document features. Use Next.js server route handlers/server actions on Vercel for authentication, Groq, metadata and signed file operations; a separate optional Python local GPU worker handles heavy handwriting image generation. Do not run PyTorch/LibreOffice/PyMuPDF heavy compute inside Vercel serverless runtime.

Data: Neon Postgres via Drizzle ORM (or Prisma if justified), `DATABASE_URL` server-only. Prefer private Neon Object Storage (S3-compatible) for binary inputs/outputs if available and pricing is acceptable; verify current plan quotas before binding to features. Otherwise use a documented pluggable S3-compatible store that does NOT require Supabase or Cloudflare and supports a realistic free tier; if unavailable, browser-local IndexedDB for the first 10 saved projects with explicit 'local only' status. Never store uploaded PDFs as huge base64 strings in Postgres. Minimum tables: user/account or single-owner configuration, projects, source_files, reference_styles, document_versions, operations, render_jobs, output_artifacts; migrate and test. Saved projects count at least 10 and survive browser reload/normal redeploy if Neon configured. Authorize every read/write; private object permissions, signed expiring URLs, encryption in transit, filename sanitization, limits, MIME/signature checks, no executable uploads; protect against cross-site requests and public indexing. Optional single-user authentication with a standard auth package; no hardcoded admin password in source. Generated files have delete action and privacy controls.

Worker job protocol: status queued, running, succeeded, failed/cancelled; lease/heartbeat, retry budget, output artifact checksums, idempotency keys, owner binding and error visibility. Local worker polls a secured HTTPS job endpoint or uses a backend queue with outbound-only network access; avoid directly granting unlimited DB credentials to a distributed public client. Worker runs only when owner's computer is on; UI can still edit digital documents and save drafts without it. Supply Windows/PowerShell setup (including CUDA compatibility check) and .env.example; optional Dockerfile where suitable. No fake progress.

## Required repository structure / long-context survival

Create at project ROOT and keep updated:
- `master_prompt.md`: copy this FULL master prompt verbatim, never lose requirements.
- `CLAUDE.md`: concise operational commands, architecture rules, current phase, handoff/read-first instructions, and the no-AI-contributor rule.
- `AGENTS.md`: concise agent-independent conventions, without copying third-party licensed text unnecessarily.
- `docs/PROJECT_STATUS.md`: phase checklist, completed/remaining functionality, blockers, last verified pushed SHA, next action.
- `docs/ARCHITECTURE.md`: frontend/backend/worker/DB/file/job diagrams and boundaries.
- `docs/DECISIONS.md`: ADR-style reasons for tech choices, constraints and alternatives, including why MiniMind isn't appropriate.
- `docs/TEST_MATRIX.md`: supported file-format matrix, required QA fixtures and actual pass/fail results, not invented results.
- `docs/RESEARCH.md`: current repo/model/dataset references, checkpoints, dependencies, licenses and verified claims.
- `docs/HANDOFF.md`: detailed resume instructions, changes since previous phase, required env, git status, open issues.
- `.env.example`, `.gitignore`, `README.md`, `package.json`, source directories, Python worker dependency lock, test fixtures (synthetic or authorized only), DB migrations and scripts.

Before any implementation session: read `master_prompt.md`, `CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, and `git log -5 --oneline`, then `git status`, then continue from the latest *verified pushed* phase without starting over. Before context compaction, update all these files, write exact file paths and command outputs, document blockers, and commit if appropriate. If a phase is partially complete, preserve work, do not invent its completion and do not skip its final checkpoint.

## Execution: EXACTLY FIVE PHASES

### PHASE 1 — Foundation, design system, complete dashboard shell
- Inspect current repository, branch, current git identity, package setup and remote. Do not replace existing code without checking.
- Create Next.js/TypeScript app, palette, spacing/type tokens, animation primitives, design system, cinematic landing and fully navigable dashboard shell: uploader cards, separate handwriting reference, `Text → Assignment` toggle, prompt composer, format selector, editor split view, library, previews, responsive states.
- Install and use Ponytail per approved method. Set up testing/build/lint, reduced-motion and basic a11y testing. Create all recovery docs, `master_prompt.md` verbatim and `.env.example` without secrets.
- No fake AI processing: label not-yet-built functions or disable them clearly until subsequent phases.
- Acceptance: app builds, key screens route and resize, UI screenshot review at desktop/mobile, no console errors, all controls purposeful (or clearly pending), tests and lint pass.
- Checkpoint: update docs, run tests and `/ponytail-review` if available, `git add`, `git commit -m "feat(phase-1): build foundation and premium workspace"`, `git push origin <current-branch>`, verify SHA with `git ls-remote` or equivalent. Record SHA and next phase.

### PHASE 2 — Secure imports, structural analysis, Groq instruction engine
- Implement upload, validation, page previews, PDF/DOCX/image/TXT/MD processing as appropriate, extracted text and geometry, OCR adapter, handwritten-vs-digital detection and reference isolation. Preserve immutable originals and metadata.
- Integrate only Groq with `GROQ_API_KEY`: server-side model config, JSON schema/Zod editing plan, target resolution, vision fallback for selected images, retries and graceful API failure; privacy confirmation if sending content. Build change-plan/diff UI. Support direct text edits without API via manual operation fallback.
- Acceptance: PDF/DOCX/photo imports and render correct previews, Groq never receives or exposes secret in browser, ten realistic edit commands produce valid operation plans or explicit clarification, prompt injection and upload security tests pass. No editing yet required beyond preview plan.
- Checkpoint: tests + docs + review, commit `feat(phase-2): implement document intake and Groq edit planning`, push, verify SHA, record.

### PHASE 3 — Production-grade DIGITAL editing and deterministic export
- Implement machine-typed PDF/DOCX editing with search/replace, selected region edit, text insertion/deletion, multi-page reflow as appropriate, table-cell edits, coordinates, font-matching, original-vs-edited diff, undos, version snapshots. Use dedicated, tested deterministic renderers; handle borders/lines/vector paths conservatively.
- Implement base PDF/PNG/JPEG exports and meaningful DOCX conversion when possible; distinguish native edit from reconstruction. Show warnings when exact source font or layout cannot be retained. Add scanned document edit path using background inpainting and careful region placement, WITHOUT treating it as exact-edit capable.
- Acceptance: test fixtures for editable PDFs and DOCX demonstrate unchanged page areas, visible rules/table borders, font match where embedded/available, selectable text where appropriate, no clipping, all pages present; visual regression images and edit-plan integration tests. Report any limitations. No claim of perfect PDF preservation.
- Checkpoint: tests + docs + review, commit `feat(phase-3): add layout-aware digital editor and exports`, push, verify SHA, record.

### PHASE 4 — Handwriting cloning model, reference paper and new assignments
- Research and test Reforge and DiffusionPen weights on available GPU, assess license and dependency compatibility. Implement Python worker, model adapter, style sample extraction, reference PDF background/ink separation, clean paper template reconstruction and user-adjustable layout settings.
- Implement `Text → Assignment` end-to-end, with content entered in editor, optional Groq-only planning, handwritten text generation, page splitting, line spacing/baseline alignment, pen color and page appearance matching, multi-page composition, OCR-backcheck, manual bad-line regeneration, queue status and output previews. Do NOT copy original reference text.
- Add clear fallback if model lacks script coverage, no weights are accessible, 8 GB VRAM is insufficient, CUDA fails, or the worker is offline; never substitute a generic font silently and call it a clone. Optional training/finetuning recipe behind experimental documentation only after establishing a test baseline.
- Acceptance: authorized samples generate new English content in the requested style, paper-only template does not preserve original writing, no crossovers/overlaps/missing lines, original text not copied, multipage output has no clipped words, output OCR text tested vs input. Record measured quality and machine/inference requirements; distinguish live model results from simulated fixture tests.
- Checkpoint: tests + docs + review, commit `feat(phase-4): integrate reference handwriting generation`, push, verify SHA, record.

### PHASE 5 — Persistent library, hardened job workflow, polish and deployment
- Integrate Neon Postgres migrations + private Neon Object Storage or documented safe fallback, saved projects/revisions/assets at least 10, rename/duplicate/delete/search, recovery after reload, autosave, status history, retries, gallery and cleanup.
- Finish outbound-only local GPU polling job system, signed files, single-user auth, security controls and concurrency. Wire EVERY functional UI button; eliminate fake data and placeholder toasts. Implement downloadable PDF, PNG/JPG ZIP, and DOCX/TXT/MD where supported; visual diffs and export validation.
- Audit performance, bundle size, accessibility, mobile, keyboard, video fallback, no motion preference, secrets, cost controls, rate limit, errors, power outage and worker-offline behavior. Configure Vercel environment without leaking credentials, deploy only after verifying correct account/project and credentials; record actual URL only after successful deployment.
- Acceptance: smoke test import → plan → edit OR generate → preview → save → reload → export on representative handwritten/digital files; 10 projects persist, tests and CI pass, no text overlays or lost ruled lines on verified fixtures, no broken controls; full limitations and operating instructions documented.
- Checkpoint: tests + docs + review, commit `feat(phase-5): ship persistent assignment studio`, push, verify SHA, record. Then final audit and concise status report listing what works, what is blocked, deployment URL if real, and exact commands for local GPU worker.

## Required automated and visual QA

Use Vitest/unit tests for parsers, operation planning/Zod validation, queue state, document coordinates, page splitting; Playwright E2E for uploads, toggle logic, editing, persistence and exports; visual snapshots for desktop/mobile pages; representative test fixtures with visible paper lines, table borders, embedded-font PDFs, scanned handwriting, multiple pages and a DOCX. Visual compare unchanged regions by aligned difference masks, not by optimistic mock screenshots. For handwriting validate recognized output text against submitted text and report CER/word misses where measurable. Check for clipped glyphs and elements outside page bounds programmatically. Sample exports must reopen using independent PDF/image/DOCX readers. Never mark a test passed unless executed.

## Secrets and developer setup

Required for AI operations: `GROQ_API_KEY` (server only). Optional `GROQ_MODEL=openai/gpt-oss-20b`, `GROQ_REASONING_MODEL=openai/gpt-oss-120b`, `GROQ_VISION_MODEL=qwen/qwen3.8-27b`; verify availability. Required for cloud persistence: Neon `DATABASE_URL` and configured storage credentials according to its current SDK docs. Required for local GPU worker: a restricted worker token, API/job endpoint base URL, optional model cache path; PyTorch/CUDA dependencies only in worker environment. No AI API key needed to run pretrained handwriting model locally. Add clear `.env.example` placeholders and step-by-step installation.

## Execution expectations

Start implementing immediately in this existing repo. Don't spend the whole task only outlining architecture. Before external downloads verify licenses and security. Prioritize functional output over decorative complexity, but the final design must be polished. Do not ask repetitive questions if a reasonable default exists. Stop at the end of each phase only after committing/pushing and recording its verified SHA; then continue the next phase unless blocked by actual credentials, permissions, hardware, weights or lack of tool access. If blocked, record truthful blockers, keep the rest running with honest limitations and continue all independent work.

Final message after Phase 5: phases and **actual** pushed SHAs; real test results; implemented vs not implemented; local and production setup commands; Groq/Neon env variable names; handwriting model quality/hardware limitations; deployment URL if and only if verified; and an explicit statement that no AI contributor was added.
