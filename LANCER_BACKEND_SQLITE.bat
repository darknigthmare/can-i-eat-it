@echo off
title Can I Eat It - Backend SQLite
cd /d %~dp0
if not exist node_modules (
  echo Installation des dependances...
  npm install
)
npm run server
pause
