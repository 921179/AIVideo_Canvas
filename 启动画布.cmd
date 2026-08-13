@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

call :check_service
if not errorlevel 1 goto open_canvas

echo 正在启动镜流 Canvas 本地服务...
start "镜流 Canvas 服务" /min cmd /c "node server.mjs ^>nul 2^>^&1"

set /a CANVAS_ATTEMPTS=0
:wait_for_service
call :check_service
if not errorlevel 1 goto open_canvas
set /a CANVAS_ATTEMPTS+=1
if %CANVAS_ATTEMPTS% geq 20 goto start_failed
timeout /t 1 /nobreak >nul
goto wait_for_service

:open_canvas
echo 正在打开 http://127.0.0.1:4173/ ...
if /I not "%CANVAS_NO_BROWSER%"=="1" start "" "http://127.0.0.1:4173/"
exit /b 0

:check_service
node -e "fetch('http://127.0.0.1:4173/api/projects',{signal:AbortSignal.timeout(1000)}).then(function(response){process.exit(response.ok?0:1)}).catch(function(){process.exit(1)})"
exit /b %errorlevel%

:missing_node
echo.
echo 未检测到 Node.js 或 npm。
echo 请先安装 Node.js，然后重新双击“启动画布.cmd”。
echo.
if /I not "%CANVAS_NO_BROWSER%"=="1" pause
exit /b 1

:start_failed
echo.
echo 本地服务启动失败。
echo 请检查最小化的“镜流 Canvas 服务”窗口中的错误信息。
echo 也可以在当前目录手动运行：npm run dev
echo.
if /I not "%CANVAS_NO_BROWSER%"=="1" pause
exit /b 1
