$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state -IncludeData

if ($state.DbMode -eq "aws") {
	$message = "WMS_DB_MODE=aws: respaldo SQLite no aplica (datos en PostgreSQL compartida)."
	Write-OpsLog -State $state -Level "WARN" -Message $message
	Write-Host $message
	exit 0
}

$backupDir = New-DatabaseBackup -State $state -Reason "manual"
Write-Host "Respaldo creado en: $backupDir"
