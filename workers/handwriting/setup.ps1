# One-time setup for the local GPU handwriting worker (Windows PowerShell).
# Usage:  powershell -ExecutionPolicy Bypass -File workers\handwriting\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1. GPU + driver check (RTX 50-series needs a driver supporting CUDA 12.8+).
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
} else {
    Write-Warning "nvidia-smi not found: no NVIDIA driver. The worker will run on CPU (very slow)."
}

# 2. Python 3.11 virtual environment.
if (-not (Test-Path .venv)) { py -3.11 -m venv .venv }
$py = ".\.venv\Scripts\python.exe"
& $py -m pip install --upgrade pip

# 3. PyTorch with CUDA 12.8 kernels (required for sm_120 / RTX 50-series), then the pinned rest.
& $py -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
& $py -m pip install -r requirements.lock.txt --extra-index-url https://download.pytorch.org/whl/cu128

# 4. Model files (~1.1 GB): DiffusionPen EMA + style encoder, SD-1.5 VAE fp16, CANINE config, TrOCR-small.
& $py download_models.py

# 5. Verify CUDA kernels and model files.
& $py worker.py --check
Write-Host "`nSetup done. Start the worker with:  .\run-worker.ps1 -Api http://localhost:3000"
