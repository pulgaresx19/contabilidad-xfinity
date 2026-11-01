@echo off
title Contabilidad XFinity - Servidor y Aplicacion
cd /d "%~dp0"
echo ========================================================
echo  Iniciando Servidor de Contabilidad Xfinity (Comcast)
echo ========================================================
start http://localhost:5000
node server.js
pause
