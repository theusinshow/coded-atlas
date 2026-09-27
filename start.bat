@echo off
echo Limpando cache do servidor...
if exist .next rmdir /s /q .next
rem -H 127.0.0.1: o servidor so escuta nesta maquina (a API de exclusao nao fica exposta na rede local)
start "" cmd /k "npm run dev -- -p 5000 -H 127.0.0.1"
echo Aguardando compilacao inicial...
timeout /t 8 /nobreak >nul
start "" "http://localhost:5000"
