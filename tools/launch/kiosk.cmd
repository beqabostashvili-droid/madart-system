@echo off
title MADART Kiosk launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" -App kiosk
if errorlevel 1 pause
