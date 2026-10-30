@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo First run the setup commands in README.md.
  pause
  exit /b 1
)
if not exist "frontend\dist\index.html" (
  echo First run npm ci and npm run build in the frontend folder.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8001 in Chrome. Press Ctrl+C here to stop.
".venv\Scripts\python.exe" -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
