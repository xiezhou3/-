param(
  [int]$AppPort = 3000,
  [int]$DatabasePort = 5432
)

$ErrorActionPreference = "Stop"
$BaseDir = $PSScriptRoot
$RuntimeDir = Join-Path $BaseDir ".runtime"
$DataRoot = $env:AGILECAMPUS_DATA_ROOT
if (-not $DataRoot) {
  $DataRoot = Join-Path $HOME "Documents\Codex\AgileCampusData"
}
$PgData = Join-Path $DataRoot "pgdata"
$DatabaseName = if ($env:AGILECAMPUS_DB_NAME) {
  $env:AGILECAMPUS_DB_NAME
} else {
  "agilecampus_plus"
}
$DatabaseUrl = "postgres://postgres@127.0.0.1:$DatabasePort/$DatabaseName"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    return $async.AsyncWaitHandle.WaitOne(350) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-TcpPort(
  [string]$HostName,
  [int]$Port,
  [int]$TimeoutSeconds = 30
) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort $HostName $Port) { return }
    Start-Sleep -Milliseconds 400
  }
  throw "Timed out waiting for $HostName`:$Port"
}

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Find-PostgresBin {
  $candidates = @(
    $env:AGILECAMPUS_PG_BIN,
    "C:\Users\Administrator.BF-202607151333\Documents\Codex\2026-09-16\g\runtime\pgsql\bin",
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin"
  ) | Where-Object { $_ }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate "pg_ctl.exe")) {
      return $candidate
    }
  }
  $pgCtl = Get-Command pg_ctl -ErrorAction SilentlyContinue
  if ($pgCtl) { return Split-Path -Parent $pgCtl.Source }
  throw "PostgreSQL tools were not found. Set AGILECAMPUS_PG_BIN to the PostgreSQL bin directory."
}

Import-DotEnv (Join-Path $DataRoot "app\.env")
$LocalEnv = Join-Path $BaseDir ".env.local"
if (-not (Test-Path -LiteralPath $LocalEnv) -and -not $env:AUTH_SECRET) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $secret = [Convert]::ToBase64String($bytes)
  Set-Content -LiteralPath $LocalEnv -Encoding utf8 -Value @(
    "# Generated locally by start-local.ps1",
    "AUTH_SECRET=$secret"
  )
}
Import-DotEnv $LocalEnv

if (-not (Test-TcpPort "127.0.0.1" $DatabasePort)) {
  $PgBin = Find-PostgresBin
  New-Item -ItemType Directory -Force -Path $PgData | Out-Null
  if (-not (Test-Path -LiteralPath (Join-Path $PgData "PG_VERSION"))) {
    & (Join-Path $PgBin "initdb.exe") -D $PgData -U postgres -A trust -E UTF8 --no-locale | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed." }
  }
  & (Join-Path $PgBin "pg_ctl.exe") `
    -D $PgData `
    -l (Join-Path $RuntimeDir "postgres.log") `
    -o "-p $DatabasePort -h 127.0.0.1" `
    start | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start." }
  Wait-TcpPort "127.0.0.1" $DatabasePort
}

$PgBin = Find-PostgresBin
$hasDb = & (Join-Path $PgBin "psql.exe") `
  -h 127.0.0.1 `
  -p $DatabasePort `
  -U postgres `
  -tAc "select 1 from pg_database where datname='$DatabaseName'"
if (-not $hasDb -or $hasDb.Trim() -ne "1") {
  & (Join-Path $PgBin "createdb.exe") `
    -h 127.0.0.1 `
    -p $DatabasePort `
    -U postgres `
    $DatabaseName
  if ($LASTEXITCODE -ne 0) { throw "Failed to create database $DatabaseName." }
}

$env:DATABASE_URL = $DatabaseUrl
$env:AUTH_TRUST_HOST = "true"
$env:FILE_STORAGE_ROOT = Join-Path $BaseDir "storage"

$node = Get-Command node -ErrorAction Stop
$npm = Get-Command npm.cmd -ErrorAction Stop
Push-Location $BaseDir
try {
  if (-not (Test-Path -LiteralPath (Join-Path $BaseDir "node_modules\next"))) {
    & $npm.Source ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
  }

  & $npm.Source run db:push
  if ($LASTEXITCODE -ne 0) { throw "Database schema synchronization failed." }

  if (-not (Test-TcpPort "127.0.0.1" $AppPort)) {
    $next = Join-Path $BaseDir "node_modules\next\dist\bin\next"
    Start-Process `
      -FilePath $node.Source `
      -ArgumentList @($next, "dev", "-H", "0.0.0.0", "-p", $AppPort) `
      -WorkingDirectory $BaseDir `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $RuntimeDir "next.out.log") `
      -RedirectStandardError (Join-Path $RuntimeDir "next.err.log") | Out-Null
    Wait-TcpPort "127.0.0.1" $AppPort 60
  }
} finally {
  Pop-Location
}

$url = "http://127.0.0.1:$AppPort/login"
Write-Host "AgileCampus is running: $url"
Start-Process $url
