$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state

$stoppedPid = Stop-WmsProcess -State $state
if (-not $stoppedPid) {
  Write-OpsLog -State $state -Message "Stop requested but no active WMS process was found."
  Write-Host "La aplicacion no esta en ejecucion."
  exit 0
}

Write-OpsLog -State $state -Message "WMS process stopped (PID $stoppedPid)."

if ($state.DbMode -eq "aws") {
  Write-OpsLog -State $state -Message "WMS stopped in aws mode; SQLite backup skipped."
  Write-Host "WMS detenido. Modo aws activo; respaldo SQLite omitido."
  exit 0
}

if (Test-Path $state.DbPath) {
  $backupDir = New-DatabaseBackup -State $state -Reason "stop"
  Write-Host "WMS detenido."
  Write-Host "Respaldo creado en: $backupDir"
  exit 0
}

Write-OpsLog -State $state -Level "WARN" -Message "WMS stopped but SQLite database was missing at $($state.DbPath); backup skipped."
Write-Host "WMS detenido. No se encontro la base de datos para respaldo."
exit 0
