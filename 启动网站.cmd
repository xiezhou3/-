@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
if errorlevel 1 (
  echo.
  echo AgileCampus failed to start. Review the message above.
  pause
  exit /b 1
)

timeout /t 2 /nobreak >nul
exit /b 0
