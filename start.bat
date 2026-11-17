@echo off
chcp 65001 > nul
title SHIFO NUR - Sog'lomlashtirish Markazi CRM
echo ======================================================================
echo    «SHIFO NUR» Ayollar va Bolalar Sog'lomlashtirish Markazi CRM
echo ======================================================================
echo.
echo Dastur ishga tushirilmoqda...
echo Brauzerda http://127.0.0.1:8000 ochilmoqda...
echo.
start "" "http://127.0.0.1:8000"
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause
