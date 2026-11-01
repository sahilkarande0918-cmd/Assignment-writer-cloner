// Copies the PDF.js worker, CMaps, standard fonts and wasm into public/ so they are served same-origin.
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/pdfjs-dist";
const dest = "public/pdfjs";
mkdirSync(dest, { recursive: true });
cpSync(`${src}/build/pdf.worker.min.mjs`, `${dest}/pdf.worker.min.mjs`);
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(`${src}/${dir}`, `${dest}/${dir}`, { recursive: true });
