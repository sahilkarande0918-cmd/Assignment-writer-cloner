# Handoff

## Resume
1. Read `master_prompt.md`, `CLAUDE.md`, `docs/PROJECT_STATUS.md`, this file, `docs/DECISIONS.md`.
2. `git log -5 --oneline && git status`
3. `npm install && npx playwright install chromium`
4. `npm run lint && npm test && npm run build && npm run test:e2e` (add `GROQ_LIVE=1` for the live E2E plan; `npm run test:live` for the 10-command Groq eval)

## Environment
- Windows 11, Node 24.13, npm 11.8, Python 3.11 available via `py -3.11`, RTX 5050 Laptop 8 GB.
- Git identity: repository uses the owner's configured global identity (`sahilkarande0918-cmd`). Do not change it. No AI co-author trailers.
- Remote: `origin https://github.com/sahilkarande0918-cmd/Assignment-writer-cloner.git`, branch `main`.
- Env vars: see `.env.example`. `.env.local` exists locally with the owner's `GROQ_API_KEY` (git-ignored — never print or commit it).

## Checkpoint log
| Phase | Commit message | SHA | Verified via |
|---|---|---|---|
| 1 | feat(phase-1): build foundation and premium workspace | `1b18c16d68a75338ce417b74f938142fe6949ca7` | `git ls-remote origin main` matched 2026-11-01 |
| 2 | feat(phase-2): implement document intake and Groq edit planning | `33b921834e32fa19537beb1f20cf09e54b0b124b` | `git ls-remote origin main` matched 2026-11-01 |

## Changes since previous phase
Phase 2: document intake (PDF.js/JSZip/docx-preview/Tesseract), Groq plan + transcribe + status APIs, resolver, plan/diff UI, manual find & replace, Convert transcript, fixtures, live eval.

## Open issues
- Bash-tool heredocs mangle backslashes/quotes: write files with the Write tool.
- Playwright needs `workers: 4` and 60 s timeout on this laptop; axe runs after animations settle.
