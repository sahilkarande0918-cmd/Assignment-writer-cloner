# Project status

| Phase | Scope | State | Pushed SHA |
|---|---|---|---|
| 1 | Foundation, design system, dashboard shell | ✅ complete | `1b18c16` (verified via ls-remote) |
| 2 | Secure imports, structural analysis, Groq planning | ✅ complete | `33b9218` (verified via ls-remote) |
| 3 | Digital editing + deterministic export | ✅ complete | `cdb70dd` (verified via ls-remote) |
| 4 | Handwriting worker, paper reconstruction, new assignments | ✅ complete | `6f412e4` (verified via ls-remote) |
| 5 | Persistence, jobs, polish, deployment | 🟡 in progress (WIP checkpoint pushed) | — |

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

## Phase 5 — progress (2026-11-02, WIP)
Done + tested: Drizzle schema (8 tables + workers) migrated on Neon `dev` and `production`; private object storage helpers (signed PUT/GET, verified uploads); owner sign-in (scrypt hash + HMAC cookie, proxy gate, route guards); projects API (list/search/filter, create, PATCH with optimistic locking, duplicate, delete, uploads, versions); job queue moved to Neon (SKIP LOCKED claim, leases, checksummed artifacts in storage); library UI; studio autosave/reopen/version save. Tests: integration 5/5 on dev branch (`npm run test:int`), persistence E2E passed on dev branch.
Remaining: full regression run (unit + all E2E) after these changes, live worker run against Neon store, security headers/CSP + a11y/perf audit, docs (ADRs for auth/persistence, TEST_MATRIX), Vercel deployment (ask owner first), final `feat(phase-5)` commit.

## Next action
Phase 5: Neon Postgres + object storage (needs owner credentials) or IndexedDB fallback for ≥10 projects; move job store to Neon; single-owner auth; autosave/library; security/perf/a11y audit; Vercel deployment after verifying account.
