@echo off
setlocal

cd /d "C:\Users\admin\Desktop\ledger RS"

call :checkserver
if not errorlevel 1 goto openapp

start "Ramesh Sweets Ledger" powershell -NoExit -Command "Set-Location 'C:\Users\admin\Desktop\ledger RS'; C:\Python314\python.exe ledger_api.py"

for /l %%i in (1,1,15) do (
  call :checkserver
  if not errorlevel 1 goto openapp
  timeout /t 1 /nobreak >nul
)

:openapp
start "" http://localhost:8000/index.html?ts=%RANDOM%
exit /b 0

:checkserver
powershell -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %errorlevel%
