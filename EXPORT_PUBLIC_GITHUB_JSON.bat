@echo off
cd /d "%~dp0"
echo Export de la base publique communautaire depuis le backend local...
echo Backend attendu sur http://localhost:4177
powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'http://localhost:4177/api/public-db' -OutFile 'can-i-eat-it-public-db.latest.json'"
echo Fichier genere : can-i-eat-it-public-db.latest.json
pause
