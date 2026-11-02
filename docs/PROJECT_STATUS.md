# Project status

> Full recovery snapshot: `docs/CONTEXT_SNAPSHOT.md` (state, versions, env names, ML results, schema, restart commands).

| Phase | Scope | State | Pushed SHA |
|---|---|---|---|
| 1 | Foundation, design system, dashboard shell | ✅ complete | `1b18c16` (verified via ls-remote) |
| 2 | Secure imports, structural analysis, Groq planning | ✅ complete | `33b9218` (verified via ls-remote) |
| 3 | Digital editing + deterministic export | ✅ complete | `cdb70dd` (verified via ls-remote) |
| 4 | Handwriting worker, paper reconstruction, new assignments | ✅ complete | `6f412e4` (verified via ls-remote) |
| 5 | Persistence, jobs, polish, deployment | ✅ complete — deployed | `9d9b9d8` (verified via ls-remote) |

## Owner-added requirement (2026-11-01)
**Convert Handwriting** mode — keep assignment 1's content, write it in assignment 2's handwriting (ADR-009). Phase 1: mode + inputs. Phase 2: OCR transcript, Groq-vision transcript improvement (with consent), mandatory "I have checked this transcript". Phase 4: generation + OCR back-check.

## Phase 1 — done
Next.js 16 app, design tokens, landing (lazy WebGL hero + static fallback, before/after, six-mode story, honest limits), studio shell (4 modes, upload cards with signature validation, Text → Assignment toggle, paper preview, inspector, composer, export dialog), library shell, Vitest + Playwright + axe.

## Phase 2 — done
- **Intake** (browser): PDF via PDF.js 6 (page previews, text lines with geometry, font names + embedded flags, encrypted/corrupt rejection, 60-page cap); DOCX via JSZip XML (paragraph + table-cell spans with stable ids, tracked deletions skipped, encrypted/macro/non-Word rejected) with docx-preview rendering; PNG/JPEG/WEBP and scanned PDFs via local Tesseract OCR with line boxes + confidence; TXT/MD. Originals are never modified.
- **Analysis**: digital vs scanned detection (text density), handwriting-likely heuristic from OCR confidence (labelled heuristic), non-embedded font warnings.
- **Groq engine** (server only): `/api/plan` (Zod contract, strict JSON-schema mode with JSON-mode fallback, retry on `gpt-oss-120b` if output invalid, SDK backoff on 429, 45 s timeout, safe errors), `/api/transcribe` (vision, explicit consent, size-capped), `/api/groq/status` (models API check). Same-origin + body-size + rate-limit guard.
- **Deterministic target resolution**: every op must quote real text; unique/ambiguous/unresolved/invalid statuses; table cells by coordinates; version id marks stale plans.
- **UI**: page thumbnails + navigation, zoom, span overlays (selection + plan targets), extracted text panel with region selection, plan/diff panel (include/exclude, choose occurrence), manual find & replace without AI, Groq consent toggle, AI status badge, Convert transcript editor.

## Phase 3 — done
- **Native PDF edits** (MuPDF WASM, browser): text-only redaction of the changed glyphs (vector rules, table borders, underlines and images kept), redraw at the original baseline with the original embedded font when it has every glyph (subset-safe check), else a matching standard-14 font with a visible "font substituted" warning; tail runs keep their own fonts; width growth / page overflow warnings; new lines only into free space; rotated pages and non-Latin text refused with a reason.
- **DOCX edits** on XML runs (formatting inherited, cross-run matches, table cells, paragraph insert/delete); every other package part byte-identical.
- **Scans/photos**: erase-and-redraw reconstruction with ruled/margin line protection, always labelled "Reconstruction — not exact"; scanned PDFs replace only edited pages.
- **TXT/MD** line edits.
- **Versions**: immutable original (v0), version list, undo/redo (buttons + Ctrl+Z / Ctrl+Shift+Z), stale-plan refusal, post-apply verification (verified / not confirmed), change report with native/reconstruction and font status.
- **Diff**: pixel diff for paged documents (changed-pixel %), line diff for DOCX/TXT.
- **Exports**: PDF (native pass-through or typeset/imaged to A4/Letter), PNG/JPEG at 150/200/300 DPI (ZIP for multi-page), DOCX (native, or text-only best effort), TXT, MD. DOCX→PDF/PNG honestly unavailable (needs LibreOffice in the worker).

## Phase 4 — done
- **Research + licences** verified (RESEARCH.md): DiffusionPen integrated (MIT; IAM-trained), reforge unlicensed (not used), DiffInk not integrated, MiniMind excluded, TrOCR-small added for word checking (owner approved downloads: ~1.1 GB models + PyTorch cu128).
- **Worker** `workers/handwriting` (Python 3.11, torch 2.11+cu128 on RTX 5050): style extraction (lettering only), paper reconstruction (writing removed, rules kept, baselines + margin detected; labelled synthetic fallback), DiffusionPen word generation with per-occurrence seeds, best-of-N TrOCR selection, letter-shape sizing, baseline/margin layout with automatic page breaks, transparent ink layer composited once, overlap/clipping check, provenance manifest, paper-only / ink-only / composite outputs, charset refusal + typography normalisation, OOM/GPU errors retried, input errors not.
- **Job protocol**: outbound polling (claim, 120 s lease, heartbeat, checksummed artifacts, complete/fail, retry budget 3, idempotency, cancel, owner-only lease actions, worker online/offline). Store is in server memory for now (ADR-021).
- **Studio**: Generation panel for Handwriting Clone (Text → Assignment on/off) and Convert (requires confirmed transcript); quality (1/3/6 candidates); worker status; queued/running/failed honesty; generated page viewer with layer switch; regenerate line; word-check report; Tesseract OCR back-check; PDF/PNG download; "Match the reference ink" pen option.
- Setup: `workers/handwriting/setup.ps1`, `run-worker.ps1`, `README.md`, `requirements.lock.txt`.

