@echo off
title Can I Eat It - Build EXE Tauri
cd /d %~dp0
if not exist node_modules (
  echo Installation des dependances...
  npm install
)
npm run tauri:build
pause
