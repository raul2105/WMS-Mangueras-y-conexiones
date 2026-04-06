param(
  [string]$ReleaseRoot = "",
  [ValidateSet("menu", "keep-data", "full")]
  [string]$Mode = "menu",
  [switch]$KeepData,
  [switch]$Full,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

if ($KeepData) {
  $Mode = "keep-data"
}
if ($Full) {
  $Mode = "full"
}

function Select-UninstallMode {
  while ($true) {
    Write-Host ""
    Write-Host "Selecciona el modo de desinstalacion:"
    Write-Host "  1) Desinstalar conservando datos (BD y respaldos)"
    Write-Host "  2) Desinstalar completamente (incluye BD y respaldos)"
    Write-Host "  Q) Cancelar"
    $selection = (Read-Host "Opcion").Trim().ToUpperInvariant()
    switch ($selection) {
      "1" { return "keep-data" }
      "2" { return "full" }
      "Q" { throw "Operacion cancelada por el usuario." }
      default {
        Write-Host "Opcion invalida. Intenta de nuevo."
      }
    }
  }
}

function Confirm-Action {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PromptMessage
  )

  $answer = (Read-Host "$PromptMessage (SI/NO)").Trim().ToUpperInvariant()
  return $answer -eq "SI"
}

function Confirm-Strong {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PromptMessage,
    [Parameter(Mandatory = $true)]
    [string]$RequiredText
  )

  Write-Host $PromptMessage
  $answer = Read-Host "Escribe exactamente '$RequiredText' para continuar"
  return $answer -eq $RequiredText
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$sessionRoot = Join-Path $env:TEMP "wms-scmayer-uninstall\$timestamp"
Ensure-Directory -Path $sessionRoot
$sessionLog = Join-Path $sessionRoot "uninstall.log"
$cleanupReportPath = Join-Path $sessionRoot "cleanup-report.txt"

function Write-SessionLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [string]$Level = "INFO"
  )

  $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
  Add-Content -LiteralPath $sessionLog -Value $entry -Encoding utf8
}

$reportLines = [System.Collections.Generic.List[string]]::new()

function Add-ReportLine {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Line
  )

  $reportLines.Add($Line) | Out-Null
}

function Save-CleanupReport {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ExitCode,
    [string]$Result = "UNKNOWN"
  )

  $reportHeader = @(
    "WMS-SCMayer - Cleanup Report",
    "Result: $Result",
    "ExitCode: $ExitCode",
    "GeneratedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "SessionDir: $sessionRoot",
    "LogFile: $sessionLog",
    ""
  )

  Set-Content -LiteralPath $cleanupReportPath -Value ($reportHeader + $reportLines) -Encoding utf8
}

$startTime = Get-Date
$result = "FAILED"
$exitCode = 1
$state = $null

