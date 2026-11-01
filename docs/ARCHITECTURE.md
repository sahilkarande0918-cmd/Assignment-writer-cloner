# Architecture

Status markers: ✅ built · 🟡 partial · ⏳ planned (phase number).

```
 Browser (Next.js client)                          Vercel (Next.js server)                 Owner's PC (optional)
 ┌──────────────────────────────┐   HTTPS          ┌───────────────────────────┐  HTTPS   ┌─────────────────────────┐
 │ Landing / Studio / Library ✅ │ ───────────────▶ │ /api/plan  (Groq) ⏳2      │ ◀─────── │ workers/handwriting ⏳4  │
 │ Upload validation ✅          │                  │ /api/projects, files ⏳5   │  poll    │  claim job → download    │
 │ PDF.js render/extract ⏳2     │                  │ /api/worker/* (token) ⏳4  │  only    │  generate/reconstruct    │
 │ DOCX XML edit (JSZip) ⏳3     │                  └─────────┬─────────────────┘          │  upload artifacts        │
 │ pdf-lib export/overlay ⏳3    │                            │                            └─────────────────────────┘
 │ Tesseract OCR (wasm) ⏳2      │                   ┌────────▼────────┐  ┌──────────────────────┐
 │ IndexedDB local library ⏳5   │                   │ Neon Postgres ⏳5│  │ S3-compatible private │
 └──────────────────────────────┘                   │ (Drizzle)        │  │ object storage ⏳5    │
                                                     └─────────────────┘  └──────────────────────┘
```

## Boundaries
- **Browser** does all light document work (render, extract, DOCX run edits, overlay PDF edits, exports) so the studio works with no backend credentials and no 4.5 MB serverless body limit on files.
- **Vercel server** only: Groq calls (key stays server-side), metadata/DB access, signed storage URLs, job queue endpoints. No PyTorch/LibreOffice/PyMuPDF there.
- **Python worker** (local GPU, optional): handwriting generation, paper reconstruction (OpenCV), native PDF text replacement (PyMuPDF redaction that keeps line art/images). Reaches the server **outbound only**; never receives inbound connections; never holds DB credentials — only a restricted `WORKER_TOKEN`.

## Source layout
- `src/app` — routes: `/` landing, `/studio` workspace, `/library`, `robots.ts` (disallow all).
- `src/components/ui` — shadcn-style primitives on Radix (button, switch, badge, dialog usage).
- `src/components/landing` — hero (lazy WebGL scene with static fallback), before/after teaser, reveal motion.
- `src/components/studio` — studio shell: upload cards, inspector, composer, export dialog, paper preview.
- `src/lib` — pure logic shared client/server: `formats.ts` (input matrix, signature sniffing, sanitising), `studio.ts` (modes, slots, layout maths).
- `tests/unit` (Vitest), `tests/e2e` (Playwright desktop + mobile, axe).

## Data model (target, phase 5)
`owner` (single-user config) · `projects` · `source_files` · `reference_styles` · `document_versions` (immutable snapshots, version id for optimistic locking) · `operations` (validated plan ops + status) · `render_jobs` (queued/running/succeeded/failed/cancelled, lease, heartbeat, attempts, idempotency key) · `output_artifacts` (checksum, mime, storage key).

## Job protocol (target, phase 4/5)
`POST /api/worker/claim` (Bearer WORKER_TOKEN) → leases one queued job for N seconds → worker heartbeats → uploads artifacts with sha256 → `complete`/`fail`. Expired leases return to the queue until the retry budget is spent. Worker offline ⇒ job stays `queued` and the UI says so.
