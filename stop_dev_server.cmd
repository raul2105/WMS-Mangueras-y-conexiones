@echo off
TITLE Stop WMS Dev Server
echo Stopping WMS Mangueras y Conexiones dev server...

setlocal EnableExtensions EnableDelayedExpansion

:: Always run from the repo root (this script's directory)
pushd "%~dp0"

:: Stop Next.js dev server for this project + free port 3002 + remove lock
powershell -NoProfile -Command "$root = (Resolve-Path -LiteralPath '%~dp0').Path; $procs = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\"; $procs = $procs.Where({ $_.CommandLine -match 'next(\\.exe)?\\s+dev' -and $_.CommandLine -like ('*'+$root+'*') }); foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped PID ' + $p.ProcessId) }; $listen = Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue; $c = Select-Object -First 1 -InputObject $listen; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped PID ' + $c.OwningProcess + ' on port 3002') }; $lock = Join-Path $root '.next\\dev\\lock'; if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host ('Removed ' + $lock) }"

popd
endlocal

echo Done.
exit /b 0