try {
  if ($Mode -eq "menu") {
    $Mode = Select-UninstallMode
  }

  if ($ReleaseRoot) {
    $resolvedReleaseRoot = Resolve-NormalizedPath -Path $ReleaseRoot
    $state = Get-WmsState -ReleaseRoot $resolvedReleaseRoot
  } else {
    $state = Get-WmsState
  }

  Ensure-WmsStateDirectories -State $state -IncludeData
  Write-SessionLog -Message "Uninstall mode selected: $Mode"
  Write-SessionLog -Message "ReleaseRoot: $($state.ReleaseRoot)"
  Write-SessionLog -Message "StateRoot: $($state.StateRoot)"
  Write-OpsLog -State $state -Message "Uninstall requested. mode=$Mode releaseRoot=$($state.ReleaseRoot)"

  $uploadsDir = Join-Path $state.AppDir "public\uploads"
  $uploadsDetected = Test-DirectoryHasFiles -Path $uploadsDir
  $removedShortcuts = @()
  $removedItems = [System.Collections.Generic.List[string]]::new()
  $skippedItems = [System.Collections.Generic.List[string]]::new()

  Add-ReportLine "Mode: $Mode"
  Add-ReportLine "ReleaseRoot: $($state.ReleaseRoot)"
  Add-ReportLine "StateRoot: $($state.StateRoot)"
  Add-ReportLine "UploadsDir: $uploadsDir"
  Add-ReportLine "UploadsDetected: $uploadsDetected"
  Add-ReportLine "StartedAt: $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Add-ReportLine ""

  Write-Host ""
  Write-Host "Resumen de acciones:"
  if ($Mode -eq "keep-data") {
    Write-Host " - Se conservaran la base SQLite y los respaldos."
    Write-Host " - Se borraran binarios release, accesos directos, logs, PID y cache."
  } else {
    Write-Host " - Se borrara TODO: release, estado local, base SQLite y respaldos."
  }
  Write-Host " - Reporte final: $cleanupReportPath"
  Write-Host ""

  if (-not (Confirm-Action -PromptMessage "Confirma que deseas continuar")) {
    throw "Operacion cancelada por el usuario."
  }

  if ($Mode -eq "keep-data" -and $uploadsDetected) {
    $message = "Se detectaron archivos adjuntos en $uploadsDir. Para conservar datos, respalda/mueve esos adjuntos antes de continuar."
    Write-SessionLog -Level "WARN" -Message $message
    Write-OpsLog -State $state -Level "WARN" -Message $message
    Add-ReportLine "BlockedReason: uploads_present"
    throw $message
  }

  if ($Mode -eq "full") {
    if (-not (Confirm-Strong -PromptMessage "Vas a eliminar la base de datos local." -RequiredText "ELIMINAR BASE")) {
      throw "Confirmacion fuerte no valida para borrar la base de datos."
    }
    if (-not (Confirm-Strong -PromptMessage "Vas a eliminar todos los respaldos locales." -RequiredText "ELIMINAR RESPALDOS")) {
      throw "Confirmacion fuerte no valida para borrar respaldos."
    }
  }

  Write-Host "Deteniendo servicio WMS..."
  $stoppedPid = Stop-WmsProcess -State $state
  if ($stoppedPid) {
    Write-SessionLog -Message "WMS stopped (PID $stoppedPid)."
    Write-OpsLog -State $state -Message "WMS stopped during uninstall (PID $stoppedPid)."
    Add-ReportLine "StoppedPid: $stoppedPid"
  } else {
    Write-SessionLog -Message "No running WMS process detected before cleanup."
    Add-ReportLine "StoppedPid: none"
  }

  if (Test-WmsProcessRunningForRelease -State $state) {
    $message = "No fue posible detener completamente el servidor WMS. Cierra el proceso y vuelve a ejecutar desinstalacion."
    Write-SessionLog -Level "ERROR" -Message $message
    Add-ReportLine "BlockedReason: process_still_running"
    throw $message
  }

  $lockCheck = Test-SqliteArtifactsUnlocked -State $state
  if (-not $lockCheck.IsUnlocked) {
    $message = "La base de datos esta bloqueada: $($lockCheck.LockedPath). Cierra procesos que usen la base y vuelve a intentar."
    Write-SessionLog -Level "ERROR" -Message $message
    Add-ReportLine "BlockedReason: db_locked"
    Add-ReportLine "LockedPath: $($lockCheck.LockedPath)"
    throw $message
  }

  Write-Host "Eliminando accesos directos..."
  $removedShortcuts = Remove-WmsShortcutsForRelease -State $state
  foreach ($shortcutPath in $removedShortcuts) {
    $removedItems.Add("shortcut:$shortcutPath") | Out-Null
  }
  Write-SessionLog -Message "Shortcuts removed: $($removedShortcuts.Count)"

  foreach ($path in @($state.PidFile, $state.RunDir, $state.LogDir, $state.CacheDir)) {
    if (Test-Path $path) {
      $recurse = (Get-Item -LiteralPath $path).PSIsContainer
      Remove-SafeItem -State $state -Path $path -Recurse:$recurse | Out-Null
      $removedItems.Add($path) | Out-Null
      Write-SessionLog -Message "Removed: $path"
    } else {
      $skippedItems.Add("$path (not found)") | Out-Null
    }
  }

  if ($Mode -eq "full") {
    foreach ($path in @($state.DbPath, $state.DbWalPath, $state.DbShmPath, $state.BackupDir, $state.DataDir)) {
      if (Test-Path $path) {
        $recurse = (Get-Item -LiteralPath $path).PSIsContainer
        Remove-SafeItem -State $state -Path $path -Recurse:$recurse | Out-Null
        $removedItems.Add($path) | Out-Null
        Write-SessionLog -Message "Removed: $path"
      } else {
        $skippedItems.Add("$path (not found)") | Out-Null
      }
    }
  } else {
    $skippedItems.Add("$($state.DbPath) (kept by mode)") | Out-Null
    $skippedItems.Add("$($state.BackupDir) (kept by mode)") | Out-Null
  }

  if (Test-Path $state.ReleaseRoot) {
    Remove-SafeItem -State $state -Path $state.ReleaseRoot -Recurse | Out-Null
    $removedItems.Add($state.ReleaseRoot) | Out-Null
    Write-SessionLog -Message "Release folder removed: $($state.ReleaseRoot)"
  }

  if ($Mode -eq "full" -and (Test-Path $state.StateRoot)) {
    $entries = @(Get-ChildItem -LiteralPath $state.StateRoot -Force -ErrorAction SilentlyContinue)
    if ($entries.Count -eq 0) {
      Remove-SafeItem -State $state -Path $state.StateRoot -Recurse | Out-Null
      $removedItems.Add($state.StateRoot) | Out-Null
      Write-SessionLog -Message "State root removed: $($state.StateRoot)"
    }
  }

  Add-ReportLine "RemovedShortcuts: $($removedShortcuts.Count)"
  foreach ($shortcutPath in $removedShortcuts) {
    Add-ReportLine " - $shortcutPath"
  }
  Add-ReportLine ""
  Add-ReportLine "RemovedItems:"
  foreach ($item in $removedItems) {
    Add-ReportLine " - $item"
  }
  Add-ReportLine ""
  Add-ReportLine "SkippedItems:"
  foreach ($item in $skippedItems) {
    Add-ReportLine " - $item"
  }
  Add-ReportLine ""
  Add-ReportLine "EndedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

  Write-Host ""
  Write-Host "Desinstalacion completada correctamente."
  Write-Host "Reporte final: $cleanupReportPath"
  if ($Mode -eq "keep-data") {
    Write-Host "Base de datos y respaldos se conservaron."
  } else {
    Write-Host "Se elimino el estado local completo (incluyendo base y respaldos)."
  }

  $result = "SUCCESS"
  $exitCode = 0
} catch {
  $errorMessage = $_.Exception.Message
  Write-SessionLog -Level "ERROR" -Message $errorMessage
  Add-ReportLine ""
  Add-ReportLine "Error: $errorMessage"
  Add-ReportLine "EndedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  Write-Host ""
  Write-Host "Desinstalacion abortada."
  Write-Host $errorMessage
  Write-Host "Reporte final: $cleanupReportPath"
  $result = "FAILED"
  $exitCode = 1
} finally {
  Save-CleanupReport -ExitCode $exitCode -Result $result
  if ((-not $NoPause) -and $Host.Name -match "ConsoleHost") {
    Write-Host ""
    pause
  }
}

exit $exitCode
