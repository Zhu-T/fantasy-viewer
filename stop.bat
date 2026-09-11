@echo off
REM Stops the Fantasy Viewer server started by start.bat.
if "%FV_PORT%"=="" set FV_PORT=3000
powershell -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort %FV_PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique; if($p){ $p | ForEach-Object { Stop-Process -Id $_ -Force }; 'Stopped Fantasy Viewer.' } else { 'Fantasy Viewer is not running.' }"
