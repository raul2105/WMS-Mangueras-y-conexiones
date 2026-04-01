@echo off
setlocal

call "%~dp0launcher.cmd" %*
exit /b %ERRORLEVEL%
