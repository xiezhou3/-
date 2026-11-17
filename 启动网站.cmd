@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "APP_URL=http://localhost:3000"
set "DOCKER_DESKTOP=C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo.
echo ========================================
echo   AgileCampus Launcher
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not available in PATH.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  goto :failed
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker is not installed or not available in PATH.
  goto :failed
)

docker info >nul 2>&1
if errorlevel 1 (
  echo [1/4] Starting Docker Desktop...
  if exist "%DOCKER_DESKTOP%" (
    start "" "%DOCKER_DESKTOP%"
  ) else (
    start "" "Docker Desktop"
  )

  set /a DOCKER_WAIT=0
  :wait_for_docker
  docker info >nul 2>&1
  if not errorlevel 1 goto :docker_ready
  set /a DOCKER_WAIT+=1
  if !DOCKER_WAIT! GEQ 90 (
    echo [ERROR] Docker did not become ready within 3 minutes.
    echo Open Docker Desktop once, finish any WSL update prompt, then retry.
    goto :failed
  )
  timeout /t 2 /nobreak >nul
  goto :wait_for_docker
)

:docker_ready
echo [2/4] Starting PostgreSQL...
docker compose up -d
if errorlevel 1 (
  echo [WARN] PostgreSQL image could not be started.
  echo        Trying the configured mirror fallback...
  docker pull docker.m.daocloud.io/library/postgres:16
  if errorlevel 1 (
    echo [ERROR] Failed to download PostgreSQL.
    goto :failed
  )
  docker tag docker.m.daocloud.io/library/postgres:16 postgres:16
  docker compose up -d
  if errorlevel 1 (
    echo [ERROR] Failed to start PostgreSQL.
    goto :failed
  )
)

echo [3/4] Checking database schema...
call npm run db:push
if errorlevel 1 (
  echo [ERROR] Database schema synchronization failed.
  goto :failed
)

echo [4/4] Starting website...
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if errorlevel 1 (
  start "AgileCampus Dev Server" cmd /k "cd /d ""%~dp0"" && npm run dev"
) else (
  echo Website is already running.
)

echo Waiting for %APP_URL% ...
set /a WEB_WAIT=0
:wait_for_website
curl.exe -fsS --max-time 2 "%APP_URL%/login" >nul 2>&1
if not errorlevel 1 goto :website_ready
set /a WEB_WAIT+=1
if !WEB_WAIT! GEQ 60 (
  echo [WARN] Website is still starting. Check the AgileCampus Dev Server window.
  goto :launcher_done
)
timeout /t 1 /nobreak >nul
goto :wait_for_website

:website_ready
start "" "%APP_URL%"

:launcher_done
echo.
echo AgileCampus is ready:
echo %APP_URL%
echo.
echo Keep the "AgileCampus Dev Server" window open while using the website.
timeout /t 4 /nobreak >nul
exit /b 0

:failed
echo.
echo Startup failed. Review the messages above.
pause
exit /b 1
