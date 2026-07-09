@echo off
title Can I Eat It - Web Dev
cd /d %~dp0
if not exist node_modules (
  echo Installation des dependances...
  npm install
)
npm run dev
pause
