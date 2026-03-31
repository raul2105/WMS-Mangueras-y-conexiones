@echo off
setlocal
call "%~dp0backup-db.cmd" %*
exit /b %ERRORLEVEL%
