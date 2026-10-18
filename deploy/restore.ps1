# DJJS Nurmahal - restore the database from a backup made by backup.ps1.
# REPLACES ALL CURRENT DATA. Run in an administrator PowerShell:
#     powershell -ExecutionPolicy Bypass -File deploy\restore.ps1 -File deploy\backups\nurmahal-2026-10-15_0200.archive.gz
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $File)) { Write-Host "Backup file not found: $File" -ForegroundColor Red; exit 1 }
$uri = 'mongodb://127.0.0.1:27017/noormahal'
$m = [regex]::Match((Get-Content (Join-Path $Root 'server\.env') -Raw), '(?m)^MONGODB_URI=(.+)$'); if ($m.Success) { $uri = $m.Groups[1].Value.Trim() }
$restore = (Get-Command mongorestore -ErrorAction SilentlyContinue).Source
if (-not $restore) { $restore = Get-ChildItem 'C:\Program Files\MongoDB\Tools' -Recurse -Filter mongorestore.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
if (-not $restore) { Write-Host 'mongorestore not found: winget install MongoDB.DatabaseTools' -ForegroundColor Red; exit 1 }

Write-Host "This will REPLACE all current data with the backup $File" -ForegroundColor Yellow
if ((Read-Host 'Type YES to continue') -ne 'YES') { Write-Host 'Cancelled.'; exit 0 }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup.ps1') | Out-Null   # safety copy of the current data first
Stop-Service DJJS-Nurmahal -ErrorAction SilentlyContinue
& $restore --uri="$uri" --gzip --archive="$File" --drop --quiet
$ok = $LASTEXITCODE -eq 0
Start-Service DJJS-Nurmahal -ErrorAction SilentlyContinue
if ($ok) { Write-Host 'Restore complete.' -ForegroundColor Green } else { Write-Host 'Restore FAILED - the previous data was backed up just before.' -ForegroundColor Red; exit 1 }
