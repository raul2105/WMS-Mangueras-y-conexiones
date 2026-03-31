$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state

foreach ($requiredPath in @($state.NodeExe, $state.AppServerPath)) {
  if (-not (Test-Path $requiredPath)) {
    Write-OpsLog -State $state -Level "ERROR" -Message "Missing runtime dependency: $requiredPath"
    throw "Missing required runtime path: $requiredPath"
  }
}

if (-not (Test-Path $state.DbPath)) {
  $message = "SQLite database not found at $($state.DbPath). Run init-local.cmd before launching WMS."
  Write-OpsLog -State $state -Level "ERROR" -Message $message
  throw $message
}

if (Test-Path $state.PidFile) {
  $rawPid = (Get-Content -LiteralPath $state.PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $existingPid = 0
  [void][int]::TryParse("$rawPid", [ref]$existingPid)
  if ($existingPid -gt 0) {
    $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existing -and (Test-WmsHealth -State $state)) {
      Write-OpsLog -State $state -Message "Launch skipped; WMS already running (PID $existingPid)."
      Start-Process "$($state.BaseUrl)/"
      Write-Host "WMS already running (PID $existingPid)."
      exit 0
    }
  }
}

$listenerPid = Get-WmsListenerProcessId -State $state
if ($listenerPid) {
  $ownerCmd = Get-ProcessCommandLine -ProcessId $listenerPid
  if (-not ($ownerCmd -and $ownerCmd -like "*$($state.AppServerPath)*")) {
    $message = "Port $($state.Port) is already in use by PID $listenerPid. Stop that process before launching WMS."
    Write-OpsLog -State $state -Level "ERROR" -Message $message
    throw $message
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutLog = Join-Path $state.LogDir "wms-$timestamp.out.log"
$stderrLog = Join-Path $state.LogDir "wms-$timestamp.err.log"

$env:NODE_ENV = "production"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:HOSTNAME = "127.0.0.1"
$env:PORT = "$($state.Port)"
$env:WMS_DATA_DIR = $state.DataDir
$env:WMS_DB_PATH = $state.DbPath
$env:WMS_BACKUP_DIR = $state.BackupDir
$env:WMS_LOG_DIR = $state.LogDir
$env:SQLITE_BUSY_TIMEOUT_MS = "5000"
$env:DATABASE_URL = $state.SqliteUrl

Write-OpsLog -State $state -Message "Starting WMS with DB at $($state.DbPath)"

$process = Start-Process `
  -FilePath $state.NodeExe `
  -ArgumentList "server.js" `
  -WorkingDirectory $state.AppDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Set-Content -LiteralPath $state.PidFile -Value "$($process.Id)" -Encoding ascii

$healthy = $false
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-WmsHealth -State $state) {
    $healthy = $true
    break
  }
}

if (-not $healthy) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $state.PidFile -Force -ErrorAction SilentlyContinue
  $message = "WMS did not pass healthcheck within 60 seconds. DB path: $($state.DbPath). See logs in $($state.LogDir)"
  Write-OpsLog -State $state -Level "ERROR" -Message $message
  throw $message
}

Write-OpsLog -State $state -Message "WMS started (PID $($process.Id)). stdout=$stdoutLog stderr=$stderrLog"
Write-Host "WMS started (PID $($process.Id)) on $($state.BaseUrl)"
Write-Host "DB: $($state.DbPath)"
Start-Process "$($state.BaseUrl)/"
