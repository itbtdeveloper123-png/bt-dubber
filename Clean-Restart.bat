@echo off
setlocal
chcp 65001 >NUL
title BT-Dubber Server

:: Change to script directory regardless of how it was launched
cd /d "%~dp0"

echo ===================================================
echo   [BT-Dubber] Cleaning and Restarting Server...
echo ===================================================

:: Ensure temp folder exists on Drive D to prevent Drive C ENOSPC errors
if not exist "data\temp" mkdir "data\temp"
set "TEMP=%~dp0data\temp"
set "TMP=%~dp0data\temp"
set "TMPDIR=%~dp0data\temp"

echo [1/3] Freeing port 3000 and terminating old Node processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " 2^>NUL') do (
    taskkill /F /PID %%a >NUL 2>&1
)
taskkill /F /IM node.exe >NUL 2>&1

echo [2/3] Checking environment and dependencies...
if not exist "node_modules" (
    echo [ERROR] node_modules not found. Running npm install...
    call npm install
)

echo [3/3] Starting BT-Dubber server on http://localhost:3000 ...
echo.
echo ===================================================
echo   Server is running! Open: http://localhost:3000
echo   Press Ctrl+C to stop the server.
echo ===================================================
echo.

npm run dev

pause

