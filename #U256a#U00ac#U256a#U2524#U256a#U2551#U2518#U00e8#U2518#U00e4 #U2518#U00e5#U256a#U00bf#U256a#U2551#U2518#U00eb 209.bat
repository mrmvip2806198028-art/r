@echo off
title Nabgha 209
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Please install Node.js LTS, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting Nabgha 209...
start "" cmd /k "cd /d ""%~dp0"" && node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo The website should now open in your browser.
echo Keep the server window open while using the website.
echo.
pause
