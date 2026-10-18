# DJJS Nurmahal - TEMPORARY public HTTPS link for testing (no domain or Cloudflare account needed).
#     powershell -ExecutionPolicy Bypass -File deploy\public-test-link.ps1
# Prints an address like https://random-words.trycloudflare.com that works from any phone or network.
# The link changes every time and stops when you close this window - use it only for trying things out.
# For the permanent address use public-permanent.ps1 (needs a domain, see DEPLOY.md).
param([int]$Port = 5000)
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { Write-Host 'cloudflared not found: winget install Cloudflare.cloudflared (then open a new window)' -ForegroundColor Red; exit 1 }
Write-Host 'Starting a temporary public link - look for the https://....trycloudflare.com address below.' -ForegroundColor Cyan
Write-Host 'Keep this window open while testing. Press Ctrl+C to stop.' -ForegroundColor Cyan
& $cf tunnel --no-autoupdate --url "http://localhost:$Port"
