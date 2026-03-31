$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state -IncludeData

if (-not (Test-Path $state.BootstrapDbPath)) {
  $message = "Bootstrap database not found at $($state.BootstrapDbPath)"
  Write-OpsLog -State $state -Level "ERROR" -Message $message
  throw $message
}

if (Test-Path $state.DbPath) {
  $message = "SQLite database already exists at $($state.DbPath). Initialization skipped."
  Write-OpsLog -State $state -Message $message
  Write-Host $message
  exit 0
}

Copy-Item -LiteralPath $state.BootstrapDbPath -Destination $state.DbPath -Force

if (Test-Path $state.DbWalPath) {
  Remove-Item -LiteralPath $state.DbWalPath -Force -ErrorAction SilentlyContinue
}
if (Test-Path $state.DbShmPath) {
  Remove-Item -LiteralPath $state.DbShmPath -Force -ErrorAction SilentlyContinue
}

Write-OpsLog -State $state -Message "SQLite database initialized at $($state.DbPath)"
Write-Host "SQLite initialized at $($state.DbPath)"
