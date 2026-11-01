# Start the outbound-polling worker. The token must equal WORKER_TOKEN on the server.
# Usage:  .\run-worker.ps1 -Api https://your-app.vercel.app   (token read from ..\..\.env.local, or pass -Token)
param([string]$Api = "http://localhost:3000", [string]$Token = "")
Set-Location $PSScriptRoot
if (-not $Token) {
    $line = Get-Content ..\..\.env.local -ErrorAction SilentlyContinue | Where-Object { $_ -match '^WORKER_TOKEN=' }
    if ($line) { $Token = $line.Substring(13) }
}
if (-not $Token) { throw "No worker token: pass -Token or set WORKER_TOKEN in .env.local" }
$env:HW_API_URL = $Api
$env:HW_WORKER_TOKEN = $Token
.\.venv\Scripts\python.exe -u worker.py
