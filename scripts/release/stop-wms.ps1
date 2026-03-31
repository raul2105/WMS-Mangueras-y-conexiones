$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state

$stoppedPid = Stop-WmsProcess -State $state
if (-not $stoppedPid) {
  Write-OpsLog -State $state -Message "Stop requested but no active WMS process was found."
  Write-Host "No active WMS process found for this release."
  exit 0
}

Write-OpsLog -State $state -Message "WMS process stopped (PID $stoppedPid)."

if (Test-Path $state.DbPath) {
  $backupDir = New-DatabaseBackup -State $state -Reason "stop"
  Write-Host "Stopped PID $stoppedPid."
  Write-Host "Backup created: $backupDir"
  exit 0
}

Write-OpsLog -State $state -Level "WARN" -Message "WMS stopped but SQLite database was missing at $($state.DbPath); backup skipped."
Write-Host "Stopped PID $stoppedPid. Backup skipped because DB was not found."
exit 0
