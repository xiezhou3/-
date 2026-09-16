@echo off
setlocal
title AgileCampus

cd /d "D:\agilecampus"

set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "PG_BIN=D:\PostgreSQL\16\pgsql\bin"
set "PG_DATA=D:\PostgreSQL\16\data"
set "PG_LOG=D:\PostgreSQL\16\postgres.log"

if not exist "%NPM_CMD%" (
  echo Node.js was not found. Install Node.js LTS first.
  pause
  exit /b 1
)

if not exist "%PG_BIN%\postgres.exe" (
  echo PostgreSQL was not found in D:\PostgreSQL\16.
  pause
  exit /b 1
)

set "PATH=C:\Program Files\nodejs;%PATH%"

echo Checking the database...
netstat -ano | findstr ":5432" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Starting the database...
  start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%PG_BIN%\postgres.exe' -ArgumentList '-D','%PG_DATA%','-p','5432' -WindowStyle Hidden -RedirectStandardError '%PG_LOG%'"
)

for /L %%I in (1,1,20) do (
  netstat -ano | findstr ":5432" | findstr "LISTENING" >nul
  if not errorlevel 1 goto database_ready
  timeout /t 1 /nobreak >nul
)

echo Database is not ready. Log: %PG_LOG%
pause
exit /b 1

:database_ready
echo Database is ready.

netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo The website is already running. Opening it now...
  start "" "http://localhost:3000"
  exit /b 0
)

echo Starting the website...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3000'"
call "%NPM_CMD%" run dev

echo.
echo The website has stopped.
pause
