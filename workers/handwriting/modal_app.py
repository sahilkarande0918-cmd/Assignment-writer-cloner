"""Cloud GPU for handwriting generation on Modal (https://modal.com), so users never run a worker themselves.

Deploy once, and again after changing worker code (see README.md):
  .venv\\Scripts\\modal secret create assignment-studio HW_API_URL=https://<your-app> HW_WORKER_TOKEN=<WORKER_TOKEN>
  .venv\\Scripts\\modal deploy modal_app.py
then set GPU_TRIGGER_URL on the server to the printed `trigger` URL.

trigger: HTTPS POST with `Authorization: Bearer <WORKER_TOKEN>`; spawns `drain` and returns at once.
drain:   on a GPU, loads the models and handles queued jobs through the normal worker API until none are left,
         then exits (scale to zero: no cost while idle).
Weights are downloaded from Hugging Face while the image is built (download_models.py), not uploaded from a PC.
"""
import hmac
import os

import modal
from fastapi import Header, HTTPException

APP_DIR = "/app"

gpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.11.0", "torchvision==0.26.0", "diffusers==0.42.1", "transformers==5.22.1", "accelerate==1.15.0",
        "safetensors==0.8.0", "huggingface_hub==2.4.0", "timm==1.0.30", "einops==0.8.2", "opencv-python-headless==5.0.0.93",
        "pillow==13.0.0", "numpy==2.4.6", "requests==2.34.2", "omegaconf", "sentencepiece", "protobuf",
    )
    .add_local_file("download_models.py", f"{APP_DIR}/download_models.py", copy=True)
    .run_commands(f"cd {APP_DIR} && python download_models.py")
    .add_local_dir(".", APP_DIR, ignore=["models", ".venv", "out", "tests", "**/__pycache__", "*.log"])
)
web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]")

app = modal.App("assignment-studio-handwriting")
secret = modal.Secret.from_name("assignment-studio")


# ponytail: max_containers caps spend (3 jobs at once); raise it when more students generate at the same time.
@app.function(image=gpu_image, gpu="L4", secrets=[secret], timeout=3600, max_containers=3, scaledown_window=60)
def drain():
    import sys

    os.environ.setdefault("HW_BATCH", "48")  # L4 has 24 GB; batch 16 peaks at ~1 GB
    sys.path.insert(0, APP_DIR)
    os.chdir(APP_DIR)
    import worker

    worker.serve(*worker.load(), drain=True)


@app.function(image=web_image, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def trigger(authorization: str = Header("")):
    token = os.environ["HW_WORKER_TOKEN"]
    if not hmac.compare_digest(authorization.removeprefix("Bearer "), token):
        raise HTTPException(status_code=401, detail="Invalid token.")
    drain.spawn()
    return {"started": True}
