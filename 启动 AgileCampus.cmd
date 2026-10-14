@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-local.ps1" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
if errorlevel 1 (
  echo Failed to start AgileCampus.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3000"
endlocal
