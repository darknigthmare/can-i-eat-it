@echo off
title Can I Eat It - Web + Backend SQLite
cd /d %~dp0
if not exist node_modules (
  echo Installation des dependances...
  npm install
)
start "Can I Eat It Backend" cmd /k npm run server
npm run dev
pause
