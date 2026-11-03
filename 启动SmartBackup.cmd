@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title SmartBackup - One Click Launcher

echo.
echo ============================================
echo          SmartBackup - Windows
echo ============================================
echo.
echo Project folder: %CD%
echo.

if not exist "package.json" (
  echo [ERROR] package.json is missing.
  echo Put this launcher in the root of the SmartBackup project.
  goto :failure
)

where node >nul 2>nul
if errorlevel 1 goto :missing_node
where npm >nul 2>nul
if errorlevel 1 goto :missing_node

echo [1/2] Checking Electron dependencies...
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo First run: installing project dependencies from npm.
  echo Internet access is required this first time.
  echo This might take a while on an external HDD.
  echo.
  call npm install --no-audit --no-fund --no-progress
  if errorlevel 1 goto :install_failed
) else (
  echo Electron already installed; skipping dependency install.
)

echo.
echo [2/2] Starting SmartBackup...
echo You can close this terminal after you exit the application.
echo.
call npm start
if errorlevel 1 goto :start_failed
exit /b 0

:missing_node
echo.
echo [ERROR] Node.js / npm not found.
echo Install the current Node.js LTS for Windows from:
echo https://nodejs.org/en/download
echo Close and reopen this launcher after installing Node.js.
goto :failure

:install_failed
echo.
echo [ERROR] Dependency installation failed.
echo Check your internet connection and npm error messages above.
goto :failure

:start_failed
echo.
echo [ERROR] SmartBackup did not start successfully.
echo See the error messages above.
goto :failure

:failure
echo.
pause
exit /b 1
