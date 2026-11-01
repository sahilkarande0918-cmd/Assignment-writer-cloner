# Research log

Claims are marked **verified** only after checking the source in this project. Phase 4 completes the handwriting section.

## Handwriting generation candidates (to verify in phase 4)
| Repo | Role | Status |
|---|---|---|
| peterzat/reforge | reference-to-writing pipeline on DiffusionPen | unverified |
| koninik/DiffusionPen | official PyTorch model + weights | unverified (weights/dataset terms pending) |
| awei669/DiffInk | online-trajectory research alternative | unverified |
| jingyaogong/minimind | small LLM training — not a handwriting generator | excluded (ADR-008) |

## Datasets (no automatic downloads)
IAM, CVL, RIMES, Bentham — licences/consent to be checked before any use; none downloaded.

## Hardware (verified 2026-11-01)
`nvidia-smi`: NVIDIA GeForce RTX 5050 Laptop GPU, 8151 MiB, driver 616.64. Blackwell (sm_120) needs a CUDA 12.8+ PyTorch build — to confirm in phase 4.
Python available: 3.11 (64-bit), 3.13, 3.14.

## Groq (verified 2026-11-01 via models API, `node --env-file=.env.local scripts/groq-check.mjs`)
`openai/gpt-oss-20b` ✅, `openai/gpt-oss-120b` ✅, `qwen/qwen3.8-27b` ✅ (only vision-capable model on the account). Strict `json_schema` responses worked for gpt-oss-20b in 10/10 live runs. gpt-oss spends completion tokens on hidden reasoning (≈600 tokens for a small request), so `max_completion_tokens` is 8192.
