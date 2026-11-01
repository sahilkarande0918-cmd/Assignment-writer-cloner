# Decisions (ADR log)

## ADR-001 Next.js 16 App Router + TypeScript + Tailwind v4 (phase 1)
Scaffolded with `create-next-app@latest` (Next 16.4.3, React 19.3, `cacheComponents` on). Vercel-native, server route handlers keep secrets server-side.

## ADR-002 shadcn/ui pattern, not the CLI (phase 1)
Components are owned source in `src/components/ui` built on Radix (Switch, Dialog) + `cn()` — the shadcn approach without generating unused components. Native `<select>`/`<input type=range>` are used where they are fully accessible and smaller.

## ADR-003 Motion: CSS first, `motion` for in-view reveals, no GSAP/Lenis (phase 1)
CSS keyframes handle the hero; `motion` (`MotionConfig reducedMotion="user"`) handles scroll reveals. GSAP ScrollTrigger was not genuinely needed for the effects used; Lenis was skipped because smooth-scroll hijacking hurts keyboard/assistive navigation. Revisit only if a specific effect needs them.

## ADR-004 Hero: lightweight react-three-fiber scene instead of stock video (phase 1)
The cinematic element is a procedurally textured WebGL paper scene (no external assets, so no licensing risk). It is lazy-loaded on idle and skipped for reduced-motion, phones, low-core devices, Save-Data and no-WebGL; a CSS paper stack is the static fallback. No footage was downloaded or hotlinked. A licensed clip can be added later if the owner supplies one.

## ADR-005 Magic UI / Inspira UI (phase 1)
Inspira UI is Vue/Nuxt — not installed (no Vue inside Next.js). Magic UI components were not needed for the current effects; none copied.

## ADR-006 Browser-first document processing (planned, phases 2–3)
PDF.js, pdf-lib, JSZip and Tesseract (wasm) run in the browser so essential editing works without the GPU worker or cloud storage, and large files never pass through serverless body limits. Native PDF redaction-quality edits (PyMuPDF) run in the optional worker and are labelled as such.

## ADR-007 Ponytail plugin (phase 1)
Installed as a Claude Code plugin (`ponytail@ponytail`); its hook and skills (`ponytail-review`, `ponytail-audit`) are active in this environment. It is an engineering-discipline plugin, not a design system.

## ADR-008 MiniMind is not part of this product
`jingyaogong/minimind` trains small *language* models. It cannot generate handwriting images, and planning is handled by Groq. It will not be trained or integrated (to be re-confirmed in RESEARCH.md, phase 4).

## ADR-009 Convert Handwriting as its own mode (owner request, 2026-11-01)
Owner asked for: upload assignment 1 (content) + assignment 2 (handwriting) → assignment 1's content written in assignment 2's handwriting. It is a separate studio mode rather than a toggle inside Clone, because its inputs and checks differ: content comes from an OCR transcript of assignment 1 that the owner must review before generation (no instruction required), and assignment 2 is used for style only. Paper can come from assignment 1, assignment 2, or a labelled approximation; line breaks can be kept or reflowed. Pipeline: OCR (ph2) → transcript review (ph2) → style extraction + generation + composition (ph4) → OCR back-check vs transcript (ph4).

## ADR-010 Plan contract: model proposes, code verifies (phase 2)
Groq returns a flat, strict-mode-compatible JSON plan (every key required, nullable instead of optional). Every operation must quote the exact original text; `resolvePlan` checks it against the real spans and marks ok/ambiguous/unresolved/invalid. Ambiguous ops need the owner to pick an occurrence. Model output that fails Zod is retried once on `gpt-oss-120b`, then rejected. Document text is wrapped as untrusted data with tag neutralisation. Manual find & replace builds the same plan without AI.

## ADR-011 Local OCR first, Groq vision only with consent (phase 2)
Tesseract.js runs in the browser; the image never leaves the device (the English model file is fetched from the jsDelivr CDN on first use). Handwriting OCR is weak, so Convert mode offers "Improve transcript with Groq vision" behind an explicit consent checkbox; images are downscaled to fit Vercel's request limit.

## ADR-012 DOCX preview via docx-preview (phase 2)
`docx-preview` (Apache-2.0) renders an approximate view; edits will target the original XML runs, not the preview. Labelled approximate in the UI.

## ADR-013 PDF.js assets served same-origin (phase 2)
`scripts/copy-pdfjs.mjs` (postinstall) copies the worker, CMaps, standard fonts, wasm and ICC profiles into `public/pdfjs` (git-ignored). `fontExtraProperties: true` is required to read real font names.

## ADR-014 MuPDF.js (WASM) for native PDF edits and exports (phase 3)
`mupdf@1.28.1` (Artifex, **AGPL-3.0-or-later**) runs in the browser and Node. It gives per-character fonts/positions, text-only redaction (`REDACT_LINE_ART_NONE`, `REDACT_IMAGE_NONE` — rules, borders, underlines and images survive), font embedding and page rendering. AGPL is acceptable for this private, source-available app; anyone distributing a modified hosted version must offer its source. Alternatives rejected: pdf-lib (cannot remove existing text), PyMuPDF-only (would make basic PDF edits depend on the optional worker). Its Node-only `import("module")` is aliased to `src/lib/node-stub.js` for browser builds.

Font policy: redraw with the original embedded font when it can render every new glyph. Subset fonts (`ABCDEF+Name`) keep cmap entries for dropped glyphs, so for them only characters the document already draws with that font are trusted; otherwise a standard-14 font of the same class (serif/sans/mono, bold/italic) is used and the report says "font substituted". Only the changed glyphs through the end of the line are redacted and redrawn (tail keeps its own font runs). Width growth > 2 pt and page overflow are reported. New lines are inserted only into free space; otherwise refused. Rotated pages and non-Latin text are refused for native edits (reported).

## ADR-015 DOCX edits on XML runs (phase 3)
Matches are located across `w:t` nodes (tracked deletions skipped); the replacement inherits the run where the match starts; only `word/document.xml` is rewritten (all other parts byte-identical — unit-tested). New paragraphs clone the source paragraph's formatting. DOCX→PDF/PNG is unavailable in the browser (needs LibreOffice in the worker) and the export dialog says so.

## ADR-016 Scans/photos: erase-and-redraw reconstruction (phase 3)
Ink inside the OCR line box is masked (luminance below paper), long ruled/margin lines are protected, masked pixels are back-filled from the same column, then the new line is drawn once in a typed font with the sampled ink colour. Always labelled "Reconstruction — not exact". Handwritten redraw comes from the GPU worker in phase 4. Scanned PDFs: only edited pages are replaced by an image; other page objects are untouched.

## ADR-017 Versions and undo (phase 3)
Every apply produces a new immutable `File`; the original upload is version 0 and never modified. Undo/redo moves a cursor; applying after undo drops the redo branch. Plans carry the version id and are refused when stale. After each apply the new version is re-extracted and each change is marked verified / not confirmed.
