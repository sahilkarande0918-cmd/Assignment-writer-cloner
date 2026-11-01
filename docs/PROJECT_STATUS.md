# Project status

| Phase | Scope | State | Pushed SHA |
|---|---|---|---|
| 1 | Foundation, design system, dashboard shell | ✅ complete | `1b18c16` (verified via ls-remote) |
| 2 | Secure imports, structural analysis, Groq planning | ✅ complete | `33b9218` (verified via ls-remote) |
| 3 | Digital editing + deterministic export | ⏳ next | — |
| 4 | Handwriting worker, paper reconstruction, new assignments | ⏳ | — |
| 5 | Persistence, jobs, polish, deployment | ⏳ | — |

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

## Pending / clearly disabled in UI
Applying edits, undo/redo, exports (phase 3); handwriting generation, paper reconstruction (phase 4); saving/library (phase 5).

## Blockers
- No Neon `DATABASE_URL` / storage credentials yet → phase 5 cloud persistence will fall back to IndexedDB until provided.

## Next action
Phase 3: apply resolved plans — DOCX run-level XML edits, PDF edits (browser overlay path + worker PyMuPDF redaction path), version snapshots, undo/redo, diff toggle, PDF/PNG/JPEG/DOCX/TXT/MD exports.
