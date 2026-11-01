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

## Groq (to verify in phase 2 with a key)
Models from master prompt: `openai/gpt-oss-20b` (default), `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` (vision). Availability must be checked via the models API at setup.
