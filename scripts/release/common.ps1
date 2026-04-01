Set-StrictMode -Version Latest

$script:WmsAppName = "wms-rigentec"
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
    SqliteUrl = Convert-ToSqliteUrl -Path $dbPath
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
      $nameMatches = $shortcutName -match "(?i)wms|rigentec"
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
