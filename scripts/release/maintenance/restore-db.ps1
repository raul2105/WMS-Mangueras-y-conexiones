param(
  [string]$BackupPath = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state -IncludeData

if ($state.DbMode -eq "aws") {
  $message = "WMS_DB_MODE=aws: restauracion SQLite no aplica (datos en PostgreSQL compartida)."
  Write-OpsLog -State $state -Level "WARN" -Message $message
  Write-Host $message
  exit 0
}

$stoppedPid = Stop-WmsProcess -State $state
if ($stoppedPid) {
  Write-OpsLog -State $state -Message "WMS stopped before restore (PID $stoppedPid)."
}

$backupDir = $null
if ($BackupPath) {
  $backupDir = (Resolve-Path $BackupPath).Path
} else {
  $latestBackup = Get-LatestBackupDirectory -State $state
  if (-not $latestBackup) {
    throw "No hay respaldos en $($state.BackupDir)"
  }
  $backupDir = $latestBackup.FullName
}

if (Test-Path $state.DbPath) {
  $safetyBackup = New-DatabaseBackup -State $state -Reason "pre-restore"
  Write-Host "Respaldo de seguridad: $safetyBackup"
}

Restore-DatabaseBackup -State $state -BackupDirectory $backupDir
Write-Host "Base restaurada desde: $backupDir"
