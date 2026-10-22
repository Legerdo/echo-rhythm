@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto directory_error

where node.exe >nul 2>&1
if errorlevel 1 goto node_error
where npm.cmd >nul 2>&1
if errorlevel 1 goto node_error

if exist "node_modules\vite\bin\vite.js" goto launch
if exist "package-lock.json" (
    call npm.cmd ci
) else (
    call npm.cmd install
)
if errorlevel 1 goto install_error

:launch
echo Starting Echo Rhythm. Close this window to stop the server.
call npm.cmd run dev -- --host 127.0.0.1 --open
if errorlevel 1 goto launch_error
exit /b 0

:directory_error
echo [ERROR] Could not open the project folder.
goto failure

:node_error
echo [ERROR] Node.js and npm are required. Install a current Node.js LTS version.
goto failure

:install_error
echo [ERROR] Dependency installation failed. Check the messages above.
goto failure

:launch_error
echo [ERROR] The server failed to start. Check the messages above.

:failure
pause
exit /b 1