## Pending / clearly disabled in UI
Saving/library (phase 5); DOCX→PDF via LibreOffice (worker) not built.

## Blockers
- ~~Neon credentials~~ resolved 2026-11-02: Neon Postgres + private Object Storage bucket configured and verified (ADR-022).

## Phase 5 — done
- **Neon persistence** (ADR-024): Drizzle schema + migrations (dev branch first, then production), private bucket with direct signed uploads verified by size + magic bytes, signed downloads, optimistic locking, immutable versions with redo-branch cleanup, duplicate (rows + objects), permanent delete, 50-project / 25 MB limits, nothing auto-expires.
- **Owner sign-in** (ADR-023): scrypt hash + HMAC session cookie, proxy gate + per-route checks, localhost-only without a password, login rate limit, sign-out.
- **Library**: search, mode filter, open, rename, duplicate, delete (confirm), download latest version, quota, status badges.
- **Studio**: lazy project creation, autosave (debounced, serialized), uploads to storage as files are added, every applied edit saved as a version, full restore on `/studio?project=<id>` (inputs, versions, cursor, settings, transcript, last generated pages), save-state badge incl. "Changed elsewhere".
- **Jobs on Neon** (ADR-025): SKIP LOCKED claims, SQL lease reaping, retry budget, artifacts in storage, signed artifact URLs, worker liveness; live GPU run passed on the new queue.
- **Hardening** (ADR-026): all API routes owner-only (Groq included) or worker-token, separate rate-limit budgets, CSP + security headers, noindex.
- **Audit**: axe (0 serious/critical) on `/`, `/studio`, `/library`, `/login` desktop + mobile; no horizontal overflow; reduced-motion; performance budget test (landing 585 KB JS incl. idle 3D, studio 347 KB, LCP < 0.6 s locally); worker-offline path; keyboard undo/redo.

## Known limits (honest)
- DOCX → PDF/PNG needs LibreOffice in the worker (not built; disabled with a reason).
- Native PDF edits: Latin text, unrotated pages, single-line changes (no paragraph reflow).
- Handwriting: style approximation only; IAM charset/English; similarity to a real writer not yet measured on authorised samples.
- One local GPU worker; generation waits in the queue while it is off.
- `'unsafe-inline'` scripts in CSP (Next bootstrap without nonces).

## Deployment (verified 2026-11-02)
- Production: **https://assignment-writer-cloner.vercel.app** (Vercel team `sahilkarande0918-9163s-projects`, project `assignment-writer-cloner`, region iad1, GitHub `main` auto-deploys).
- Env: 13 production variables (8 sensitive) copied from `.env.local` via stdin; storage uses `S3_*` names because Vercel reserves `AWS_*`.
- Smoke test against the live URL: 21/21 passed — landing + security headers, /studio -> /login, 401s without session/worker token, wrong password refused, owner sign-in (Secure HttpOnly cookie), Groq models available, worker status, create project on production Neon, signed upload -> server verification -> signed download (same bytes), library listing, delete (404 afterwards). Test project removed.
- First deploy served 404s because the project preset was "Other"; fixed with `vercel.json` (`framework: nextjs`).

## Post-phase update — accounts, every character, progress, cloud GPU (2026-11-02, owner request)
- **Every character is written**: characters outside DiffusionPen's 80-char charset are drawn from Caveat / DejaVu Sans,
  sized and inked like the words, listed in the manifest (`font_drawn`) and in the studio (ADR-029).
- **Live progress bar**: worker heartbeat every 4 s with stage, words done, percent, ETA (`render_jobs.progress`).
- **Accounts** (ADR-027): Neon Auth email sign-up with emailed 6-digit code (production), password reset by code.
  Owner = verified `sahilkarande0918@gmail.com`, unlimited; everyone else 3 generations (handwriting jobs + AI plans),
  then paused (HTTP 402). Data scoped per user. Old owner password removed — the owner must sign up once.
- **Cloud GPU** (ADR-028): `workers/handwriting/modal_app.py`; Generate wakes a Modal L4 container that drains the queue.
  **Blocked:** Modal refuses GPU functions until a payment method is added to the owner's Modal account
  (Modal includes $30/month credit). Until then `GPU_TRIGGER_URL` is unset and the studio shows "GPU worker offline";
  the local worker (`run-worker.ps1 -Api https://assignment-writer-cloner.vercel.app`) still serves jobs.
- Commits: `638769b` (worker), `d0a360c` (app) — pushed, `git ls-remote` matched `d0a360c`; Vercel production Ready.
- Migration `0001_accounts_progress` applied to dev and production.

## Next action
1. Owner adds a payment method at modal.com (Settings → Billing), then:
   `cd workers\handwriting; .\.venv\Scripts\modal deploy modal_app.py` → copy the `trigger` URL →
   `vercel env add GPU_TRIGGER_URL production` (paste URL) → `vercel deploy --prod` (or push).
2. Owner signs up at https://assignment-writer-cloner.vercel.app/login with sahilkarande0918@gmail.com (code by email).
3. Before many students: custom SMTP for Neon Auth emails (shared SMTP is rate-limited).
Optional: LibreOffice DOCX->PDF in the worker; authorised-sample similarity study.
