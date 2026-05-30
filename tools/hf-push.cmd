@echo off
rem hf-push.cmd — PowerShell execution policy'sini bypass'lar
rem Kullanım: tools\hf-push "commit mesajı"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0hf-push.ps1" %*
