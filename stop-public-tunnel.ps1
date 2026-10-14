$BaseDir = $PSScriptRoot
$pidPath = Join-Path $BaseDir "local\cloudflared.pid"

if (Test-Path -LiteralPath $pidPath) {
  $processId = Get-Content -LiteralPath $pidPath -First 1
  if ($processId) {
    Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Public tunnel stopped."
