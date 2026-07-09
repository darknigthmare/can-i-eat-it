@echo off
title Can I Eat It - Tests moteur
cd /d %~dp0
if not exist node_modules (
  echo Installation des dependances...
  npm install
)
call npm run test
pause
