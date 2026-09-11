@echo off
setlocal
REM One-click launcher for Fantasy Viewer.
REM  - installs dependencies on first run
REM  - builds the production bundle when the source is newer than the last build
REM  - starts the server (or reuses one that's already running) and opens the page
REM
REM Usage:  start.bat            normal launch
REM         start.bat --rebuild  force a fresh production build
REM         set FV_PORT=4000 first to use a different port (default 3000)

cd /d "%~dp0"
if "%FV_PORT%"=="" set FV_PORT=3000
set URL=http://localhost:%FV_PORT%

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

REM Already running? Just open the page.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %FV_PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Fantasy Viewer is already running at %URL%
  start "" "%URL%"
  exit /b 0
)

if not exist "node_modules\" (
  echo Installing dependencies ^(first run only^)...
  call npm install || goto :fail
  echo Installing the browser used for ESPN login...
  call npx playwright install chromium || goto :fail
)

set NEED_BUILD=0
if /i "%~1"=="--rebuild" set NEED_BUILD=1
if not exist ".next\BUILD_ID" set NEED_BUILD=1
if "%NEED_BUILD%"=="0" (
  REM Rebuild if any source/config file is newer than the last build.
  powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID').LastWriteTime; $n=Get-ChildItem -Recurse -File -Path src,public,package.json,next.config.ts,tsconfig.json | Where-Object { $_.LastWriteTime -gt $b } | Select-Object -First 1; if ($n) { exit 1 } else { exit 0 }"
  if errorlevel 1 set NEED_BUILD=1
)
if "%NEED_BUILD%"=="1" (
  echo Building Fantasy Viewer...
  call npm run build || goto :fail
)

echo Starting Fantasy Viewer on %URL% ...
start "Fantasy Viewer (server)" /min cmd /k "npm run start -- --port %FV_PORT%"

REM Wait (up to ~20s) for the server to answer, then open the browser.
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){ try { Invoke-WebRequest -UseBasicParsing '%URL%/api/auth/status' -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
start "" "%URL%"
exit /b 0

:fail
echo.
echo Something went wrong. See the messages above.
pause
exit /b 1
