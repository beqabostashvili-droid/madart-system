@echo off
title MADART Production launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" -App production
if errorlevel 1 pause
