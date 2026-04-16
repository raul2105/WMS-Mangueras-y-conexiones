$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\common.ps1")

Write-Host ""
Write-Host "=== Configuracion de WMS para AWS ==="
Write-Host ""
Write-Host "  [1] Automatico - Lee todo desde los stacks de CloudFormation (recomendado)"
Write-Host "  [2] Manual     - Ingresar DATABASE_URL y sync manualmente"
Write-Host ""

$mode = (Read-Host "Selecciona modo (1/2)").Trim()

if ($mode -eq "1") {
  Write-Host ""
  $profile = (Read-Host "Perfil AWS CLI (default: wms-mobile-dev)").Trim()
  if (-not $profile) { $profile = "wms-mobile-dev" }

  $webStack = (Read-Host "Nombre del stack web (default: WmsWebDevStack)").Trim()
  if (-not $webStack) { $webStack = "WmsWebDevStack" }

  $mobileStack = (Read-Host "Nombre del stack mobile (default: RigentecWmsMobileDevStack)").Trim()
  if (-not $mobileStack) { $mobileStack = "RigentecWmsMobileDevStack" }

  $ok = Invoke-AutoSetup -Profile $profile -WebStackName $webStack -MobileStackName $mobileStack
  if (-not $ok) {
    Write-Host ""
    Write-Host "Configuracion automatica fallo. Intenta con la opcion manual (2)."
    exit 1
  }
} elseif ($mode -eq "2") {
  Write-Host ""
  Write-Host "--- Base de datos ---"
  Write-Host ""

  $url = Invoke-AwsDatabaseSetup

  if (-not $url) {
    Write-Host ""
    Write-Host "Configuracion cancelada."
    exit 0
  }

  Write-Host ""
  Write-Host "Base de datos configurada."
  Write-Host ""

  $setupSync = (Read-Host "Deseas configurar sincronizacion movil? (S/N)").Trim()
  if ($setupSync -match "^[SsYy]") {
    Invoke-SyncSetup
  }
} else {
  Write-Host "Opcion no valida."
  exit 1
}

Write-Host ""
Write-Host "Configuracion completa. Puedes lanzar la aplicacion con: launcher.cmd"
