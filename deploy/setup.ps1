# DJJS Nurmahal - one-time production setup on this Windows PC.
# Run in an ADMINISTRATOR PowerShell from the project folder:
#     powershell -ExecutionPolicy Bypass -File deploy\setup.ps1
# What it does (safe to run again):
#   1. installs NSSM (Windows service manager), MongoDB Database Tools (backups) and cloudflared (public access)
#   2. prepares server\.env for production (strong secret, no sample data)
#   3. installs packages and builds the web app
#   4. installs the app as a Windows service "DJJS-Nurmahal" (starts with Windows, restarts if it crashes)
#   5. opens the port for the office network only (not for public Wi-Fi)
#   6. schedules a daily database backup at 02:00
#   7. stops the PC from sleeping while plugged in (it must stay on 24/7)
param([int]$Port = 5000, [string]$BackupTime = '02:00')
$ErrorActionPreference = 'Stop'
$Service = 'DJJS-Nurmahal'
$Root = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $Root 'server'
$EnvFile = Join-Path $Server '.env'
$Logs = Join-Path $PSScriptRoot 'logs'

function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "    $t" -ForegroundColor Green }
function Warn($t) { Write-Host "    $t" -ForegroundColor Yellow }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host 'Please run this script in PowerShell opened with "Run as administrator".' -ForegroundColor Red; exit 1 }

Step 'Checking Node.js and MongoDB'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'Node.js is not installed (winget install OpenJS.NodeJS.LTS).' -ForegroundColor Red; exit 1 }
Ok "Node.js $(& $node -v) at $node"
$mongo = Get-Service MongoDB -ErrorAction SilentlyContinue
if (-not $mongo) { Write-Host 'MongoDB service not found (winget install MongoDB.Server).' -ForegroundColor Red; exit 1 }
if ($mongo.Status -ne 'Running') { Start-Service MongoDB }
Set-Service MongoDB -StartupType Automatic
Ok 'MongoDB service is running and starts with Windows'

Step 'Installing tools (NSSM, MongoDB Database Tools, cloudflared)'
foreach ($id in 'NSSM.NSSM', 'MongoDB.DatabaseTools', 'Cloudflare.cloudflared') {
  winget list --id $id --exact --accept-source-agreements | Out-Null
  if ($LASTEXITCODE -ne 0) { winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements | Out-Null; Ok "installed $id" } else { Ok "$id already installed" }
}
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $nssm) { $nssm = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1 -ExpandProperty FullName }
if (-not $nssm) { Write-Host 'nssm.exe not found after install. Close this window, open a new administrator PowerShell and run the script again.' -ForegroundColor Red; exit 1 }

Step 'Preparing server\.env for production'
if (-not (Test-Path $EnvFile)) { Copy-Item (Join-Path $Server '.env.example') $EnvFile }
$envText = Get-Content $EnvFile -Raw
function Set-EnvVar([string]$name, [string]$value) {
  if ($script:envText -match "(?m)^#?\s*$name=.*$") { $script:envText = $script:envText -replace "(?m)^#?\s*$name=.*$", "$name=$value" }
  else { $script:envText = $script:envText.TrimEnd() + "`r`n$name=$value`r`n" }
}
$secret = ([regex]::Match($envText, '(?m)^JWT_SECRET=(.*)$')).Groups[1].Value.Trim()
if ($secret.Length -lt 32 -or $secret -match 'change-me') {
  $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  Set-EnvVar 'JWT_SECRET' (($bytes | ForEach-Object { $_.ToString('x2') }) -join ''); Ok 'generated a new random JWT_SECRET'
}
Set-EnvVar 'SEED_ON_EMPTY' 'false'
Set-EnvVar 'PORT' "$Port"
$envText = $envText -replace '(?m)^CORS_ORIGIN=', '# CORS_ORIGIN='   # not needed: the app and API share one address
Set-Content -Path $EnvFile -Value $envText -Encoding ASCII
Ok 'SEED_ON_EMPTY=false, PORT set, CORS disabled (same-origin)'

Step 'Installing packages and building the web app'
Push-Location $Root
try {
  npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed' }
  npm install --prefix server --omit=dev --no-audit --no-fund; if ($LASTEXITCODE) { throw 'server install failed' }
  npm install --prefix client --no-audit --no-fund; if ($LASTEXITCODE) { throw 'client install failed' }
  npm run build; if ($LASTEXITCODE) { throw 'build failed' }
} finally { Pop-Location }
Ok 'client\dist built'

Step "Installing Windows service $Service"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
if (Get-Service $Service -ErrorAction SilentlyContinue) { & $nssm stop $Service | Out-Null; & $nssm remove $Service confirm | Out-Null }
& $nssm install $Service $node '--env-file=.env' 'src/index.js' | Out-Null
& $nssm set $Service AppDirectory $Server | Out-Null
& $nssm set $Service AppEnvironmentExtra 'NODE_ENV=production' | Out-Null
& $nssm set $Service DisplayName 'DJJS Nurmahal - Sewadar & Accommodation' | Out-Null
& $nssm set $Service Description 'DJJS Nurmahal web app (Node.js). Serves the office network and the Cloudflare tunnel.' | Out-Null
& $nssm set $Service Start SERVICE_AUTO_START | Out-Null
& $nssm set $Service DependOnService MongoDB | Out-Null
& $nssm set $Service AppExit Default Restart | Out-Null
& $nssm set $Service AppRestartDelay 5000 | Out-Null
& $nssm set $Service AppStdout (Join-Path $Logs 'server.log') | Out-Null
& $nssm set $Service AppStderr (Join-Path $Logs 'server.log') | Out-Null
& $nssm set $Service AppRotateFiles 1 | Out-Null
& $nssm set $Service AppRotateOnline 1 | Out-Null
& $nssm set $Service AppRotateBytes 10485760 | Out-Null
& $nssm start $Service | Out-Null
$up = $false
for ($i = 0; $i -lt 30 -and -not $up; $i++) { Start-Sleep 1; try { $up = (Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 2).ok } catch {} }
if (-not $up) { Write-Host "The service did not answer. See $Logs\server.log" -ForegroundColor Red; exit 1 }
Ok "service running on port $Port"

Step 'Office network access (Windows Firewall)'
Get-NetFirewallRule -DisplayName 'DJJS Nurmahal (office network)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'DJJS Nurmahal (office network)' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Domain, Private | Out-Null
Ok "port $Port open on Private/Domain networks only"
$public = Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public'
if ($public) { Warn "This PC's network '$($public.Name -join ', ')' is marked Public, so office devices cannot connect yet. If this is the office network, run:"; Warn "    Set-NetConnectionProfile -Name '$($public[0].Name)' -NetworkCategory Private" }

Step "Daily database backup at $BackupTime"
$backup = Join-Path $PSScriptRoot 'backup.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backup`""
$trigger = New-ScheduledTaskTrigger -Daily -At $BackupTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'DJJS-Nurmahal-Backup' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Ok "scheduled task DJJS-Nurmahal-Backup (keeps 30 days in deploy\backups)"
& powershell -NoProfile -ExecutionPolicy Bypass -File $backup | Out-Null
Ok 'first backup taken'

Step 'Keeping the PC awake while plugged in'
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Ok 'sleep and hibernate disabled on AC power'

Step 'Done'
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | Select-Object -ExpandProperty IPAddress
Write-Host "  Office network address(es):" -ForegroundColor Green
$ips | ForEach-Object { Write-Host "      http://$($_):$Port" -ForegroundColor Green }
Write-Host "  Next: public access - see deploy\DEPLOY.md (step 4)." -ForegroundColor Green
