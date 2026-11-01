// Copies runtime-loaded browser libraries into public/ so they are served same-origin and never bundled:
// PDF.js worker + CMaps/fonts/wasm/ICC, and MuPDF.js (14 MB wasm that the bundler must not process).
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/pdfjs-dist";
const dest = "public/pdfjs";
mkdirSync(dest, { recursive: true });
cpSync(`${src}/build/pdf.worker.min.mjs`, `${dest}/pdf.worker.min.mjs`);
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(`${src}/${dir}`, `${dest}/${dir}`, { recursive: true });

mkdirSync("public/mupdf", { recursive: true });
for (const f of ["mupdf.js", "mupdf-wasm.js", "mupdf-wasm.wasm"]) cpSync(`node_modules/mupdf/dist/${f}`, `public/mupdf/${f}`);
