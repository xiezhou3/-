param([int]$DatabasePort = 5432, [int]$AppPort = 3000)
$ErrorActionPreference = "Stop"

$BaseDir = $PSScriptRoot
$LocalDir = Join-Path $BaseDir "local"
$DataDir = $env:AGILECAMPUS_DATA_ROOT
if (-not $DataDir) {
  $DataDir = Join-Path $HOME "Documents\Codex\AgileCampusData"
}
$RuntimeDir = Join-Path $DataDir "runtime"
$PgData = Join-Path $DataDir "pgdata"
$DatabaseUrl = "postgres://postgres@127.0.0.1:$DatabasePort/agilecampus"
$Patch = Join-Path $BaseDir "scripts\patch-os-userinfo.cjs"
$RestoreScript = Join-Path $BaseDir "scripts\restore-backup.mjs"

$NodeExe = "C:\Users\Administrator.BF-202607151333\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path -LiteralPath $NodeExe)) {
  $NodeExe = (Get-Command node -ErrorAction Stop).Source
}

$PnpmCmd = "C:\Users\Administrator.BF-202607151333\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if (-not (Test-Path -LiteralPath $PnpmCmd)) {
  $PnpmCmd = (Get-Command pnpm -ErrorAction Stop).Source
}

$PgBin = "C:\Users\Administrator.BF-202607151333\Documents\Codex\2026-09-16\g\runtime\pgsql\bin"
if (-not (Test-Path -LiteralPath (Join-Path $PgBin "pg_ctl.exe"))) {
  $PgBin = Split-Path -Parent (Get-Command pg_ctl -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Force -Path $LocalDir, $RuntimeDir | Out-Null

function Test-TcpPort([string]$HostName, [int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    return $async.AsyncWaitHandle.WaitOne(300) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort $HostName $Port) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for $HostName`:$Port"
}

function Normalize-Path {
  $value = [Environment]::GetEnvironmentVariable("Path", "Process")
  $nodeDir = Split-Path -Parent $NodeExe
  [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
  [Environment]::SetEnvironmentVariable("Path", "$nodeDir;$value", "Process")
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

function Ensure-Postgres {
  $freshDatabase = $false
  if (-not (Test-TcpPort "127.0.0.1" $DatabasePort)) {
    if (-not (Test-Path -LiteralPath (Join-Path $PgData "PG_VERSION"))) {
      New-Item -ItemType Directory -Force -Path $PgData | Out-Null
      & (Join-Path $PgBin "initdb.exe") -D $PgData -U postgres -A trust -E UTF8 --no-locale | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed." }
    }
    $postgresExe = Join-Path $PgBin "postgres.exe"
    $postgresOut = Join-Path $RuntimeDir "postgres.out.log"
    $postgresErr = Join-Path $RuntimeDir "postgres.err.log"
    $postgresProcess = Start-Process -FilePath $postgresExe `
      -ArgumentList @("-D", $PgData, "-p", $DatabasePort, "-h", "127.0.0.1") `
      -WorkingDirectory $PgData `
      -WindowStyle Hidden `
      -PassThru `
      -RedirectStandardOutput $postgresOut `
      -RedirectStandardError $postgresErr
    Set-Content -LiteralPath (Join-Path $RuntimeDir "postgres.pid") -Value $postgresProcess.Id -Encoding ASCII
    Wait-TcpPort "127.0.0.1" $DatabasePort
  }

  $hasDb = & (Join-Path $PgBin "psql.exe") `
    -h 127.0.0.1 `
    -p $DatabasePort `
    -U postgres `
    -tAc "select 1 from pg_database where datname='agilecampus'"
  if ($hasDb.Trim() -ne "1") {
    & (Join-Path $PgBin "createdb.exe") -h 127.0.0.1 -p $DatabasePort -U postgres agilecampus
    if ($LASTEXITCODE -ne 0) { throw "Failed to create database." }
    $freshDatabase = $true
  }

  Push-Location $BaseDir
  try {
    & $PnpmCmd db:push
    if ($LASTEXITCODE -ne 0) { throw "Schema push failed." }
  } finally {
    Pop-Location
  }

  if ($freshDatabase) {
    $backupCandidates = @(
      (Join-Path $DataDir "backup\agilecampus-data-backup.json"),
      (Join-Path $DataDir "local\agilecampus-data-backup.json")
    )
    $backup = $backupCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($backup) {
      & $NodeExe $RestoreScript $backup
      if ($LASTEXITCODE -ne 0) { throw "Data restore failed." }
    }
  }
}

function Ensure-App {
  $nextCli = Join-Path $BaseDir "node_modules\next\dist\bin\next"
  $drizzleCli = Join-Path $BaseDir "node_modules\drizzle-kit\bin.cjs"
  if ((Test-Path -LiteralPath $nextCli) -and (Test-Path -LiteralPath $drizzleCli)) {
    return
  }

  $movedNodeModules = $null
  if (Test-Path -LiteralPath (Join-Path $BaseDir "node_modules")) {
    $movedNodeModules = Join-Path $BaseDir ("node_modules_broken_" + (Get-Date -Format "yyyyMMddHHmmss"))
    Rename-Item -LiteralPath (Join-Path $BaseDir "node_modules") -NewName (Split-Path -Leaf $movedNodeModules)
  }

  Push-Location $BaseDir
  try {
    & $PnpmCmd install --prefer-offline
    $installExit = $LASTEXITCODE
    & $PnpmCmd approve-builds --all
    $approveExit = $LASTEXITCODE
    if ($installExit -ne 0 -and $approveExit -ne 0) {
      throw "Dependency installation failed."
    }
  } finally {
    Pop-Location
  }

  if ($movedNodeModules -and (Test-Path -LiteralPath $nextCli) -and (Test-Path -LiteralPath $drizzleCli)) {
    Remove-Item -LiteralPath $movedNodeModules -Recurse -Force
  }
}

Normalize-Path
Import-DotEnv (Join-Path $DataDir "app\.env")
Import-DotEnv (Join-Path $BaseDir ".env")
$env:NODE_OPTIONS = "--require=$Patch --use-system-ca"
Ensure-App
Ensure-Postgres

$env:DATABASE_URL = $DatabaseUrl
$env:AUTH_TRUST_HOST = "true"

if (-not (Test-TcpPort "127.0.0.1" $AppPort)) {
  $next = Join-Path $BaseDir "node_modules\next\dist\bin\next"
  Start-Process -FilePath $NodeExe `
    -ArgumentList @($next, "dev", "-H", "0.0.0.0", "-p", $AppPort) `
    -WorkingDirectory $BaseDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $RuntimeDir "next.out.log") `
    -RedirectStandardError (Join-Path $RuntimeDir "next.err.log") | Out-Null
  Wait-TcpPort "127.0.0.1" $AppPort
}

Write-Host "AgileCampus is running: http://127.0.0.1:$AppPort"
Write-Host "LAN access: http://<this-computer-ip>:$AppPort"
