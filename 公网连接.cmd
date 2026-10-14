@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public-tunnel.ps1"
if errorlevel 1 (
  echo Failed to start public tunnel.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%u in ("%~dp0local\public-url.txt") do start "" "%%u"
endlocal
