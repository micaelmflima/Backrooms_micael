@echo off
setlocal
cd /d "%~dp0"
title Backrooms ECHO - Servidor
where node >nul 2>nul
if errorlevel 1 (
 echo Instale o Node.js LTS em https://nodejs.org/ e abra novamente.
 pause
 exit /b 1
)
node scripts/check-node.cjs
if errorlevel 1 (pause & exit /b 1)
if not exist "node_modules\express\package.json" (
 echo Instalando componentes. Aguarde...
 call npm install --omit=dev
 if errorlevel 1 (pause & exit /b 1)
)
echo Mantenha esta janela aberta enquanto joga.
call npm start
pause
