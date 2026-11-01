# Test matrix

Only results that were actually executed are recorded. "—" = not yet testable.

## Supported input formats
| Format | Accepted | Signature check | Preview | Text extraction | Edit | Notes |
|---|---|---|---|---|---|---|
| PDF | ✅ | `%PDF-` | — (ph2) | — (ph2) | — (ph3) | encrypted/corrupt rejected in ph2 |
| DOCX | ✅ | ZIP + `.docx` name (parts verified ph2) | — | — | — | |
| PNG / JPEG / WEBP | ✅ | magic bytes | ✅ image | — (OCR ph2) | — | |
| TXT / MD | ✅ | no NUL bytes | — | — | — | |
| Anything else (EXE, ZIP…) | ❌ rejected | ✅ tested | | | | |
Limits: 25 MB per file, 60 pages (pages enforced from ph2).

## Phase 1 results (executed 2026-11-01, Windows 11, Chromium headless 156)
| Suite | Command | Result |
|---|---|---|
| Unit (formats, studio logic) | `npm test` | 10/10 pass |
| Lint | `npm run lint` | pass, 0 warnings |
| Type-check + build | `npm run build` | pass |
| E2E desktop 1440×900 + mobile Pixel 7 | `npm run test:e2e` | 16/16 pass |

E2E covers: `/`, `/studio`, `/library` render; no console errors; no horizontal overflow; zero serious/critical axe violations; reduced-motion disables WebGL; Text → Assignment toggle swaps cards/editor; executable disguised as PDF rejected; PNG accepted and previewed; planning disabled with a reason; Convert Handwriting requires both assignments and shows its pipeline.

Manual visual review (built-in browser): landing desktop + mobile, studio desktop + mobile — checked.

## Fixtures still required (later phases)
Embedded-font PDF, scanned handwritten page with ruled lines, multi-page PDF, DOCX with table/header/footer, photo with perspective — all synthetic or owner-authorised.
