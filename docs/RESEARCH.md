# Research log

Claims are marked **verified** only after checking the source in this project. Phase 4 completes the handwriting section.

## Handwriting generation (verified 2026-11-02)
| Repo | Licence | Finding | Decision |
|---|---|---|---|
| koninik/DiffusionPen (code) | MIT | Few-shot latent diffusion, 5 style word crops, CANINE text conditioning, SD-1.5 VAE + DDIM. Model code vendored unchanged in `workers/handwriting/vendor/diffusionpen` (commit in `SOURCE_COMMIT`). | **Integrated** |
| konnik/DiffusionPen (HF weights) | MIT (card) | `ema_ckpt.pt` 680 MB contains UNet **and** CANINE weights (keys `module.text_encoder.module.*`), so CANINE weights need not be downloaded. Trained on IAM (non-commercial research licence). | Used (owner approved) |
| peterzat/reforge | **none** (all rights reserved) | DiffusionPen-based CLI; no licence, so nothing copied. Our style/paper/composition code is written independently. | Not used |
| awei669/DiffInk | MIT code; weights follow CASIA-OLHWDB licence | Online pen-trajectory model (needs stroke data, not page images); weights only on Google Drive/Baidu; trained mainly on Chinese. | Not integrated (research alternative) |
| jingyaogong/minimind | Apache-2.0 | Trains small language models; cannot generate handwriting images. | Excluded (ADR-008) |
| microsoft/trocr-small-handwritten | MIT per microsoft/unilm (HF card lacks a licence tag) | IAM-fine-tuned recogniser, 246 MB; used to pick the best of N word samples. | Integrated (owner approved) |
| stable-diffusion-v1-5 VAE | CreativeML OpenRAIL-M | Only `vae/diffusion_pytorch_model.fp16.safetensors` + configs (167 MB). Use restrictions include no impersonation without consent — consistent with our authorised-reference rule. | Used |

## Datasets
IAM, CVL, RIMES, Bentham — none downloaded. IAM terms (registration, non-commercial research) apply indirectly via the
IAM-trained weights; the product is private and non-commercial. The 7 GB pre-processed IAM `.pt` files on HF were skipped.

## Measured baseline (live, RTX 5050 Laptop 8 GB)
Load 8.3 s / 0.81 GB; 0.35 s per word / peak 1.05 GB; 42-word page with best-of-3 + TrOCR ≈ 22 s; word check:
27/42 exact, CER 21.6 % on a synthetic (font-based) style reference. Observed failure modes: misspelt letters inside
long words (256-px canvas), oversized single-letter words (fixed by letter-shape sizing), occasional wrong case.

## Optional fine-tuning (experimental — not executed)
Baseline above must be beaten on a held-out set before any change ships:
1. Collect ≥ 200 authorised word crops of the owner (with transcriptions) and a 50-word held-out set.
2. Fine-tune only the style encoder (`style_encoder_train.py` in upstream DiffusionPen) on those crops, then optionally
   the UNet for a few epochs with a low LR (1e-5) and EMA, fp16 autocast to fit 8 GB.
3. Accept only if held-out CER (TrOCR word check) and a blind style-similarity review both improve.

## Hardware (verified 2026-11-01)
`nvidia-smi`: NVIDIA GeForce RTX 5050 Laptop GPU, 8151 MiB, driver 616.64. Blackwell (sm_120): **verified** PyTorch 2.11.0+cu128 runs CUDA kernels (capability 12.0).
Python available: 3.11 (64-bit), 3.13, 3.14.

## Groq (verified 2026-11-01 via models API, `node --env-file=.env.local scripts/groq-check.mjs`)
`openai/gpt-oss-20b` ✅, `openai/gpt-oss-120b` ✅, `qwen/qwen3.8-27b` ✅ (only vision-capable model on the account). Strict `json_schema` responses worked for gpt-oss-20b in 10/10 live runs. gpt-oss spends completion tokens on hidden reasoning (≈600 tokens for a small request), so `max_completion_tokens` is 8192.

## Writer's-own-ink collage (2026-11-04, ADR-037)
Bank from 4 DSA pages (owner's handwriting): word crops verified by TrOCR + Groq transcript, letters cut and filtered by
medoid similarity. Output judged closer to the owner's hand than VATr++ (owner: VATr++ "did not match at all").
Coverage gaps fall back to Caveat. Browser-first options (fontsketch, draw-your-font, pdfme, ONNX Runtime Web) are
still unevaluated; the collage method is pure image compositing and would port to Canvas in a Web Worker.
