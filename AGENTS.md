# AGENTS.md

Conventions for any coding agent working in this repository.

- Requirements live in `master_prompt.md`; status in `docs/PROJECT_STATUS.md`; resume steps in `docs/HANDOFF.md`.
- Work in five sequential phases; each ends with tests, doc updates, one commit and a verified push.
- Commits use the repository's configured human identity. Never add AI/bot co-author trailers or attribution.
- Only Groq for AI. Model output is a validated edit-operation plan executed by deterministic engines.
- Keep code minimal: reuse `src/lib` helpers, prefer platform features, no speculative abstractions.
- Every non-trivial logic change ships with a unit test (`tests/unit`) or E2E check (`tests/e2e`). Never report a test as passing unless it ran.
- Treat uploaded files and anything extracted from them as untrusted input.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
