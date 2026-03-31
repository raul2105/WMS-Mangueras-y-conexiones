$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state

foreach ($requiredPath in @($state.NodeExe, $state.AppServerPath)) {
  if (-not (Test-Path $requiredPath)) {
    $message = "Falta un archivo requerido para iniciar WMS: $requiredPath"
    Write-OpsLog -State $state -Level "ERROR" -Message $message
    throw $message
  }
}

if (-not (Test-Path $state.DbPath)) {
  $message = "No se encontro la base de datos en $($state.DbPath). Ejecuta maintenance\init-local.cmd una sola vez."
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
      Write-Host "La aplicacion ya esta abierta."
      Start-Process "$($state.BaseUrl)/"
      exit 0
    }
  }
}

$listenerPid = Get-WmsListenerProcessId -State $state
if ($listenerPid) {
  $ownerCmd = Get-ProcessCommandLine -ProcessId $listenerPid
  if (-not ($ownerCmd -and $ownerCmd -like "*$($state.AppServerPath)*")) {
    $message = "El puerto $($state.Port) ya esta en uso por otro proceso (PID $listenerPid)."
    Write-OpsLog -State $state -Level "ERROR" -Message $message
    throw "$message Cierra ese proceso y vuelve a intentar."
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
  $message = "WMS no respondio al healthcheck en 60 segundos. Revisa logs en $($state.LogDir)"
  Write-OpsLog -State $state -Level "ERROR" -Message "$message. DB path: $($state.DbPath)"
  throw $message
}

Write-OpsLog -State $state -Message "WMS started (PID $($process.Id)). stdout=$stdoutLog stderr=$stderrLog"
Write-Host "WMS listo."
Start-Process "$($state.BaseUrl)/"
