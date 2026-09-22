@echo off
title MADART POS launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" -App pos
if errorlevel 1 pause
