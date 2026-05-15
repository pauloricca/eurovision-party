@echo off
setlocal

set "PUBLIC_HOST="

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null } | Select-Object -First 1 -ExpandProperty IPv4Address).IPAddress"`) do set "PUBLIC_HOST=%%I"

if "%PUBLIC_HOST%"=="" set "PUBLIC_HOST=localhost"

echo Starting Eurovision Party at http://localhost:3000/admin
echo Voter QR will point to http://%PUBLIC_HOST%:3000/

docker compose up -d --build

if errorlevel 1 (
  echo.
  echo Docker Compose failed to start. Is Docker Desktop running?
  exit /b 1
)

start "" "http://localhost:3000/admin"
