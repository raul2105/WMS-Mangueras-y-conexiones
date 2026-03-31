Set-StrictMode -Version Latest

$script:WmsAppName = "wms-rigentec"
$script:WmsPort = 3002

function Get-ReleaseRoot {
  $candidate = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  if (Test-Path (Join-Path $candidate "app\server.js")) {
    return $candidate
  }

  throw "Release root not found. Run this script from a generated release folder."
}

function Convert-ToSqliteUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return "file:$($Path -replace '\\', '/')"
}

function Get-WmsState {
  param(
    [string]$ReleaseRoot = (Get-ReleaseRoot)
  )

  if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA is not available in this session."
  }

  $stateRoot = Join-Path $env:LOCALAPPDATA $script:WmsAppName
  $dataDir = Join-Path $stateRoot "data"
  $backupDir = Join-Path $stateRoot "backups"
  $logDir = Join-Path $stateRoot "logs"
  $runDir = Join-Path $stateRoot "run"
  $dbPath = Join-Path $dataDir "wms.db"

  return [pscustomobject]@{
    ReleaseRoot = $ReleaseRoot
    AppDir = Join-Path $ReleaseRoot "app"
    ToolDir = Join-Path $ReleaseRoot "tools"
    BootstrapDir = Join-Path $ReleaseRoot "bootstrap"
    BootstrapDbPath = Join-Path $ReleaseRoot "bootstrap\initial.db"
    NodeExe = Join-Path $ReleaseRoot "runtime\node\node.exe"
    AppServerPath = Join-Path $ReleaseRoot "app\server.js"
    StateRoot = $stateRoot
    DataDir = $dataDir
    BackupDir = $backupDir
    LogDir = $logDir
    RunDir = $runDir
    DbPath = $dbPath
    DbWalPath = "$dbPath-wal"
    DbShmPath = "$dbPath-shm"
    SqliteUrl = Convert-ToSqliteUrl -Path $dbPath
    OpsLog = Join-Path $logDir "ops.log"
    PidFile = Join-Path $runDir "wms.pid"
    Port = $script:WmsPort
    BaseUrl = "http://127.0.0.1:$script:WmsPort"
    HealthUrl = "http://127.0.0.1:$script:WmsPort/api/health"
  }
}

function Ensure-Directory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Ensure-WmsStateDirectories {
  param(
    [Parameter(Mandatory = $true)]
    $State,
    [switch]$IncludeData
  )

  Ensure-Directory -Path $State.StateRoot
  Ensure-Directory -Path $State.LogDir
  Ensure-Directory -Path $State.RunDir

  if ($IncludeData) {
    Ensure-Directory -Path $State.DataDir
    Ensure-Directory -Path $State.BackupDir
  }
}

function Write-OpsLog {
  param(
    [Parameter(Mandatory = $true)]
    $State,
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [string]$Level = "INFO"
  )

  Ensure-Directory -Path $State.StateRoot
  Ensure-Directory -Path $State.LogDir
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $State.OpsLog -Value "$timestamp [$Level] $Message" -Encoding utf8
}

function Get-ProcessCommandLine {
  param(
    [int]$ProcessId
  )

  try {
    return (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
  } catch {
    return ""
  }
}

function Test-WmsHealth {
  param(
    [Parameter(Mandatory = $true)]
    $State,
    [int]$TimeoutSec = 3
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $State.HealthUrl -TimeoutSec $TimeoutSec
    if ($response.StatusCode -ne 200) {
      return $false
    }

    $payload = $response.Content | ConvertFrom-Json
    return ($payload.ok -eq $true)
  } catch {
    return $false
  }
}

function Get-WmsListenerProcessId {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  $listener = Get-NetTCPConnection -State Listen -LocalPort $State.Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) {
    return $null
  }

  return [int]$listener.OwningProcess
}

function Copy-DbArtifacts {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDbPath,
    [Parameter(Mandatory = $true)]
    [string]$DestinationDir
  )

  Ensure-Directory -Path $DestinationDir

  $sourceFiles = @(
    @{ Source = $SourceDbPath; Name = "wms.db" },
    @{ Source = "$SourceDbPath-wal"; Name = "wms.db-wal" },
    @{ Source = "$SourceDbPath-shm"; Name = "wms.db-shm" }
  )

  foreach ($file in $sourceFiles) {
    if (Test-Path $file.Source) {
      Copy-Item -LiteralPath $file.Source -Destination (Join-Path $DestinationDir $file.Name) -Force
    }
  }
}

function Get-LatestBackupDirectory {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  if (-not (Test-Path $State.BackupDir)) {
    return $null
  }

  return Get-ChildItem -LiteralPath $State.BackupDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
}

function New-DatabaseBackup {
  param(
    [Parameter(Mandatory = $true)]
    $State,
    [string]$Reason = "manual"
  )

  if (-not (Test-Path $State.DbPath)) {
    throw "SQLite database not found at $($State.DbPath)"
  }

  Ensure-WmsStateDirectories -State $State -IncludeData
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupDir = Join-Path $State.BackupDir $timestamp
  Copy-DbArtifacts -SourceDbPath $State.DbPath -DestinationDir $backupDir

  $backups = @(Get-ChildItem -LiteralPath $State.BackupDir -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending)
  if ($backups.Count -gt 30) {
    foreach ($oldBackup in ($backups | Select-Object -Skip 30)) {
      Remove-Item -LiteralPath $oldBackup.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  Write-OpsLog -State $State -Message "Backup created ($Reason): $backupDir"
  return $backupDir
}

function Restore-DatabaseBackup {
  param(
    [Parameter(Mandatory = $true)]
    $State,
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory
  )

  $backupDbPath = Join-Path $BackupDirectory "wms.db"
  if (-not (Test-Path $backupDbPath)) {
    throw "Backup database not found in $BackupDirectory"
  }

  Ensure-WmsStateDirectories -State $State -IncludeData
  Copy-Item -LiteralPath $backupDbPath -Destination $State.DbPath -Force

  foreach ($suffix in @("-wal", "-shm")) {
    $sourcePath = Join-Path $BackupDirectory "wms.db$suffix"
    $targetPath = "$($State.DbPath)$suffix"
    if (Test-Path $sourcePath) {
      Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    } elseif (Test-Path $targetPath) {
      Remove-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue
    }
  }

  Write-OpsLog -State $State -Message "Backup restored from: $BackupDirectory"
}

function Stop-WmsProcess {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  $stoppedPid = $null
  if (Test-Path $State.PidFile) {
    $rawPid = (Get-Content -LiteralPath $State.PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $pidValue = 0
    [void][int]::TryParse("$rawPid", [ref]$pidValue)
    if ($pidValue -gt 0) {
      $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $pidValue -Timeout 15 -ErrorAction SilentlyContinue
        $stoppedPid = $pidValue
      }
    }
  }

  if (-not $stoppedPid) {
    $listenerPid = Get-WmsListenerProcessId -State $State
    if ($listenerPid) {
      $ownerCmd = Get-ProcessCommandLine -ProcessId $listenerPid
      if ($ownerCmd -and $ownerCmd -like "*$($State.AppServerPath)*") {
        Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $listenerPid -Timeout 15 -ErrorAction SilentlyContinue
        $stoppedPid = $listenerPid
      }
    }
  }

  if (Test-Path $State.PidFile) {
    Remove-Item -LiteralPath $State.PidFile -Force -ErrorAction SilentlyContinue
  }

  return $stoppedPid
}
