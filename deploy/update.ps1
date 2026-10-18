# DJJS Nurmahal - apply a new version of the code (after copying the updated project files here).
# Run in an administrator PowerShell:  powershell -ExecutionPolicy Bypass -File deploy\update.ps1
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup.ps1')   # backup before every update
Push-Location $Root
try {
  npm install --prefix server --omit=dev --no-audit --no-fund; if ($LASTEXITCODE) { throw 'server install failed' }
  npm install --prefix client --no-audit --no-fund; if ($LASTEXITCODE) { throw 'client install failed' }
  npm run build; if ($LASTEXITCODE) { throw 'build failed - the running version was not changed' }
} finally { Pop-Location }
Restart-Service DJJS-Nurmahal
Start-Sleep 3
try { if ((Invoke-RestMethod 'http://localhost:5000/api/health' -TimeoutSec 5).ok) { Write-Host 'Updated and running.' -ForegroundColor Green } }
catch { Write-Host 'Service restarted but is not answering yet - check deploy\logs\server.log' -ForegroundColor Yellow }
