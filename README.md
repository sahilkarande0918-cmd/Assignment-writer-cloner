# Assignment Studio

Private web studio to edit assignments, preserve digital document fonts where possible, and compose new notebook pages in a handwriting style learned from your own authorised references.

> Generated handwriting is an approximation of a style, never an identical copy. Scanned-page edits are reconstructions, not lossless edits.

## Quick start
```bash
npm install
cp .env.example .env.local   # fill GROQ_API_KEY etc. when available
npm run dev                  # http://localhost:3000
```

## Owner sign-in and storage
- `node scripts/set-owner-password.mjs` generates the owner password (saved to `.owner-password`, git-ignored).
- Neon Postgres + private object storage: fill `.env.local` with `neon env pull` (see `.env.example`), then `npm run db:migrate:prod`.
- Handwriting worker: `workers/handwriting/setup.ps1`, then `workers/handwriting/run-worker.ps1 -Api <app url>`.

## Scripts
| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright (desktop + mobile, axe) — run after `npm run build`; uses the Neon dev branch |
| `npm run test:int` | Integration tests on the Neon dev branch |
| `npm run db:migrate:dev` / `db:migrate:prod` | Apply migrations |
| `npm run db:clean-dev` | Remove test data from the dev branch |

## Docs
`docs/PROJECT_STATUS.md` (what works), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TEST_MATRIX.md`, `docs/RESEARCH.md`, `docs/HANDOFF.md`. Full requirements: `master_prompt.md`.
