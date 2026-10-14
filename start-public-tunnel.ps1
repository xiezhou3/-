param([int]$AppPort = 3000)
$ErrorActionPreference = "Stop"

$BaseDir = $PSScriptRoot
$LocalDir = Join-Path $BaseDir "local"
$DataDir = $env:AGILECAMPUS_DATA_ROOT
if (-not $DataDir) {
  $DataDir = Join-Path $HOME "Documents\Codex\AgileCampusData"
}
$RuntimeDir = Join-Path $DataDir "runtime"
$Cloudflared = Join-Path $RuntimeDir "cloudflared.exe"
if (-not (Test-Path -LiteralPath $Cloudflared)) {
  $Cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Force -Path $LocalDir, $RuntimeDir | Out-Null
& (Join-Path $BaseDir "stop-local.ps1") -AppPort $AppPort
& (Join-Path $BaseDir "start-local.ps1") -AppPort $AppPort

$pidPath = Join-Path $LocalDir "cloudflared.pid"
$urlPath = Join-Path $LocalDir "public-url.txt"
$outLog = Join-Path $RuntimeDir "cloudflared.out.log"
$errLog = Join-Path $RuntimeDir "cloudflared.err.log"

if (Test-Path -LiteralPath $pidPath) {
  $existing = Get-Content -LiteralPath $pidPath -First 1
  if ($existing -and (Get-Process -Id ([int]$existing) -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath $urlPath) {
      Write-Host "Public URL: $(Get-Content -LiteralPath $urlPath -First 1)"
    }
    exit 0
  }
}

$process = Start-Process -FilePath $Cloudflared `
  -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$AppPort", "--no-autoupdate", "--protocol", "http2") `
  -WorkingDirectory $RuntimeDir `
  -WindowStyle Hidden `
  -PassThru `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog
Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII

$deadline = (Get-Date).AddSeconds(30)
$publicUrl = $null
while ((Get-Date) -lt $deadline -and -not $publicUrl) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $errLog) {
    $match = [regex]::Match((Get-Content -LiteralPath $errLog -Raw), "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      $publicUrl = $match.Value
    }
  }
}

if (-not $publicUrl) {
  throw "Cloudflare public URL was not created."
}
Set-Content -LiteralPath $urlPath -Value $publicUrl -Encoding ASCII
Write-Host "Public URL: $publicUrl"
