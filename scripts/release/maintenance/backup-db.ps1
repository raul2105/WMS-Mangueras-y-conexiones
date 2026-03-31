$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state -IncludeData

$backupDir = New-DatabaseBackup -State $state -Reason "manual"
Write-Host "Respaldo creado en: $backupDir"
