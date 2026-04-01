@echo off
setlocal

call "%~dp0stop.cmd" %*
exit /b %ERRORLEVEL%
