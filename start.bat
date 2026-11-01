@echo off
setlocal
cd /d "%~dp0"

rem Clear the host variable that makes Electron run in pure Node mode.
set "ELECTRON_RUN_AS_NODE="

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo [ERROR] Electron runtime not found. Please keep node_modules complete.
  pause
  exit /b 1
)

start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
endlocal