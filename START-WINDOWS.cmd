@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)
echo Starting DEADSHIFT. Keep this window open.
echo Open http://localhost:5173 in your browser.
node scripts/serve.mjs
pause
