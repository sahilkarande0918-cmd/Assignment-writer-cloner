# Architecture

Status markers: ✅ built · 🟡 partial · ⏳ planned (phase number).

```
 Browser (Next.js client)                          Vercel (Next.js server)                 Owner's PC (optional)
 ┌──────────────────────────────┐   HTTPS          ┌───────────────────────────┐  HTTPS   ┌─────────────────────────┐
 │ Landing / Studio / Library ✅ │ ───────────────▶ │ /api/plan  (Groq) ✅       │ ◀─────── │ workers/handwriting ✅  │
 │ Upload validation ✅          │                  │ /api/projects, files ✅    │  poll    │  claim job → download    │
 │ PDF.js render/extract ✅     │                  │ /api/worker/* (token) ✅   │  only    │  generate/reconstruct    │
 │ DOCX XML edit (JSZip) ✅     │                  └─────────┬─────────────────┘          │  upload artifacts        │
 │ MuPDF.js edit/export ✅      │                            │                            └─────────────────────────┘
 │ Tesseract OCR (wasm) ✅      │                   ┌────────▼────────┐  ┌──────────────────────┐
 │ Library + autosave ✅      │                   │ Neon Postgres ✅ │  │ S3-compatible private │
 └──────────────────────────────┘                   │ (Drizzle)        │  │ object storage ✅     │
                                                     └─────────────────┘  └──────────────────────┘
```

## Boundaries
- **Browser** does all light document work (render, extract, DOCX run edits, native PDF edits via MuPDF WASM, scan reconstruction, exports) so the studio works with no backend credentials and no 4.5 MB serverless body limit on files.
- **Vercel server** only: Groq calls (key stays server-side), metadata/DB access, signed storage URLs, job queue endpoints. No PyTorch/LibreOffice/PyMuPDF there.
- **Python worker** (local GPU, optional): handwriting generation, paper reconstruction (OpenCV), native PDF text replacement (PyMuPDF redaction that keeps line art/images). Reaches the server **outbound only**; never receives inbound connections; never holds DB credentials — only a restricted `WORKER_TOKEN`.

## Source layout
- `src/app` — routes: `/` landing, `/studio` workspace, `/library`, `robots.ts` (disallow all).
- `src/components/ui` — shadcn-style primitives on Radix (button, switch, badge, dialog usage).
- `src/components/landing` — hero (lazy WebGL scene with static fallback), before/after teaser, reveal motion.
- `src/components/studio` — studio shell: upload cards, inspector, composer, export dialog, paper preview.
- `src/lib` — `formats.ts` (input matrix, signatures, sanitising), `studio.ts` (modes, slots, layout maths), `plan.ts` (Zod plan contract, prompt builder, deterministic resolver), `doc/` (model, PDF/DOCX/image/text loaders, OCR), `server/` (Groq client, request guard — server only).
- `src/lib/edit` — `ops.ts` (plan → per-span edits, text engine), `pdf.ts` (MuPDF native PDF edits), `docx.ts` (XML run edits), `raster.ts` (scan reconstruction), `apply.ts` (engine choice + verification). `src/lib/export.ts` (PDF/PNG/JPEG/ZIP/DOCX/TXT/MD), `src/lib/diff.ts`.
- `src/app/api` — `plan`, `transcribe`, `groq/status`.
- `tests/unit` (Vitest), `tests/e2e` (Playwright desktop + mobile, axe).

## Data model (phase 5, live)
`owner` (single-user config) · `projects` · `source_files` · `reference_styles` · `document_versions` (immutable snapshots, version id for optimistic locking) · `operations` (validated plan ops + status) · `render_jobs` (queued/running/succeeded/failed/cancelled, lease, heartbeat, attempts, idempotency key) · `output_artifacts` (checksum, mime, storage key).

## Job protocol (Neon since phase 5)
`POST /api/worker/claim` (Bearer WORKER_TOKEN) → leases one queued job for N seconds → worker heartbeats → uploads artifacts with sha256 → `complete`/`fail`. Expired leases return to the queue until the retry budget is spent. Worker offline ⇒ job stays `queued` and the UI says so.

## Handwriting worker (phase 4)
`workers/handwriting`: `hw/style.py` (reference → 5 word crops + ink colour), `hw/paper.py` (paper reconstruction /
synthetic sheet), `hw/model.py` (DiffusionPen), `hw/recognize.py` (TrOCR word check), `hw/compose.py` (layout +
composition + overlap/clip check), `hw/pipeline.py` (job → pages + manifest), `worker.py` (polling client).
Studio: `GenerationPanel` queues `/api/jobs` (multipart: payload JSON + reference/paper JPEG ≤ 1.8 MB each), polls status,
shows composite / paper-only / ink-only previews, line regeneration, OCR back-check, PDF/PNG download.

## Persistence and auth (phase 5)
- `src/lib/server/db` (Drizzle schema + client), `storage.ts` (signed URLs, prefix delete, copy), `projects.ts`
  (repository + optimistic locking), `jobs.ts` (queue), `auth.ts` + `password.ts` (owner session), `http.ts`
  (`ownerRoute` / `workerRoute` wrappers: auth, same-origin, size + rate limits, safe errors).
- Routes: `/api/projects` (+ `[id]`, `duplicate`, `files`, `files/[fileId]/confirm`, `versions`), `/api/auth/login|logout`,
  jobs and worker routes. Pages `/studio` and `/library` are gated by `src/proxy.ts`; `/login` is public.
- Upload flow: browser → `POST files` (signed PUT) → PUT to bucket → `POST confirm` (size + signature) → row ready.
- Studio: `use-cloud.ts` (lazy create, serialized autosave queue, upload, version save, load) restores everything on
  `/studio?project=<id>`.
