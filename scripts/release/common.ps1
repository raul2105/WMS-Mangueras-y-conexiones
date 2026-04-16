Set-StrictMode -Version Latest

$script:WmsAppName = "wms-scmayer"
$script:WmsPort = 3002

function Resolve-NormalizedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return [System.IO.Path]::GetFullPath($Path.TrimEnd('\'))
}

function Test-PathWithinBase {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  $base = Resolve-NormalizedPath -Path $BasePath
  $target = Resolve-NormalizedPath -Path $TargetPath
  if ($target.Equals($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }

  $prefix = "$base\"
  return $target.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-PathWithinBase {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,
    [string]$Label = "path"
  )

  if (-not (Test-PathWithinBase -BasePath $BasePath -TargetPath $TargetPath)) {
    throw "Unsafe $Label detected outside controlled scope: $TargetPath"
  }
}

function Get-ReleaseRoot {
  $candidate = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  if (Test-Path (Join-Path $candidate "app\server.js")) {
    return (Resolve-NormalizedPath -Path $candidate)
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

function Get-WmsAuthSecret {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StateRoot
  )

  $secretFile = Join-Path $StateRoot "auth-secret.key"
  if (Test-Path $secretFile) {
    $existing = (Get-Content -LiteralPath $secretFile -Raw).Trim()
    if ($existing.Length -ge 32) {
      return $existing
    }
  }

  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $secret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

  $dir = Split-Path $secretFile -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  Set-Content -LiteralPath $secretFile -Value $secret -Encoding ascii
  return $secret
}

function Get-WmsDbMode {
  $mode = "$($env:WMS_DB_MODE)".Trim().ToLowerInvariant()
  if (-not $mode) {
    return "aws"
  }

  if ($mode -in @("aws", "local")) {
    return $mode
  }

  throw "Invalid WMS_DB_MODE '$mode'. Supported values: aws, local"
}

function Get-WmsState {
  param(
    [string]$ReleaseRoot = (Get-ReleaseRoot)
  )

  if (-not $env:LOCALAPPDATA) {
    throw "LOCALAPPDATA is not available in this session."
  }

  $resolvedReleaseRoot = Resolve-NormalizedPath -Path $ReleaseRoot
  if (-not (Test-Path (Join-Path $resolvedReleaseRoot "app\server.js"))) {
    throw "Invalid release root: $resolvedReleaseRoot"
  }

  $stateRoot = Join-Path $env:LOCALAPPDATA $script:WmsAppName
  $dataDir = Join-Path $stateRoot "data"
  $backupDir = Join-Path $stateRoot "backups"
  $logDir = Join-Path $stateRoot "logs"
  $runDir = Join-Path $stateRoot "run"
  $cacheDir = Join-Path $stateRoot "cache"
  $dbPath = Join-Path $dataDir "wms.db"
  $dbMode = Get-WmsDbMode
  $databaseUrl = "$($env:DATABASE_URL)".Trim()

  return [pscustomobject]@{
    ReleaseRoot = $resolvedReleaseRoot
    AppDir = Join-Path $resolvedReleaseRoot "app"
    ToolDir = Join-Path $resolvedReleaseRoot "tools"
    BootstrapDir = Join-Path $resolvedReleaseRoot "bootstrap"
    BootstrapDbPath = Join-Path $resolvedReleaseRoot "bootstrap\initial.db"
    NodeExe = Join-Path $resolvedReleaseRoot "runtime\node\node.exe"
    AppServerPath = Join-Path $resolvedReleaseRoot "app\server.js"
    StateRoot = Resolve-NormalizedPath -Path $stateRoot
    DataDir = Resolve-NormalizedPath -Path $dataDir
    BackupDir = Resolve-NormalizedPath -Path $backupDir
    LogDir = Resolve-NormalizedPath -Path $logDir
    RunDir = Resolve-NormalizedPath -Path $runDir
    CacheDir = Resolve-NormalizedPath -Path $cacheDir
    DbPath = Resolve-NormalizedPath -Path $dbPath
    DbWalPath = (Resolve-NormalizedPath -Path "$dbPath-wal")
    DbShmPath = (Resolve-NormalizedPath -Path "$dbPath-shm")
    DbMode = $dbMode
    IsAwsDbMode = ($dbMode -eq "aws")
    SqliteUrl = Convert-ToSqliteUrl -Path $dbPath
    DatabaseUrl = $databaseUrl
    AuthSecret = (Get-WmsAuthSecret -StateRoot $stateRoot)
    SyncOutboundQueueUrl = "$($env:WMS_OUTBOUND_SYNC_QUEUE_URL)".Trim()
    SyncInboundQueueUrl = "$($env:WMS_INBOUND_SYNC_QUEUE_URL)".Trim()
    AwsRegion = ("$($env:AWS_REGION)".Trim(), "$($env:AWS_DEFAULT_REGION)".Trim(), "us-east-1" | Where-Object { $_ } | Select-Object -First 1)
    MobileTablePrefix = "$($env:WMS_MOBILE_TABLE_PREFIX)".Trim()
    OpsLog = Resolve-NormalizedPath -Path (Join-Path $logDir "ops.log")
    PidFile = Resolve-NormalizedPath -Path (Join-Path $runDir "wms.pid")
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
  Ensure-Directory -Path $State.CacheDir

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

  try {
    Ensure-Directory -Path $State.StateRoot
    Ensure-Directory -Path $State.LogDir
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $State.OpsLog -Value "$timestamp [$Level] $Message" -Encoding utf8
  } catch {
    # Uninstall can remove StateRoot; ops logging must not break runtime flow.
  }
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

function Test-WmsProcessRunningForRelease {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  if (Test-Path $State.PidFile) {
    $rawPid = (Get-Content -LiteralPath $State.PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $pidValue = 0
    [void][int]::TryParse("$rawPid", [ref]$pidValue)
    if ($pidValue -gt 0) {
      $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
      if ($proc) {
        return $true
      }
    }
  }

  $listenerPid = Get-WmsListenerProcessId -State $State
  if ($listenerPid) {
    $ownerCmd = Get-ProcessCommandLine -ProcessId $listenerPid
    if ($ownerCmd -and $ownerCmd -like "*$($State.AppServerPath)*") {
      return $true
    }
  }

  $nodeProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)
  foreach ($process in $nodeProcesses) {
    if ($process.CommandLine -and $process.CommandLine -like "*$($State.AppServerPath)*") {
      return $true
    }
  }

  return $false
}

function Test-SqliteArtifactsUnlocked {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  foreach ($path in @($State.DbPath, $State.DbWalPath, $State.DbShmPath)) {
    if (-not (Test-Path $path)) {
      continue
    }

    try {
      $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      $stream.Close()
      $stream.Dispose()
    } catch {
      return [pscustomobject]@{
        IsUnlocked = $false
        LockedPath = $path
      }
    }
  }

  return [pscustomobject]@{
    IsUnlocked = $true
    LockedPath = ""
  }
}

function Remove-SafeItem {
  param(
    [Parameter(Mandatory = $true)]
    $State,
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [switch]$Recurse,
    [string[]]$AllowedRoots = @()
  )

  if (-not (Test-Path $Path)) {
    return $false
  }

  $resolvedPath = Resolve-NormalizedPath -Path $Path
  $roots = @($State.ReleaseRoot, $State.StateRoot) + $AllowedRoots
  $isAllowed = $false
  foreach ($root in $roots) {
    if ($root -and (Test-PathWithinBase -BasePath $root -TargetPath $resolvedPath)) {
      $isAllowed = $true
      break
    }
  }

  if (-not $isAllowed) {
    throw "Unsafe delete blocked for path: $resolvedPath"
  }

  if ($Recurse) {
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force -ErrorAction Stop
  } else {
    Remove-Item -LiteralPath $resolvedPath -Force -ErrorAction Stop
  }

  return $true
}

function Test-DirectoryHasFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return $false
  }

  $anyFile = Get-ChildItem -LiteralPath $Path -File -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1
  return ($null -ne $anyFile)
}

function Get-WmsShortcutCandidates {
  $paths = @()
  $knownFolders = @(
    [Environment]::GetFolderPath("Desktop"),
    [Environment]::GetFolderPath("CommonDesktopDirectory"),
    [Environment]::GetFolderPath("StartMenu"),
    [Environment]::GetFolderPath("CommonStartMenu")
  ) | Where-Object { $_ }

  foreach ($folder in $knownFolders) {
    if (Test-Path $folder) {
      $paths += @(Get-ChildItem -LiteralPath $folder -Filter "*.lnk" -Recurse -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
    }
  }

  $startupCandidates = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Startup")
  ) | Where-Object { $_ }

  foreach ($startup in $startupCandidates) {
    if (Test-Path $startup) {
      $paths += @(Get-ChildItem -LiteralPath $startup -Filter "*.lnk" -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
    }
  }

  return @($paths | Sort-Object -Unique)
}

function Remove-WmsShortcutsForRelease {
  param(
    [Parameter(Mandatory = $true)]
    $State
  )

  $removed = @()
  $shell = New-Object -ComObject WScript.Shell
  foreach ($shortcutPath in (Get-WmsShortcutCandidates)) {
    try {
      $shortcut = $shell.CreateShortcut($shortcutPath)
      $targetPath = ""
      if ($shortcut.TargetPath) {
        $targetPath = Resolve-NormalizedPath -Path $shortcut.TargetPath
      }
      $arguments = "$($shortcut.Arguments)"
      $shortcutName = [System.IO.Path]::GetFileName($shortcutPath)
      $nameMatches = $shortcutName -match "(?i)wms|rigentec|scmayer"
      $targetMatches = $targetPath -and (Test-PathWithinBase -BasePath $State.ReleaseRoot -TargetPath $targetPath)
      $argsMatch = $arguments -and $arguments -like "*$($State.ReleaseRoot)*"
      if ($nameMatches -and ($targetMatches -or $argsMatch)) {
        Remove-SafeItem -State $State -Path $shortcutPath -AllowedRoots @(
          [Environment]::GetFolderPath("Desktop"),
          [Environment]::GetFolderPath("CommonDesktopDirectory"),
          [Environment]::GetFolderPath("StartMenu"),
          [Environment]::GetFolderPath("CommonStartMenu"),
          (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"),
          (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Startup")
        ) | Out-Null
        $removed += $shortcutPath
      }
    } catch {
      continue
    }
  }

  return $removed
}

function Invoke-AwsDatabaseSetup {
  $currentUrl = [System.Environment]::GetEnvironmentVariable("DATABASE_URL", "Machine")
  if ($currentUrl) {
    $maskedUrl = $currentUrl -replace "//[^:]+:[^@]+@", "//***:***@"
    Write-Host "  Configuracion actual: $maskedUrl"
    Write-Host ""
  }

  $url = (Read-Host "Ingresa la URL PostgreSQL (postgresql://usuario:clave@host:5432/db?schema=public)").Trim()

  if (-not $url) {
    return $null
  }

  if (-not ($url -match "^postgres(ql)?://")) {
    Write-Host ""
    Write-Host "  [ERROR] Formato invalido. Debe comenzar con postgresql:// o postgres://"
    Write-Host "  Ejemplo: postgresql://usuario:clave@servidor.rds.amazonaws.com:5432/wms?schema=public"
    return $null
  }

  try {
    [System.Environment]::SetEnvironmentVariable("DATABASE_URL", $url, "Machine")
    [System.Environment]::SetEnvironmentVariable("WMS_DB_MODE", "aws", "Machine")
  } catch {
    Write-Host "  ADVERTENCIA: no se pudo guardar en variables de sistema (requiere Administrador)."
    Write-Host "  La configuracion aplica solo para esta sesion. Ejecuta maintenance\setup-aws.cmd como Administrador para hacerla permanente."
  }

  $env:DATABASE_URL = $url
  $env:WMS_DB_MODE  = "aws"

  $maskedFinal = $url -replace "//[^:]+:[^@]+@", "//***:***@"
  Write-Host "  DATABASE_URL = $maskedFinal"

  try {
    $uriObj   = [System.Uri]($url.Split("?")[0])
    $hostName = $uriObj.Host
    $port_    = if ($uriObj.Port -gt 0) { $uriObj.Port } else { 5432 }
    $tc       = New-Object System.Net.Sockets.TcpClient
    $waited   = $tc.BeginConnect($hostName, $port_, $null, $null).AsyncWaitHandle.WaitOne(4000)
    $tc.Close()
    if ($waited) {
      Write-Host "  Red OK: $hostName`:$port_"
    } else {
      Write-Host "  ADVERTENCIA: servidor no alcanzable en $hostName`:$port_ - verifica VPN o firewall."
    }
  } catch {
    Write-Host "  ADVERTENCIA: prueba de red no concluyente ($($_.Exception.Message))"
  }

  return $url
}

function Invoke-SyncSetup {
  Write-Host ""
  Write-Host "=== Configuracion de sincronizacion movil ==="
  Write-Host "Configura las colas SQS y credenciales AWS para sync en tiempo real."
  Write-Host "Los valores se obtienen de los outputs del stack CDK mobile."
  Write-Host "(Dejar vacio para omitir)"
  Write-Host ""

  # --- Outbound Queue URL ---
  $currentOutbound = [System.Environment]::GetEnvironmentVariable("WMS_OUTBOUND_SYNC_QUEUE_URL", "Machine")
  if ($currentOutbound) {
    $truncated = if ($currentOutbound.Length -gt 60) { $currentOutbound.Substring(0, 60) + "..." } else { $currentOutbound }
    Write-Host "  Outbound actual: $truncated"
  }
  $outboundUrl = (Read-Host "URL de la cola SQS outbound (OutboundSyncQueueUrl)").Trim()
  if (-not $outboundUrl -and $currentOutbound) {
    $outboundUrl = $currentOutbound
    Write-Host "  Manteniendo valor existente."
  }

  # --- Inbound Queue URL ---
  $currentInbound = [System.Environment]::GetEnvironmentVariable("WMS_INBOUND_SYNC_QUEUE_URL", "Machine")
  if ($currentInbound) {
    $truncated = if ($currentInbound.Length -gt 60) { $currentInbound.Substring(0, 60) + "..." } else { $currentInbound }
    Write-Host "  Inbound actual: $truncated"
  }
  $inboundUrl = (Read-Host "URL de la cola SQS inbound (InboundSyncQueueUrl)").Trim()
  if (-not $inboundUrl -and $currentInbound) {
    $inboundUrl = $currentInbound
    Write-Host "  Manteniendo valor existente."
  }

  # --- AWS Region ---
  $currentRegion = [System.Environment]::GetEnvironmentVariable("AWS_REGION", "Machine")
  if ($currentRegion) {
    Write-Host "  Region actual: $currentRegion"
  }
  $region = (Read-Host "Region AWS (default: us-east-1)").Trim()
  if (-not $region) {
    $region = if ($currentRegion) { $currentRegion } else { "us-east-1" }
  }

  # --- AWS Access Key ---
  $currentAccessKey = [System.Environment]::GetEnvironmentVariable("AWS_ACCESS_KEY_ID", "Machine")
  if ($currentAccessKey) {
    $masked = $currentAccessKey.Substring(0, 4) + "****" + $currentAccessKey.Substring($currentAccessKey.Length - 4)
    Write-Host "  Access Key actual: $masked"
  }
  $accessKey = (Read-Host "AWS Access Key ID").Trim()
  if (-not $accessKey -and $currentAccessKey) {
    $accessKey = $currentAccessKey
    Write-Host "  Manteniendo valor existente."
  }

  # --- AWS Secret Key ---
  $currentSecretKey = [System.Environment]::GetEnvironmentVariable("AWS_SECRET_ACCESS_KEY", "Machine")
  if ($currentSecretKey) {
    Write-Host "  Secret Key actual: ********"
  }
  $secretKey = (Read-Host "AWS Secret Access Key").Trim()
  if (-not $secretKey -and $currentSecretKey) {
    $secretKey = $currentSecretKey
    Write-Host "  Manteniendo valor existente."
  }

  # --- Mobile Table Prefix ---
  $currentPrefix = [System.Environment]::GetEnvironmentVariable("WMS_MOBILE_TABLE_PREFIX", "Machine")
  if ($currentPrefix) {
    Write-Host "  Prefijo actual: $currentPrefix"
  }
  $tablePrefix = (Read-Host "Prefijo de tablas DynamoDB (ej: rigentec-wms-mobile-dev-)").Trim()
  if (-not $tablePrefix -and $currentPrefix) {
    $tablePrefix = $currentPrefix
    Write-Host "  Manteniendo valor existente."
  }

  # --- Persist to Machine scope ---
  $vars = @{
    WMS_OUTBOUND_SYNC_QUEUE_URL = $outboundUrl
    WMS_INBOUND_SYNC_QUEUE_URL  = $inboundUrl
    AWS_REGION                  = $region
    AWS_ACCESS_KEY_ID           = $accessKey
    AWS_SECRET_ACCESS_KEY       = $secretKey
    WMS_MOBILE_TABLE_PREFIX     = $tablePrefix
  }

  $persisted = 0
  foreach ($entry in $vars.GetEnumerator()) {
    if ($entry.Value) {
      try {
        [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Machine")
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
        $persisted++
      } catch {
        Write-Host "  ADVERTENCIA: no se pudo guardar $($entry.Key) en variables de sistema (requiere Administrador)."
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
      }
    }
  }

  Write-Host ""
  if ($persisted -gt 0) {
    Write-Host "  $persisted variables de sincronizacion guardadas."
  }

  $configured = $outboundUrl -or $inboundUrl
  if ($configured) {
    Write-Host "  Sincronizacion movil quedara activa al iniciar WMS."
  } else {
    Write-Host "  Sin URLs de cola configuradas. La sincronizacion no se activara."
  }

  return $configured
}

# ---------------------------------------------------------------------------
# Auto-configure: reads CDK stack outputs via AWS CLI (no manual input needed)
# ---------------------------------------------------------------------------

function Get-StackOutputsMap {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StackName,
    [string]$Profile = ""
  )

  $profileArg = if ($Profile) { "--profile $Profile" } else { "" }
  $raw = Invoke-Expression "aws cloudformation describe-stacks --stack-name $StackName --query `"Stacks[0].Outputs`" --output json $profileArg 2>&1"
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo leer outputs del stack ${StackName}: $raw"
  }

  $outputs = $raw | ConvertFrom-Json
  $map = @{}
  foreach ($entry in $outputs) {
    $map[$entry.OutputKey] = $entry.OutputValue
  }
  return $map
}

function Build-DatabaseUrlFromStack {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$OutputsMap,
    [string]$Profile = ""
  )

  $dbSecretArn = $OutputsMap["DbSecretArn"]
  $rdsEndpoint = $OutputsMap["RdsEndpoint"]
  $rdsPort     = $OutputsMap["RdsPort"]

  if (-not $dbSecretArn -or -not $rdsEndpoint -or -not $rdsPort) {
    throw "Faltan outputs requeridos (DbSecretArn, RdsEndpoint, RdsPort) en el stack."
  }

  $profileArg = if ($Profile) { "--profile $Profile" } else { "" }
  $secretRaw = Invoke-Expression "aws secretsmanager get-secret-value --secret-id $dbSecretArn --query `"SecretString`" --output text $profileArg 2>&1"
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo leer secreto DB ($dbSecretArn): $secretRaw"
  }

  $secret   = $secretRaw | ConvertFrom-Json
  $username = $secret.username
  $password = $secret.password
  $dbname   = if ($secret.dbname) { $secret.dbname } else { "wms" }

  if (-not $username -or -not $password) {
    throw "El secreto DB no contiene username/password validos."
  }

  $usernameEnc = [System.Uri]::EscapeDataString($username)
  $passwordEnc = [System.Uri]::EscapeDataString($password)
  return "postgresql://${usernameEnc}:${passwordEnc}@${rdsEndpoint}:${rdsPort}/${dbname}?schema=public"
}

function Invoke-AutoSetup {
  param(
    [string]$Profile = "wms-mobile-dev",
    [string]$WebStackName = "WmsWebDevStack",
    [string]$MobileStackName = "RigentecWmsMobileDevStack"
  )

  Write-Host ""
  Write-Host "=== Configuracion automatica desde AWS ==="
  Write-Host "  Perfil AWS:    $Profile"
  Write-Host "  Stack Web:     $WebStackName"
  Write-Host "  Stack Mobile:  $MobileStackName"
  Write-Host ""

  # --- 1. Verify AWS CLI auth ---
  Write-Host "[1/4] Verificando credenciales AWS..."
  try {
    $profileArg = if ($Profile) { "--profile $Profile" } else { "" }
    $identity = Invoke-Expression "aws sts get-caller-identity --output json $profileArg 2>&1" | ConvertFrom-Json
    Write-Host "  Cuenta: $($identity.Account) | ARN: $($identity.Arn)"
  } catch {
    Write-Host "  [ERROR] Credenciales AWS no validas o expiradas."
    Write-Host "  Ejecuta: aws sso login --profile $Profile"
    return $false
  }

  # --- 2. Read DATABASE_URL from web stack ---
  Write-Host ""
  Write-Host "[2/4] Leyendo DATABASE_URL del stack web ($WebStackName)..."
  try {
    $webOutputs = Get-StackOutputsMap -StackName $WebStackName -Profile $Profile
    $databaseUrl = Build-DatabaseUrlFromStack -OutputsMap $webOutputs -Profile $Profile
    $maskedUrl = $databaseUrl -replace "//[^:]+:[^@]+@", "//***:***@"
    Write-Host "  DATABASE_URL = $maskedUrl"
  } catch {
    Write-Host "  [ERROR] $($_.Exception.Message)"
    Write-Host "  Puedes configurar DATABASE_URL manualmente con la opcion manual."
    return $false
  }

  # --- 3. Read sync config from mobile stack ---
  Write-Host ""
  Write-Host "[3/4] Leyendo configuracion de sync del stack mobile ($MobileStackName)..."
  try {
    $mobileOutputs = Get-StackOutputsMap -StackName $MobileStackName -Profile $Profile

    $outboundQueueUrl = $mobileOutputs["OutboundSyncQueueUrl"]
    $inboundQueueUrl  = if ($mobileOutputs["InboundSyncQueueUrl"]) { $mobileOutputs["InboundSyncQueueUrl"] } else { $mobileOutputs["MobileIntegrationQueueUrl"] }
    $awsRegion        = if ($mobileOutputs["AwsRegion"]) { $mobileOutputs["AwsRegion"] } else { "us-east-1" }

    # Derive table prefix from inventory table name (e.g. "rigentec-wms-mobile-dev-inventory" -> "rigentec-wms-mobile-dev-")
    $inventoryTable = $mobileOutputs["MobileInventoryTableName"]
    $tablePrefix    = if ($inventoryTable -and $inventoryTable -match "^(.+-)inventory$") { $Matches[1] } else { "" }

    Write-Host "  Outbound Queue: $(if ($outboundQueueUrl) { 'OK' } else { 'no encontrada' })"
    Write-Host "  Inbound Queue:  $(if ($inboundQueueUrl) { 'OK' } else { 'no encontrada' })"
    Write-Host "  Region:         $awsRegion"
    Write-Host "  Table Prefix:   $(if ($tablePrefix) { $tablePrefix } else { '(vacio)' })"
  } catch {
    Write-Host "  ADVERTENCIA: No se pudo leer el stack mobile ($MobileStackName): $($_.Exception.Message)"
    Write-Host "  La base de datos se configurara pero sync quedara inactivo."
    $outboundQueueUrl = ""
    $inboundQueueUrl  = ""
    $awsRegion        = "us-east-1"
    $tablePrefix      = ""
  }

  # --- 4. Persist all to Machine scope ---
  Write-Host ""
  Write-Host "[4/4] Guardando configuracion..."
  $allVars = @{
    DATABASE_URL                = $databaseUrl
    WMS_DB_MODE                 = "aws"
    WMS_OUTBOUND_SYNC_QUEUE_URL = $outboundQueueUrl
    WMS_INBOUND_SYNC_QUEUE_URL  = $inboundQueueUrl
    AWS_REGION                  = $awsRegion
    WMS_MOBILE_TABLE_PREFIX     = $tablePrefix
  }

  $persisted = 0
  $failed    = 0
  foreach ($entry in $allVars.GetEnumerator()) {
    if ($entry.Value) {
      try {
        [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Machine")
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
        $persisted++
      } catch {
        Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
        $failed++
      }
    }
  }

  if ($failed -gt 0) {
    Write-Host "  ADVERTENCIA: $failed variables no se pudieron guardar permanentemente (requiere Administrador)."
    Write-Host "  Esta sesion queda configurada. Ejecuta como Administrador para hacerlo permanente."
  }

  Write-Host ""
  Write-Host "  --- Resumen ---"
  $maskedFinal = $databaseUrl -replace "//[^:]+:[^@]+@", "//***:***@"
  Write-Host "  Base de datos:         $maskedFinal"
  $syncActive = $outboundQueueUrl -or $inboundQueueUrl
  Write-Host "  Sincronizacion movil:  $(if ($syncActive) { 'ACTIVA' } else { 'INACTIVA' })"
  Write-Host "  Variables guardadas:   $persisted"
  Write-Host ""

  return $true
}
