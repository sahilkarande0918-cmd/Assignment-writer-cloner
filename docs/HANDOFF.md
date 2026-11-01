# Handoff

## Resume
1. Read `master_prompt.md`, `CLAUDE.md`, `docs/PROJECT_STATUS.md`, this file, `docs/DECISIONS.md`.
2. `git log -5 --oneline && git status`
3. `npm install && npx playwright install chromium`
4. `npm run lint && npm test && npm run build && npm run test:e2e` (add `GROQ_LIVE=1` for the live E2E plan; `npm run test:live` for the 10-command Groq eval)

## Environment
- Repo path: `D:\Assignment writer_cloner` (moved from OneDrive on 2026-11-02).
- Worker: `workers\handwriting\setup.ps1` then `run-worker.ps1 -Api http://localhost:3000`; live tests need it polling.
- Windows 11, Node 24.13, npm 11.8, Python 3.11 available via `py -3.11`, RTX 5050 Laptop 8 GB.
- Git identity: repository uses the owner's configured global identity (`sahilkarande0918-cmd`). Do not change it. No AI co-author trailers.
- Remote: `origin https://github.com/sahilkarande0918-cmd/Assignment-writer-cloner.git`, branch `main`.
- Env vars: see `.env.example`. `.env.local` exists locally with the owner's `GROQ_API_KEY` (git-ignored — never print or commit it).

## Checkpoint log
| Phase | Commit message | SHA | Verified via |
|---|---|---|---|
| 1 | feat(phase-1): build foundation and premium workspace | `1b18c16d68a75338ce417b74f938142fe6949ca7` | `git ls-remote origin main` matched 2026-11-01 |
| 2 | feat(phase-2): implement document intake and Groq edit planning | `33b921834e32fa19537beb1f20cf09e54b0b124b` | `git ls-remote origin main` matched 2026-11-01 |
| 3 | feat(phase-3): add layout-aware digital editor and exports | `cdb70dd660c92313a9731903185f735fa8a2eefb` | `git ls-remote origin main` matched 2026-11-02 |
| 4 | feat(phase-4): integrate reference handwriting generation | `6f412e4c0a77d4a4bb4a9ed51c12695265cf7e50` | `git ls-remote origin main` matched 2026-11-02 |

## Changes since previous phase
Phase 4: repo moved to `D:\Assignment writer_cloner` (out of OneDrive). Handwriting worker (`workers/handwriting`), job API (`src/app/api/jobs`, `src/app/api/worker`), `src/lib/server/jobs.ts`, `src/lib/hwjob.ts`, Generation panel, live/sim tests. `.env.local` now also holds a random `WORKER_TOKEN` (git-ignored).

Phase 3: `src/lib/edit/*` engines (MuPDF native PDF, DOCX XML runs, raster reconstruction, text), `src/lib/export.ts`, `src/lib/diff.ts`, versions/undo/redo/diff/report UI, working export dialog, `scripts/verify_exports.py`, `scripts/copy-assets.mjs` (renamed from copy-pdfjs; now also copies MuPDF to `public/mupdf`).

Phase 2: document intake (PDF.js/JSZip/docx-preview/Tesseract), Groq plan + transcribe + status APIs, resolver, plan/diff UI, manual find & replace, Convert transcript, fixtures, live eval.

## Open issues
- Background `next start`/worker processes can outlive their task wrapper on Windows; kill by command line (`next start -p 3100`, `worker.py`) before restarting.
- **OneDrive**: this repo lives in a OneDrive-synced folder. Builds/tests hung and left unkillable node processes until a reboot (sync holding handles on `.next`/`node_modules`). If it recurs: reboot or pause sync; long-term move the repo outside OneDrive.
- MuPDF must not be bundled (Turbopack stalls on its 14 MB wasm): it is copied to `public/mupdf` by postinstall and imported at runtime with `webpackIgnore`.
- Bash-tool heredocs mangle backslashes/quotes: write files with the Write tool.
- Playwright needs `workers: 4` and 60 s timeout on this laptop; axe runs after animations settle.
