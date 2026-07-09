@echo off
title Can I Eat It - Export Backend
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri http://localhost:4177/api/export -OutFile can-i-eat-it-backend-export.json"
echo Export cree: can-i-eat-it-backend-export.json
pause
