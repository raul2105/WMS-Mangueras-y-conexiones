param(
  [int]$Port = 5555,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "..\common.ps1")

function Get-RepoRoot {
  $candidate = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
  $packageJson = Join-Path $candidate "package.json"
  $schemaPath = Join-Path $candidate "prisma\postgresql\schema.prisma"

  if ((Test-Path -LiteralPath $packageJson) -and (Test-Path -LiteralPath $schemaPath)) {
    return $candidate
  }

  throw "No se pudo localizar la raiz del repositorio para Prisma Studio."
}

function Normalize-DatabaseUrl {
  param([string]$Value)

  if (-not $Value) {
    return ""
  }

  $normalized = $Value.Trim()
  if ($normalized.Length -ge 2) {
    $first = $normalized.Substring(0, 1)
    $last = $normalized.Substring($normalized.Length - 1, 1)
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      $normalized = $normalized.Substring(1, $normalized.Length - 2)
    }
  }

  return $normalized
}

function Test-PostgresUrl {
  param([string]$Value)

  return [string]::IsNullOrWhiteSpace($Value) -eq $false -and $Value -match '^postgres(ql)?://'
}

function Test-AwsRdsUrl {
  param([string]$Value)

  if (-not (Test-PostgresUrl -Value $Value)) {
    return $false
  }

  if ($Value -match '^postgres(?:ql)?://[^@]+@([^/:?]+)') {
    return $Matches[1] -match '\.rds\.amazonaws\.com$'
  }

  if ($Value -match '^postgres(?:ql)?://([^/:?]+)') {
    return $Matches[1] -match '\.rds\.amazonaws\.com$'
  }

  try {
    $uri = [System.Uri]$Value
    return $uri.Host -match '\.rds\.amazonaws\.com$'
  } catch {
    return $false
  }
}

function Get-DatabaseUrlFromEnvFile {
  param([string]$EnvFilePath)

  if (-not (Test-Path -LiteralPath $EnvFilePath)) {
    return ""
  }

  $line = Get-Content -LiteralPath $EnvFilePath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1

  if (-not $line) {
    return ""
  }

  $parts = $line -split "=", 2
  if ($parts.Count -lt 2) {
    return ""
  }

  return (Normalize-DatabaseUrl -Value $parts[1])
}

function Get-DatabaseUrlFromMachineEnv {
  $value = [System.Environment]::GetEnvironmentVariable("DATABASE_URL", "Machine")
  return (Normalize-DatabaseUrl -Value $value)
}

function Get-ResolvedDatabaseUrl {
  $candidates = @(
    (Normalize-DatabaseUrl -Value $env:DATABASE_URL),
    (Get-DatabaseUrlFromEnvFile -EnvFilePath (Join-Path (Get-RepoRoot) ".env")),
    (Get-DatabaseUrlFromMachineEnv)
  )

  foreach ($candidate in $candidates) {
    if (Test-AwsRdsUrl -Value $candidate) {
      return $candidate
    }
  }

  return ""
}

function Assert-PortFree {
  param([int]$Port)

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $listener) {
    return
  }

  $processId = $listener.OwningProcess
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue

  Write-Host "[ERROR] El puerto $Port ya esta en uso (PID $processId)."
  if ($processInfo -and $processInfo.CommandLine) {
    Write-Host "[ERROR] CommandLine: $($processInfo.CommandLine)"
  }

  throw "Prisma Studio requiere un puerto libre."
}

function Wait-ForListener {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($listener) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

$repoRoot = Get-RepoRoot
$schemaPath = Join-Path $repoRoot "prisma\postgresql\schema.prisma"
$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = if ($nodeCommand.Source) { $nodeCommand.Source } else { $nodeCommand.Path }
$prismaCliPath = Join-Path $repoRoot "node_modules\prisma\build\index.js"
$logRoot = Join-Path $env:LOCALAPPDATA "wms-scmayer\logs"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutLog = Join-Path $logRoot "prisma-studio-$timestamp.out.log"
$stderrLog = Join-Path $logRoot "prisma-studio-$timestamp.err.log"

if (-not (Test-Path -LiteralPath $prismaCliPath)) {
  throw "No se encontro Prisma CLI en $prismaCliPath. Ejecuta npm install antes de abrir Studio."
}

if (-not (Test-Path -LiteralPath $schemaPath)) {
  throw "No se encontro el schema PostgreSQL en $schemaPath."
}

if (-not (Test-Path -LiteralPath $logRoot)) {
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
}

$databaseUrl = Get-ResolvedDatabaseUrl
if (-not $databaseUrl) {
  Write-Host "[INFO] No hay DATABASE_URL AWS valida. Ejecutando configuracion automatica..."
  $ok = Invoke-AutoSetup
  if (-not $ok) {
    throw "No se pudo configurar la base AWS para Prisma Studio."
  }

  $databaseUrl = Get-ResolvedDatabaseUrl
}

if (-not $databaseUrl) {
  throw "No se pudo resolver una DATABASE_URL PostgreSQL de AWS valida."
}

Assert-PortFree -Port $Port

$env:DATABASE_URL = $databaseUrl
$env:WMS_DB_MODE = "aws"

$studioUrl = "http://$HostName`:$Port"
Write-Host ""
Write-Host "=== Prisma Studio AWS ==="
Write-Host "  Schema:     $schemaPath"
Write-Host "  URL:        $studioUrl"
Write-Host "  Logs:       $stdoutLog"
Write-Host "  Errores:    $stderrLog"
Write-Host ""

$process = Start-Process `
  -FilePath $nodePath `
  -ArgumentList @(
    $prismaCliPath,
    "studio",
    "--port", "$Port",
    "--hostname", $HostName,
    "--browser", "none",
    "--schema", $schemaPath
  ) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

if (-not (Wait-ForListener -Port $Port -TimeoutSeconds 60)) {
  try {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  } catch {
    # Ignore cleanup failures; the logs are the important artifact here.
  }

  throw "Prisma Studio no levanto en 60 segundos. Revisa $stdoutLog y $stderrLog."
}

Write-Host "Prisma Studio listo."
Start-Process "$studioUrl"

try {
  Wait-Process -Id $process.Id
} finally {
  Write-Host ""
  Write-Host "Prisma Studio termino."
}
