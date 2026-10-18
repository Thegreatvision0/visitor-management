# DJJS Nurmahal - PERMANENT public address through a Cloudflare Tunnel (runs as a Windows service).
# First create the tunnel in the Cloudflare dashboard and copy its token (see deploy\DEPLOY.md, step 4B). Then,
# in an administrator PowerShell:
#     powershell -ExecutionPolicy Bypass -File deploy\public-permanent.ps1 -Token eyJhIjoi...
param([Parameter(Mandatory = $true)][string]$Token)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host 'Please run this in PowerShell opened with "Run as administrator".' -ForegroundColor Red; exit 1 }
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { Write-Host 'cloudflared not found: winget install Cloudflare.cloudflared (then open a new window)' -ForegroundColor Red; exit 1 }
if (Get-Service cloudflared -ErrorAction SilentlyContinue) { & $cf service uninstall | Out-Null; Start-Sleep 2 }
& $cf service install $Token
Start-Sleep 3
$s = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($s -and $s.Status -eq 'Running') { Set-Service cloudflared -StartupType Automatic; Write-Host 'Cloudflare Tunnel service installed and running. It starts with Windows.' -ForegroundColor Green }
else { Write-Host 'The cloudflared service did not start - check the token and the Cloudflare dashboard.' -ForegroundColor Red; exit 1 }
