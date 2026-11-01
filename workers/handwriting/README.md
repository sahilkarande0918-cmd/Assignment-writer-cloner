# Handwriting worker (local GPU)

Generates handwriting in a reference writer's style for **Handwriting Clone** and **Convert Handwriting**.
It runs on the owner's computer and talks to the studio **outbound only** (HTTPS polling): no open ports, no tunnel,
no database credentials — just `WORKER_TOKEN`. When it is not running, jobs wait in the queue and the studio says so.

> Output approximates a writing style. It is never identical to the reference writer, and every result carries a
> `provenance.generated = true` record. Use only handwriting you are authorised to use; signatures and identity
> documents are out of scope.

## Setup (Windows PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File workers\handwriting\setup.ps1   # venv, PyTorch cu128, models, CUDA check
workers\handwriting\run-worker.ps1 -Api http://localhost:3000            # or your deployed https URL
```
The server must have the same `WORKER_TOKEN` (see `.env.example`). `worker.py --check` prints CUDA, VRAM, kernel and
model-file status.

## Pipeline
1. **Style** (`hw/style.py`): adaptive threshold, long-stroke (ruling/margin) removal, letters merged into words,
   5 clean word crops chosen, median ink colour sampled. The reference text is never read.
2. **Paper** (`hw/paper.py`): from a paper reference — writing masked and inpainted (TELEA), rule pixels kept,
   rule rows → baselines, margin line → left edge; residual-ink check. Otherwise a labelled synthetic sheet.
3. **Generation** (`hw/model.py`): DiffusionPen (DDIM 50 steps) per word occurrence with its own seed.
4. **Word check** (`hw/recognize.py`, optional): TrOCR-small reads each of N candidates; the closest to the target
   word is kept. Per-word CER and doubtful words go to the manifest.
5. **Composition** (`hw/compose.py`): size restored from letter shape (DiffusionPen stretches every word to 64 px),
   ink as a transparent layer tinted with the pen colour, greedy wrap inside margins, rule baselines, automatic page
   breaks, form feed = page break; programmatic overlap/clipping check.
6. **Outputs**: `page-NN.png` (composite), `ink-NN.png` (ink only), `paper.png` (paper only), manifest with provenance,
   seeds, layout boxes and line → word-occurrence map for "regenerate line".

## Measured on this machine (RTX 5050 Laptop, 8 GB, CUDA 12.8, torch 2.11)
| | |
|---|---|
| Model load | 8.3 s, 0.81 GB VRAM |
| Single sample | 0.35 s/word, peak 1.05 GB VRAM |
| Page (42 words, best of 3 + TrOCR) | ~22 s |
| Word check, test page | 27/42 words read back exactly, CER 21.6 % (TrOCR-small is itself imperfect on single words) |

The style reference in tests is a synthetic page written in a computer font (Ink Free); similarity to a real writer
can only be judged with real, authorised samples.

## Limits
- Charset: the 80 IAM characters (A–Z, a–z, 0–9, common punctuation). Others are refused with a list; curly quotes,
  dashes and ellipses are normalised and reported.
- English only (IAM). Very long words are squeezed by the 256-px canvas and misspell more often.
- 8 GB VRAM is ample (peak ~1 GB). Without CUDA it falls back to CPU (minutes per page).
- Weights: DiffusionPen (MIT, trained on IAM — non-commercial research data), SD-1.5 VAE (CreativeML OpenRAIL-M),
  CANINE-c config (Apache-2.0), TrOCR-small (MIT per microsoft/unilm; HF card has no licence tag; IAM-trained).
  Model files are git-ignored; hashes are in `models/MANIFEST.json`.

## Tests
```powershell
.\.venv\Scripts\python -m pytest -q tests\test_pipeline.py   # no GPU; generation SIMULATED with a font renderer
.\.venv\Scripts\python -m pytest -q -s tests\test_live.py    # real model on the GPU; writes samples to out\
```
