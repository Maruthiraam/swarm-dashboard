@echo off
title SWARM DASHBOARD
color 0A

echo.
echo  ======================================
echo   SWARM DASHBOARD STARTING...
echo  ======================================
echo.

echo [1/5] Cleaning up old processes...
taskkill /F /IM mosquitto.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":1883 "') do taskkill /F /PID %%a >nul 2>&1

timeout /t 3 >nul

echo [2/5] Starting Mosquitto...
start "MOSQUITTO" cmd /k ""C:\Program Files\mosquitto\mosquitto.exe" -c "C:\Program Files\mosquitto\mosquitto.conf" -v"
timeout /t 3 >nul

echo [3/5] Starting Python Bridge...
start "BRIDGE" cmd /k "cd /d C:\Users\HP\OneDrive\Desktop\swarm-dashboard && python src\bridge.py"
timeout /t 4 >nul

echo [4/5] Starting React Dashboard...
start "DASHBOARD" cmd /k "cd /d C:\Users\HP\OneDrive\Desktop\swarm-dashboard && npm run dev"
timeout /t 6 >nul

echo [5/5] Opening browser...
start http://localhost:5173

echo.
echo  ======================================
echo   ALL SYSTEMS READY!
echo   Power on ESP32 robots now.
echo  ======================================
echo.
pause
