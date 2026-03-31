param(
  [string]$BackupPath = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state -IncludeData

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
    throw "No backups found in $($state.BackupDir)"
  }
  $backupDir = $latestBackup.FullName
}

if (Test-Path $state.DbPath) {
  $safetyBackup = New-DatabaseBackup -State $state -Reason "pre-restore"
  Write-Host "Safety backup created: $safetyBackup"
}

Restore-DatabaseBackup -State $state -BackupDirectory $backupDir
Write-Host "Database restored from: $backupDir"
