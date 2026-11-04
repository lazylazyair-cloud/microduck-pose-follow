@echo off
setlocal
cd /d "%~dp0"
title Microduck Pose Follow

echo.
echo ==========================================
echo   Microduck Pose Follow
echo ==========================================
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Put this BAT file beside package.json.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org/
  echo Then reopen this file.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm.cmd was not found. Repair or reinstall Node.js.
  echo.
  pause
  exit /b 1
)

echo Node:
node --version
echo npm:
call npm.cmd --version
if errorlevel 1 (
  echo ERROR: npm could not start.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo [1/2] Installing dependencies. Please wait...
  call npm.cmd ci
  if errorlevel 1 (
    echo.
    echo ERROR: npm ci failed. Check the network and npm error above.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [1/2] Dependencies already installed.
)

echo.
echo [2/2] Starting Microduck Pose Follow...
echo Keep this window open while using the page.
echo Open the localhost URL printed by Vite.
echo.
call npm.cmd run dev

echo.
echo Microduck stopped.
pause
