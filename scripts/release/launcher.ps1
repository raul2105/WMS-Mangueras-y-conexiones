$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

$state = Get-WmsState
Ensure-WmsStateDirectories -State $state

$isAwsDbMode = ($state.DbMode -eq "aws")
$databaseUrl = ""

foreach ($requiredPath in @($state.NodeExe, $state.AppServerPath)) {
  if (-not (Test-Path $requiredPath)) {
    $message = "Falta un archivo requerido para iniciar WMS: $requiredPath"
    Write-OpsLog -State $state -Level "ERROR" -Message $message
    throw $message
  }
}

if ($isAwsDbMode) {
  if (-not $state.DatabaseUrl -or -not ($state.DatabaseUrl -match "^postgres(ql)?://")) {
    Write-Host ""
    if (-not $state.DatabaseUrl) {
      Write-Host "Primera configuracion: ingresa la URL de la base de datos central."
    } else {
      Write-Host "La URL de base de datos guardada no es valida. Reconfigura."
    }
    Write-Host "(Se guarda de forma permanente y no se volvera a pedir)"
    Write-Host ""
    $setupUrl = Invoke-AwsDatabaseSetup
    if (-not $setupUrl) {
      $message = "Configuracion cancelada. DATABASE_URL es requerida para iniciar WMS."
      Write-OpsLog -State $state -Level "ERROR" -Message $message
      throw $message
    }
    $databaseUrl = $setupUrl
  } else {
    $databaseUrl = $state.DatabaseUrl
  }
} else {
  if (-not (Test-Path $state.DbPath)) {
    if (-not (Test-Path $state.BootstrapDbPath)) {
      $message = "No se encontro la base de datos ni el archivo inicial en $($state.BootstrapDbPath). El release puede estar incompleto."
      Write-OpsLog -State $state -Level "ERROR" -Message $message
      throw $message
    }
    Write-Host "Primera ejecucion: inicializando base de datos..."
    Ensure-WmsStateDirectories -State $state -IncludeData
    Copy-Item -LiteralPath $state.BootstrapDbPath -Destination $state.DbPath -Force
    foreach ($suffix in @("-wal", "-shm")) {
      $artifact = "$($state.DbPath)$suffix"
      if (Test-Path $artifact) {
        Remove-Item -LiteralPath $artifact -Force -ErrorAction SilentlyContinue
      }
    }
    Write-OpsLog -State $state -Message "Base de datos inicializada automaticamente desde bootstrap."
    Write-Host "Base de datos lista en $($state.DbPath)"
  }

  $databaseUrl = $state.SqliteUrl
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
$env:AUTH_SECRET = $state.AuthSecret
$env:AUTH_TRUST_HOST = "true"
$env:WMS_DATA_DIR = $state.DataDir
$env:WMS_BACKUP_DIR = $state.BackupDir
$env:WMS_LOG_DIR = $state.LogDir
$env:WMS_DB_MODE = $state.DbMode
$env:DATABASE_URL = $databaseUrl

if ($isAwsDbMode) {
  Remove-Item Env:WMS_DB_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:SQLITE_BUSY_TIMEOUT_MS -ErrorAction SilentlyContinue
} else {
  $env:WMS_DB_PATH = $state.DbPath
  $env:SQLITE_BUSY_TIMEOUT_MS = "5000"
}

$dbLogTarget = if ($isAwsDbMode) { "AWS PostgreSQL" } else { $state.DbPath }
Write-OpsLog -State $state -Message "Starting WMS (dbMode=$($state.DbMode)) with DB target: $dbLogTarget"

# Sync environment
$env:WMS_SYNC_ENABLED = "true"
if ($state.SyncOutboundQueueUrl) {
  $env:WMS_OUTBOUND_SYNC_QUEUE_URL = $state.SyncOutboundQueueUrl
}
if ($state.SyncInboundQueueUrl) {
  $env:WMS_INBOUND_SYNC_QUEUE_URL = $state.SyncInboundQueueUrl
}
$env:AWS_REGION = $state.AwsRegion
if ($state.MobileTablePrefix) {
  $env:WMS_MOBILE_TABLE_PREFIX = $state.MobileTablePrefix
}

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
  Write-OpsLog -State $state -Level "ERROR" -Message "$message. dbMode=$($state.DbMode)"
  throw $message
}

Write-OpsLog -State $state -Message "WMS started (PID $($process.Id)). stdout=$stdoutLog stderr=$stderrLog"

$syncStatus = if ($state.SyncOutboundQueueUrl -or $state.SyncInboundQueueUrl) { "activa" } else { "inactiva (sin URLs configuradas)" }
Write-OpsLog -State $state -Message "Sincronizacion movil: $syncStatus"
Write-Host "Sincronizacion movil: $syncStatus"

Write-Host "WMS listo."
Start-Process "$($state.BaseUrl)/"
