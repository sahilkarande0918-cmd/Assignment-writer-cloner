"""Download only the files inference needs (~860 MB) into models/ and record their hashes.

Usage: .venv\\Scripts\\python download_models.py
Licences: DiffusionPen weights MIT (trained on IAM: non-commercial research data), SD-1.5 VAE CreativeML
OpenRAIL-M (use restrictions incl. no impersonation without consent), CANINE-c Apache-2.0 (config/tokenizer only).
"""
import hashlib
import json
from pathlib import Path

from huggingface_hub import snapshot_download

MODELS = Path(__file__).resolve().parent / "models"
SOURCES = {
    "diffusionpen": ("konnik/DiffusionPen", ["diffusionpen_iam_model_path/models/ema_ckpt.pt", "style_models/iam_style_diffusionpen.pth"]),
    "sd15": ("stable-diffusion-v1-5/stable-diffusion-v1-5", ["vae/config.json", "vae/diffusion_pytorch_model.fp16.safetensors", "scheduler/scheduler_config.json", "model_index.json"]),
    # CANINE weights are already inside the DiffusionPen checkpoint; only config + tokenizer are needed.
    "canine-c": ("google/canine-c", ["config.json", "special_tokens_map.json", "tokenizer_config.json"]),
    # Word checker for best-of-N selection (MIT per microsoft/unilm; fine-tuned on IAM).
    "trocr-small": ("microsoft/trocr-small-handwritten", ["config.json", "generation_config.json", "preprocessor_config.json", "pytorch_model.bin", "sentencepiece.bpe.model", "special_tokens_map.json", "tokenizer_config.json"]),
}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    manifest = {}
    for name, (repo, files) in SOURCES.items():
        target = MODELS / name
        snapshot_download(repo, allow_patterns=files, local_dir=target)
        manifest[name] = {"repo": repo, "files": {}}
        for f in files:
            p = target / f
            if not p.exists():
                continue  # optional file absent upstream
            manifest[name]["files"][f] = {"bytes": p.stat().st_size, "sha256": sha256(p)}
    # DiffusionPen's code expects flat names; keep them simple for the loader.
    dp = MODELS / "diffusionpen"
    for src, dst in [("diffusionpen_iam_model_path/models/ema_ckpt.pt", "ema_ckpt.pt"), ("style_models/iam_style_diffusionpen.pth", "iam_style_diffusionpen.pth")]:
        if (dp / src).exists() and not (dp / dst).exists():
            (dp / src).rename(dp / dst)
    (MODELS / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
