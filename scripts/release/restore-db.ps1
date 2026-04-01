param(
  [string]$BackupPath = ""
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "maintenance\restore-db.ps1") -BackupPath $BackupPath
