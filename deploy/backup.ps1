# DJJS Nurmahal - database backup (run daily by the scheduled task "DJJS-Nurmahal-Backup").
# Manual run:  powershell -ExecutionPolicy Bypass -File deploy\backup.ps1
# Keeps the last $KeepDays days of backups in deploy\backups. Copy that folder to another disk
# or cloud drive regularly - a backup on the same PC does not protect against disk failure or theft.
param([int]$KeepDays = 30, [string]$Dest = (Join-Path $PSScriptRoot 'backups'))
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root 'server\.env'
$uri = 'mongodb://127.0.0.1:27017/noormahal'
if (Test-Path $EnvFile) { $m = [regex]::Match((Get-Content $EnvFile -Raw), '(?m)^MONGODB_URI=(.+)$'); if ($m.Success) { $uri = $m.Groups[1].Value.Trim() } }

$dump = (Get-Command mongodump -ErrorAction SilentlyContinue).Source
if (-not $dump) { $dump = Get-ChildItem 'C:\Program Files\MongoDB\Tools' -Recurse -Filter mongodump.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
if (-not $dump) { Write-Host 'mongodump not found: winget install MongoDB.DatabaseTools' -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$file = Join-Path $Dest ('nurmahal-' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.archive.gz')
& $dump --uri="$uri" --gzip --archive="$file" --quiet
if ($LASTEXITCODE -ne 0) { Write-Host 'Backup FAILED' -ForegroundColor Red; exit 1 }
Get-ChildItem $Dest -Filter 'nurmahal-*.archive.gz' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force
Write-Host "Backup saved: $file ($([math]::Round((Get-Item $file).Length / 1KB)) KB)"
