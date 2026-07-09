@echo off
title Can I Eat It - Build Android Capacitor
cd /d %~dp0
if not exist node_modules (
  echo Installation des dependances...
  npm install
)
call npm run build
if not exist android (
  call npm run mobile:add:android
)
call npx cap sync android
call npx cap open android
pause
