# Handwriting worker (cloud GPU or local GPU)

Generates handwriting in a reference writer's style for **Handwriting Clone** and **Convert Handwriting**.
In production it runs on **Modal** cloud GPUs (`modal_app.py`): pressing Generate queues a job and wakes a GPU
container, which handles queued jobs and shuts down when the queue is empty, so users install nothing. The same
`worker.py` can also run on a local PC. Either way it talks to the studio **outbound only** (HTTPS polling): no open
ports, no database credentials — just `WORKER_TOKEN`. It reports progress (stage, words done, ETA) with each heartbeat.

> Output approximates a writing style. It is never identical to the reference writer, and every result carries a
> `provenance.generated = true` record. Use only handwriting you are authorised to use; signatures and identity
> documents are out of scope.

## Cloud GPU (Kaggle, free) — one-time setup by the site owner
1. kaggle.com account, verify the phone number (unlocks GPU + internet), Settings → API → create a token.
2. Set `KAGGLE_USERNAME` and `KAGGLE_API_TOKEN` (or legacy `KAGGLE_KEY`) on the server (Vercel env).
Pressing Generate then starts a private Kaggle script run (`assignment-studio-gpu`) that clones this repo, downloads the
weights from Hugging Face, and runs `worker.py --drain --idle 300` on a T4. It holds only a short-lived worker token.
Start-up takes a few minutes; about 30 GPU hours a week are free.

## Cloud GPU (Modal, paid alternative) — needs a payment method on modal.com
```powershell
cd workers\handwriting
.\.venv\Scripts\modal token new                                    # sign in to modal.com in the browser
.\.venv\Scripts\modal secret create assignment-studio HW_API_URL=https://assignment-writer-cloner.vercel.app HW_WORKER_TOKEN=<WORKER_TOKEN>
.\.venv\Scripts\modal deploy modal_app.py                          # builds the image (downloads weights from Hugging Face)
```
Set `GPU_TRIGGER_URL` on the server to the printed `trigger` URL. Re-run `modal deploy` after changing worker code.
GPU: NVIDIA L4, at most 3 containers at once (`max_containers` in `modal_app.py`); idle cost is zero.

## Local setup (Windows PowerShell)
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
- Charset: DiffusionPen writes the 80 IAM characters (A–Z, a–z, 0–9, common punctuation). Every other character
  (% @ £ © ° ™ { } accented letters, Greek, maths…) is drawn from a font (`hw/glyphs.py`: Caveat, OFL; DejaVu Sans as
  fallback), sized by x-height and inked in the pen colour; the manifest lists them under `font_drawn`. Characters no
  font has (e.g. CJK) are refused with a list. Curly quotes, dashes and ellipses are normalised; invisible characters
  (soft hyphens, zero-width spaces) are dropped.
- English only (IAM). Very long words are squeezed by the 256-px canvas and misspell more often.
- 8 GB VRAM is ample (peak ~1 GB). Without CUDA it falls back to CPU (minutes per page).
- Weights: DiffusionPen (MIT, trained on IAM — non-commercial research data), SD-1.5 VAE (CreativeML OpenRAIL-M),
  CANINE-c config (Apache-2.0), TrOCR-small (MIT per microsoft/unilm; HF card has no licence tag; IAM-trained).
  Model files are git-ignored; hashes are in `models/MANIFEST.json`.
- Fonts in `fonts/`: Caveat (SIL OFL 1.1, `OFL-Caveat.txt`), DejaVu Sans (free licence, `LICENSE-DejaVu.txt`).

## Tests
```powershell
.\.venv\Scripts\python -m pytest -q tests\test_pipeline.py   # no GPU; generation SIMULATED with a font renderer
.\.venv\Scripts\python -m pytest -q -s tests\test_live.py    # real model on the GPU; writes samples to out\
```
