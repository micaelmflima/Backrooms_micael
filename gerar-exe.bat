@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale o Node.js LTS em https://nodejs.org/ primeiro.
 pause
 exit /b 1
)
node scripts/check-node.cjs
if errorlevel 1 (pause & exit /b 1)
call npm install --include=dev
if errorlevel 1 (pause & exit /b 1)
call npm run build
if errorlevel 1 (pause & exit /b 1)
echo Concluido. Os executaveis estao na pasta dist.
start "" "%~dp0dist"
pause
