# Assignment Studio

Private web studio to edit assignments, preserve digital document fonts where possible, and compose new notebook pages in a handwriting style learned from your own authorised references.

> Generated handwriting is an approximation of a style, never an identical copy. Scanned-page edits are reconstructions, not lossless edits.

## Quick start
```bash
npm install
cp .env.example .env.local   # fill GROQ_API_KEY etc. when available
npm run dev                  # http://localhost:3000
```

## Scripts
| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright (desktop + mobile, axe) — run after `npm run build` |

## Docs
`docs/PROJECT_STATUS.md` (what works), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_MATRIX.md`, `docs/RESEARCH.md`, `docs/HANDOFF.md`. Full requirements: `master_prompt.md`.
