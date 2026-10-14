param([int]$AppPort = 3000, [int]$DatabasePort = 5432)
$ErrorActionPreference = "SilentlyContinue"

$DataDir = $env:AGILECAMPUS_DATA_ROOT
if (-not $DataDir) {
  $DataDir = Join-Path $HOME "Documents\Codex\AgileCampusData"
}
$RuntimeDir = Join-Path $DataDir "runtime"
$PgData = Join-Path $DataDir "pgdata"
$PgBin = "C:\Users\Administrator.BF-202607151333\Documents\Codex\2026-09-16\g\runtime\pgsql\bin"
if (-not (Test-Path -LiteralPath (Join-Path $PgBin "pg_ctl.exe"))) {
  $PgBin = Split-Path -Parent (Get-Command pg_ctl -ErrorAction Stop).Source
}

$escapedAppPort = [regex]::Escape([string]$AppPort)
$listener = netstat -ano | Select-String -Pattern "0\.0\.0\.0:$escapedAppPort\s+.*LISTENING\s+(\d+)"
foreach ($match in $listener) {
  $processId = [int]$match.Matches[0].Groups[1].Value
  if ($processId -gt 0) {
    Stop-Process -Id $processId -Force
  }
}

$pgCtl = Join-Path $PgBin "pg_ctl.exe"
if (Test-Path -LiteralPath $pgCtl) {
  & $pgCtl -D $PgData -m fast -w stop | Out-Null
}

$escapedDatabasePort = [regex]::Escape([string]$DatabasePort)
$stillListening = netstat -ano | Select-String -Pattern "127\.0\.0\.1:$escapedDatabasePort\s+.*LISTENING"
if ($stillListening) {
  $pidPath = Join-Path $RuntimeDir "postgres.pid"
  if (Test-Path -LiteralPath $pidPath) {
    $processId = Get-Content -LiteralPath $pidPath -First 1
    if ($processId) {
      Stop-Process -Id ([int]$processId) -Force
    }
  }
}

Write-Host "AgileCampus local services stopped."
