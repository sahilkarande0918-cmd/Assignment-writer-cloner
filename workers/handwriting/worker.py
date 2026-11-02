"""GPU worker. Outbound-only: polls the studio's HTTPS job API, never listens on a port.
Runs on Modal's cloud GPUs (modal_app.py, started per job) or on a local PC.

  .venv\\Scripts\\python worker.py --check        # CUDA / VRAM / model files report
  .venv\\Scripts\\python worker.py                # poll forever
  .venv\\Scripts\\python worker.py --once         # handle at most one job (tests)
  .venv\\Scripts\\python worker.py --drain        # handle jobs until the queue is empty, then exit

Env: HW_API_URL (e.g. http://localhost:3000 or https://your-app.vercel.app), HW_WORKER_TOKEN (= WORKER_TOKEN on the server).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import socket
import sys
import threading
import time

import requests

API = os.environ.get("HW_API_URL", "http://localhost:3000").rstrip("/")
TOKEN = os.environ.get("HW_WORKER_TOKEN", "")
WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"
VERSION = "hw-worker/1"


def http(method: str, path: str, **kw) -> requests.Response:
    headers = {"authorization": f"Bearer {TOKEN}", "x-worker-id": WORKER_ID, "x-worker-version": VERSION, **kw.pop("headers", {})}
    return requests.request(method, f"{API}{path}", headers=headers, timeout=kw.pop("timeout", 60), **kw)


def check() -> dict:
    import torch

    from hw.model import MODELS

    info = {"torch": torch.__version__, "cuda_build": torch.version.cuda, "cuda": torch.cuda.is_available()}
    if info["cuda"]:
        p = torch.cuda.get_device_properties(0)
        info |= {"gpu": p.name, "vram_gb": round(p.total_memory / 2**30, 1), "capability": f"{p.major}.{p.minor}"}
        try:
            torch.ones(1, device="cuda").add_(1)  # kernels exist for this architecture
            info["kernels"] = "ok"
        except Exception as e:  # e.g. no sm_120 kernels in an old build
            info["kernels"] = f"failed: {e}"
    need = ["diffusionpen/ema_ckpt.pt", "diffusionpen/iam_style_diffusionpen.pth", "sd15/vae/diffusion_pytorch_model.fp16.safetensors", "canine-c/config.json"]
    info["models_missing"] = [n for n in need if not (MODELS / n).exists()]
    return info


# Share of the overall progress bar per stage (start %, end %).
STAGES = {"Reading the handwriting reference": (0, 3), "Writing words": (3, 88), "Checking each word": (88, 93),
          "Laying out pages": (93, 96), "Uploading pages": (96, 100)}


class Heartbeat(threading.Thread):
    """Extends the lease and reports progress every few seconds; learns about cancellation from the reply."""

    def __init__(self, job_id: str):
        super().__init__(daemon=True)
        self.job_id, self.stop, self.cancelled = job_id, threading.Event(), False
        self.progress: dict = {"stage": "Starting", "percent": 0, "eta": None}
        self._stage, self._since = "", time.time()

    def update(self, stage: str, done: int, total: int):
        now = time.time()
        if stage != self._stage:
            self._stage, self._since = stage, now
        a, b = STAGES.get(stage, (0, 0))
        pct = a + (b - a) * (done / total if total else 0)
        eta = None
        if stage == "Writing words" and done:
            # remaining generation at the measured rate, plus ~12% for checking, layout and upload
            eta = round((now - self._since) / done * (total - done) * 1.12 + 5)
        self.progress = {"stage": stage, "done": done, "total": total, "percent": round(pct, 1), "eta": eta}

    def run(self):
        while True:
            try:
                r = http("POST", f"/api/worker/jobs/{self.job_id}/heartbeat", json={"progress": self.progress})
                self.cancelled = r.ok and r.json().get("cancelled", False)
            except requests.RequestException:
                pass  # transient; the lease covers short outages
            if self.stop.wait(4):
                return


def handle(job: dict, gen, reader=None) -> None:
    from hw.pipeline import run

    hb = Heartbeat(job["id"])
    hb.start()
    try:
        files = {}
        for name in job["inputs"]:
            r = http("GET", f"/api/worker/jobs/{job['id']}/inputs/{name}")
            r.raise_for_status()
            files[name] = r.content
        result = run(job["payload"], files, gen, reader=reader, candidates=int(job["payload"].get("candidates", 3)), progress=hb.update)
        if hb.cancelled:
            return
        artifacts = []
        outputs = [(f"page-{i + 1:02d}.png", p) for i, p in enumerate(result.pages)]
        outputs += [(f"ink-{i + 1:02d}.png", p) for i, p in enumerate(result.ink)]
        if result.paper is not None:
            outputs.append(("paper.png", result.paper))
        for i, (name, img) in enumerate(outputs):
            hb.update("Uploading pages", i, len(outputs))
            buf = io.BytesIO()
            img.save(buf, "PNG", optimize=True)
            data = buf.getvalue()
            digest = hashlib.sha256(data).hexdigest()
            r = http("PUT", f"/api/worker/jobs/{job['id']}/artifacts/{name}", data=data, headers={"content-type": "image/png", "x-sha256": digest}, timeout=120)
            r.raise_for_status()
            artifacts.append({"name": name, "sha256": digest, "bytes": len(data)})
        result.manifest["artifacts"] = artifacts
        http("POST", f"/api/worker/jobs/{job['id']}/complete", json={"manifest": result.manifest}).raise_for_status()
    except ValueError as e:  # input problems: not worth retrying
        http("POST", f"/api/worker/jobs/{job['id']}/fail", json={"error": str(e), "retryable": False})
    except Exception as e:  # GPU/OOM/network: let the server retry within its budget
        msg = "GPU ran out of memory." if "out of memory" in str(e).lower() else f"{type(e).__name__}: {e}"
        http("POST", f"/api/worker/jobs/{job['id']}/fail", json={"error": msg[:500], "retryable": True})
    finally:
        hb.stop.set()


def load():
    from hw.model import MODELS, Generator

    gen = Generator()
    reader = None
    if (MODELS / "trocr-small" / "pytorch_model.bin").exists():
        from hw.recognize import Reader

        reader = Reader()
    return gen, reader


def serve(gen, reader, once=False, drain=False, poll=5.0):
    """Claim and handle jobs. once: at most one job. drain: until the queue is empty."""
    print(f"worker {WORKER_ID} polling {API} with {gen.name} on {gen.device}; word check: {reader.name if reader else 'off'}")
    while True:
        try:
            r = http("POST", "/api/worker/claim", json={"model": gen.name, "device": gen.device})
            if r.status_code == 200:
                handle(r.json()["job"], gen, reader)
                if once:
                    return
                continue
            if r.status_code != 204:
                print(f"claim failed: {r.status_code} {r.text[:200]}")
            elif drain:
                return
        except requests.RequestException as e:
            print(f"server unreachable: {e}")
        if once:
            return
        time.sleep(poll)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--drain", action="store_true")
    ap.add_argument("--poll", type=float, default=5.0)
    a = ap.parse_args()
    info = check()
    print(json.dumps(info, indent=2))
    if a.check:
        return
    if not TOKEN:
        sys.exit("Set HW_WORKER_TOKEN to the server's WORKER_TOKEN.")
    if info["models_missing"]:
        sys.exit("Model files missing; run download_models.py first.")
    serve(*load(), once=a.once, drain=a.drain, poll=a.poll)


if __name__ == "__main__":
    main()
