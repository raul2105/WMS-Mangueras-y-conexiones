$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "maintenance\backup-db.ps1") @args
