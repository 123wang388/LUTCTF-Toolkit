@echo off
REM ============================================
REM  LUTCTF 工具合集 · 启动器
REM  兰州理工大学 K4L0NG 战队 · 海丰杯专版
REM ============================================
setlocal
cd /d "%~dp0"

REM 某些终端 / 编辑器环境（VS Code、各类 Electron 宿主）会遗留 ELECTRON_RUN_AS_NODE，
REM 导致 electron.exe 以纯 Node 模式启动、界面永远出不来，这里主动清除
set ELECTRON_RUN_AS_NODE=

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo [错误] 未找到 Electron 运行时，请确认 node_modules 目录完整。
  echo 路径：%~dp0node_modules\electron\dist\electron.exe
  pause
  exit /b 1
)

REM 应用路径必须写成 "%~dp0."，写成 "%~dp0" 时结尾反斜杠会转义后面的引号，路径解析失败
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
endlocal
