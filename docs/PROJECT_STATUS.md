# Project status

| Phase | Scope | State | Pushed SHA |
|---|---|---|---|
| 1 | Foundation, design system, dashboard shell | ✅ complete | `1b18c16` (verified via ls-remote) |
| 2 | Secure imports, structural analysis, Groq planning | ⏳ next | — |
| 3 | Digital editing + deterministic export | ⏳ | — |
| 4 | Handwriting worker, paper reconstruction, new assignments | ⏳ | — |
| 5 | Persistence, jobs, polish, deployment | ⏳ | — |

## Phase 1 — done
- Next.js 16 + TS + Tailwind v4 app, design tokens (ivory/charcoal/bronze, Instrument Serif + Geist), skip link, focus rings, reduced-motion CSS.
- Landing: cinematic hero (lazy WebGL paper scene + static fallback), before/after teaser, five-mode story, honest limits, CTA.
- Studio shell: mode switch (Edit / Clone / **Convert Handwriting** / Digital), upload cards with signature validation, separate reference card, `Text → Assignment` toggle, content editor + live paper-layer preview, inspector (page size, paper style, margins, spacing, pen colour, size, alignment), split view + zoom, bottom composer with examples and scope, export dialog (format/page size/DPI).
- Library shell with honest empty state.
- Tests: Vitest + Playwright (desktop/mobile) + axe; robots disallow + noindex.

## Added requirement (owner, 2026-11-01)
Convert Handwriting mode — keep assignment 1's content, write it in assignment 2's handwriting (ADR-009). Shell built in phase 1; transcript OCR/review in phase 2; generation in phase 4.

## Pending / clearly disabled in UI
Planning (Groq), PDF/DOCX/text previews, edits, undo/redo, export, saving, handwriting generation.

## Blockers
- No `GROQ_API_KEY` provided yet → live Groq tests impossible; phase 2 ships with mocked contract tests + live test that skips without a key.
- No Neon `DATABASE_URL` / storage credentials yet → phase 5 cloud persistence will fall back to IndexedDB until provided.

## Next action
Phase 2: PDF.js previews, Convert-mode transcript extraction + review, + extraction with geometry, DOCX parsing, OCR adapter, handwritten-vs-digital detection, Groq plan endpoint with Zod schema, plan/diff UI.
