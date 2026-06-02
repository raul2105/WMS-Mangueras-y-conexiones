param(
  [switch]$Auto,
  [string]$Profile = "wms-mobile-dev",
  [string]$WebStackName = "WmsWebDevStack",
  [string]$MobileStackName = "RigentecWmsMobileDevStack"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\common.ps1")

function Read-TrimmedInput {
  param([string]$Prompt)

  $raw = Read-Host $Prompt
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return ""
  }

  return $raw.Trim()
}

Write-Host ""
Write-Host "=== Configuracion de WMS para AWS ==="
Write-Host ""
Write-Host "  [1] Automatico - Lee todo desde los stacks de CloudFormation (recomendado)"
Write-Host "  [2] Manual     - Ingresar DATABASE_URL y sync manualmente"
Write-Host ""

if ($Auto) {
  $mode = "1"
} else {
  $mode = Read-TrimmedInput "Selecciona modo (1/2)"
  if (-not $mode) {
    $mode = "1"
    Write-Host "[INFO] Sin seleccion. Usando modo automatico (1)."
  }
}

if ($mode -eq "1") {
  Write-Host ""
  if (-not $Auto) {
    $profileInput = Read-TrimmedInput "Perfil AWS CLI (default: $Profile)"
    if ($profileInput) { $Profile = $profileInput }

    $webStackInput = Read-TrimmedInput "Nombre del stack web (default: $WebStackName)"
    if ($webStackInput) { $WebStackName = $webStackInput }

    $mobileStackInput = Read-TrimmedInput "Nombre del stack mobile (default: $MobileStackName)"
    if ($mobileStackInput) { $MobileStackName = $mobileStackInput }
  }

  $ok = Invoke-AutoSetup -Profile $Profile -WebStackName $WebStackName -MobileStackName $MobileStackName
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

  $setupSync = Read-TrimmedInput "Deseas configurar sincronizacion movil? (S/N)"
  if ($setupSync -match "^[SsYy]") {
    Invoke-SyncSetup
  }
} else {
  Write-Host "Opcion no valida."
  exit 1
}

Write-Host ""
Write-Host "Configuracion completa. Puedes lanzar la aplicacion con: launcher.cmd"
