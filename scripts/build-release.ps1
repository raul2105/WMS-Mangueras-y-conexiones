param(
  [string]$NodeZipPath = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Command
  )

  Write-Host ">> $Command"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
  $pkg = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
  $appName = [string]$pkg.name
  $appVersion = [string]$pkg.version
  if (-not $appName -or -not $appVersion) {
    throw "Could not read name/version from package.json"
  }

  $releaseName = "$appName-$appVersion-windows-x64"
  $releaseRoot = Join-Path $repoRoot "release"
  $releaseDir = Join-Path $releaseRoot $releaseName
  $releaseZip = Join-Path $releaseRoot "$releaseName.zip"

  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

  Invoke-Step "npm run verify:release"

  $standaloneDir = Join-Path $repoRoot ".next\standalone"
  if (-not (Test-Path (Join-Path $standaloneDir "server.js"))) {
    throw "Standalone build output missing: $standaloneDir\server.js"
  }

  $nextStaticDir = Join-Path $repoRoot ".next\static"
  $publicDir = Join-Path $repoRoot "public"
  $schemaPath = Join-Path $repoRoot "prisma\schema.prisma"
  $dbPath = Join-Path $repoRoot "prisma\dev.db"
  $csvTemplatePath = Join-Path $repoRoot "data\products.sample.csv"
  $importScriptPath = Join-Path $repoRoot "scripts\import-products-from-csv.cjs"
  $inventoryJsPath = Join-Path $repoRoot "lib\inventory-service.js"
  $csvParseModulePath = Join-Path $repoRoot "node_modules\csv-parse"

  foreach ($requiredPath in @(
    $nextStaticDir,
    $publicDir,
    $schemaPath,
    $dbPath,
    $csvTemplatePath,
    $importScriptPath,
    $inventoryJsPath,
    $csvParseModulePath
  )) {
    if (-not (Test-Path $requiredPath)) {
      throw "Required path not found: $requiredPath"
    }
  }

  $nodeVersion = (& node -p "process.version").Trim()
  if (-not $nodeVersion.StartsWith("v")) {
    $nodeVersion = "v$nodeVersion"
  }

  $nodeArchiveName = "node-$nodeVersion-win-x64.zip"
  $cacheDir = Join-Path $repoRoot ".release-cache\node"
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  $nodeArchivePath = Join-Path $cacheDir $nodeArchiveName

  if ($NodeZipPath) {
    $sourceArchive = (Resolve-Path $NodeZipPath).Path
    Copy-Item -LiteralPath $sourceArchive -Destination $nodeArchivePath -Force
  } elseif (-not (Test-Path $nodeArchivePath)) {
    $nodeUrl = "https://nodejs.org/dist/$nodeVersion/$nodeArchiveName"
    Write-Host ">> Downloading portable Node from $nodeUrl"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeArchivePath
  }

  if (Test-Path $releaseDir) {
    Remove-Item -LiteralPath $releaseDir -Recurse -Force
  }
  if (Test-Path $releaseZip) {
    Remove-Item -LiteralPath $releaseZip -Force
  }

  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
  $releaseAppDir = Join-Path $releaseDir "app"
  $releaseAppNextDir = Join-Path $releaseAppDir ".next"
  $releaseAppPrismaDir = Join-Path $releaseAppDir "prisma"
  $releaseAppDataDir = Join-Path $releaseAppDir "data"
  $releaseAppScriptsDir = Join-Path $releaseAppDir "scripts"
  $releaseAppLibDir = Join-Path $releaseAppDir "lib"
  $releaseAppNodeModulesDir = Join-Path $releaseAppDir "node_modules"
  $releaseAppUploadsProductsDir = Join-Path $releaseAppDir "public\uploads\products"
  $releaseAppUploadsReceiptsDir = Join-Path $releaseAppDir "public\uploads\receipts"
  $releaseBootstrapDir = Join-Path $releaseDir "bootstrap"
  $releaseRuntimeDir = Join-Path $releaseDir "runtime"
  $releaseToolsDir = Join-Path $releaseDir "tools"
  $releaseToolsMaintenanceDir = Join-Path $releaseToolsDir "maintenance"
  $releaseMaintenanceDir = Join-Path $releaseDir "maintenance"

  foreach ($dirPath in @(
    $releaseAppDir,
    $releaseAppNextDir,
    $releaseAppPrismaDir,
    $releaseAppDataDir,
    $releaseAppScriptsDir,
    $releaseAppLibDir,
    $releaseAppNodeModulesDir,
    $releaseBootstrapDir,
    $releaseRuntimeDir,
    $releaseToolsDir,
    $releaseToolsMaintenanceDir,
    $releaseMaintenanceDir,
    $releaseAppUploadsProductsDir,
    $releaseAppUploadsReceiptsDir
  )) {
    New-Item -ItemType Directory -Path $dirPath -Force | Out-Null
  }

  Write-Host ">> Copying standalone application"
  Copy-Item -Path (Join-Path $standaloneDir "*") -Destination $releaseAppDir -Recurse -Force
  Copy-Item -LiteralPath $nextStaticDir -Destination $releaseAppNextDir -Recurse -Force
  Copy-Item -LiteralPath $publicDir -Destination $releaseAppDir -Recurse -Force
  Copy-Item -LiteralPath $schemaPath -Destination $releaseAppPrismaDir -Force
  Copy-Item -LiteralPath $dbPath -Destination (Join-Path $releaseBootstrapDir "initial.db") -Force
  Copy-Item -LiteralPath $csvTemplatePath -Destination $releaseAppDataDir -Force
  Copy-Item -LiteralPath $importScriptPath -Destination $releaseAppScriptsDir -Force
  Copy-Item -LiteralPath $inventoryJsPath -Destination $releaseAppLibDir -Force
  Copy-Item -LiteralPath $csvParseModulePath -Destination $releaseAppNodeModulesDir -Recurse -Force
  Get-ChildItem -LiteralPath $releaseAppDir -Filter ".env*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $releaseAppPrismaDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*.db*" } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  Write-Host ">> Extracting portable Node runtime"
  Expand-Archive -Path $nodeArchivePath -DestinationPath $releaseRuntimeDir -Force
  $extractedNodeDir = Join-Path $releaseRuntimeDir "node-$nodeVersion-win-x64"
  $portableNodeDir = Join-Path $releaseRuntimeDir "node"
  if (Test-Path $portableNodeDir) {
    Remove-Item -LiteralPath $portableNodeDir -Recurse -Force
  }
  Move-Item -LiteralPath $extractedNodeDir -Destination $portableNodeDir

  Write-Host ">> Copying launcher scripts"
  foreach ($launcher in @("launcher.cmd", "stop.cmd")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $launcher) -Destination $releaseDir -Force
  }
  foreach ($maintenanceCmd in @("init-local.cmd", "healthcheck.cmd", "backup-db.cmd", "restore-db.cmd")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "maintenance\$maintenanceCmd") -Destination $releaseMaintenanceDir -Force
  }
  foreach ($psLauncher in @("common.ps1", "launcher.ps1", "stop.ps1")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\release\$psLauncher") -Destination $releaseToolsDir -Force
  }
  foreach ($maintenancePs in @("init-local.ps1", "healthcheck.ps1", "backup-db.ps1", "restore-db.ps1")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\release\maintenance\$maintenancePs") -Destination $releaseToolsMaintenanceDir -Force
  }

  Write-Host ">> Compressing release archive"
  Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $releaseZip -Force

  Write-Host ""
  Write-Host "Release folder: $releaseDir"
  Write-Host "Release zip:    $releaseZip"
}
finally {
  Pop-Location
}
