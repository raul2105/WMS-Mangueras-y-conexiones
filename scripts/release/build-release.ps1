param(
  [string]$NodeZipPath = "",
  [ValidateSet("aws", "local")]
  [string]$DbMode = "aws",
  [switch]$AllowLegacyLocalBootstrap
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

function Assert-NoRepoNodeProcesses {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $normalizedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
  $escapedRoot = [Regex]::Escape($normalizedRoot)

  $blocking = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $escapedRoot })

  if ($blocking.Count -eq 0) {
    return
  }

  Write-Host ""
  Write-Host "Detected Node processes using this repository:"
  foreach ($proc in $blocking) {
    Write-Host "  PID $($proc.ProcessId): $($proc.CommandLine)"
  }
  Write-Host ""
  throw "Stop those processes before running build-release (common lock: .prisma query_engine-windows.dll.node)."
}

function Assert-PrismaEngineUnlocked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $enginePath = Join-Path $RepoRoot "node_modules\.prisma\client\query_engine-windows.dll.node"
  if (-not (Test-Path $enginePath)) {
    return
  }

  try {
    $lockProbe = [System.IO.File]::Open($enginePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $lockProbe.Close()
    $lockProbe.Dispose()
  }
  catch {
    throw "Prisma engine is locked: $enginePath. Stop Node processes using this repo and retry build-release."
  }
}

function Build-LegacyBootstrapDatabase {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  $bootstrapDbPath = Join-Path $RepoRoot "prisma\bootstrap-template.db"
  $fallbackDbPath = Join-Path $RepoRoot "prisma\dev.db"
  foreach ($artifact in @($bootstrapDbPath, "$bootstrapDbPath-wal", "$bootstrapDbPath-shm")) {
    if (Test-Path $artifact) {
      Remove-Item -LiteralPath $artifact -Force -ErrorAction SilentlyContinue
    }
  }

  $sqliteUrl = "file:./bootstrap-template.db"
  $previousDatabaseUrl = $env:DATABASE_URL

  $generated = $false
  try {
    $env:DATABASE_URL = $sqliteUrl
    Invoke-Step "npx prisma db push --schema prisma/schema.prisma --accept-data-loss --skip-generate"
    Invoke-Step "node prisma/seed.cjs"
    if (Test-Path $bootstrapDbPath) {
      Copy-Item -LiteralPath $bootstrapDbPath -Destination $OutputPath -Force
      $generated = $true
    }
  }
  catch {
    Write-Warning "Could not generate isolated bootstrap DB via Prisma CLI. Falling back to prisma/dev.db. Details: $($_.Exception.Message)"
  }
  finally {
    if ($null -eq $previousDatabaseUrl) {
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
      $env:DATABASE_URL = $previousDatabaseUrl
    }
  }

  if (-not $generated) {
    if (-not (Test-Path $fallbackDbPath)) {
      throw "Bootstrap database generation failed and fallback DB was not found at $fallbackDbPath"
    }
    Copy-Item -LiteralPath $fallbackDbPath -Destination $OutputPath -Force
  }

  foreach ($artifact in @($bootstrapDbPath, "$bootstrapDbPath-wal", "$bootstrapDbPath-shm")) {
    if (Test-Path $artifact) {
      Remove-Item -LiteralPath $artifact -Force -ErrorAction SilentlyContinue
    }
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
Push-Location $repoRoot
$restoreDefaultPrismaClient = $false
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

  Assert-NoRepoNodeProcesses -RepoRoot $repoRoot
  Assert-PrismaEngineUnlocked -RepoRoot $repoRoot
  if ($DbMode -eq "local" -and -not $AllowLegacyLocalBootstrap) {
    throw "DbMode=local usa bootstrap SQLite legado y no es canonico para WMS PostgreSQL. Usa DbMode=aws o agrega -AllowLegacyLocalBootstrap de forma explicita."
  }
  Invoke-Step "npm run verify:release"

  if ($DbMode -eq "aws") {
    Write-Host ">> Preparing AWS Prisma client and build output"
    Invoke-Step "node scripts/db/generate-aws-prisma-client.cjs"
    $restoreDefaultPrismaClient = $true
    Invoke-Step "npm run build"
  }

  $standaloneDir = Join-Path $repoRoot ".next\standalone"
  if (-not (Test-Path (Join-Path $standaloneDir "server.js"))) {
    throw "Standalone build output missing: $standaloneDir\server.js"
  }

  $standaloneAwsSdk = Join-Path $standaloneDir "node_modules\@aws-sdk"
  if (-not (Test-Path $standaloneAwsSdk)) {
    Write-Host ">> @aws-sdk not found in standalone output - copying from repo node_modules"
    $repoAwsSdk = Join-Path $repoRoot "node_modules\@aws-sdk"
    if (-not (Test-Path $repoAwsSdk)) {
      Write-Warning "@aws-sdk not installed in repo. Sync workers will not function in release. Run: npm install @aws-sdk/client-sqs @aws-sdk/client-dynamodb"
    } else {
      $standaloneNodeModules = Join-Path $standaloneDir "node_modules\@aws-sdk"
      Copy-Item -LiteralPath $repoAwsSdk -Destination $standaloneNodeModules -Recurse -Force
      $smithy = Join-Path $repoRoot "node_modules\@smithy"
      if (Test-Path $smithy) {
        Copy-Item -LiteralPath $smithy -Destination (Join-Path $standaloneDir "node_modules\@smithy") -Recurse -Force
      }
      Write-Host "  @aws-sdk copied to standalone output"
    }
  } else {
    Write-Host ">> @aws-sdk present in standalone output"
  }

  $nextStaticDir = Join-Path $repoRoot ".next\static"
  $publicDir = Join-Path $repoRoot "public"
  $schemaPath = Join-Path $repoRoot "prisma\postgresql\schema.prisma"
  $csvTemplatePath = Join-Path $repoRoot "data\products.sample.csv"
  $importScriptPath = Join-Path $repoRoot "scripts\data\import-products-from-csv.cjs"
  $csvParseModulePath = Join-Path $repoRoot "node_modules\csv-parse"

  foreach ($requiredPath in @(
    $nextStaticDir,
    $publicDir,
    $schemaPath,
    $csvTemplatePath,
    $importScriptPath,
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
  if ($DbMode -eq "local") {
    Build-LegacyBootstrapDatabase -RepoRoot $repoRoot -OutputPath (Join-Path $releaseBootstrapDir "initial.db")
  }
  Copy-Item -LiteralPath $csvTemplatePath -Destination $releaseAppDataDir -Force
  Copy-Item -LiteralPath $importScriptPath -Destination $releaseAppScriptsDir -Force
  Copy-Item -LiteralPath $csvParseModulePath -Destination $releaseAppNodeModulesDir -Recurse -Force
  Get-ChildItem -LiteralPath $releaseAppDir -Filter ".env*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $releaseAppDir -Filter "prisma_error.txt" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
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
  foreach ($launcher in @("launcher.cmd", "stop.cmd", "uninstall.cmd")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot $launcher) -Destination $releaseDir -Force
  }
  foreach ($maintenanceCmd in @("init-local.cmd", "healthcheck.cmd", "backup-db.cmd", "restore-db.cmd", "setup-aws.cmd")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "maintenance\$maintenanceCmd") -Destination $releaseMaintenanceDir -Force
  }
  foreach ($psLauncher in @("common.ps1", "launcher.ps1", "stop.ps1", "uninstall.ps1")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\release\$psLauncher") -Destination $releaseToolsDir -Force
  }
  foreach ($maintenancePs in @("init-local.ps1", "healthcheck.ps1", "backup-db.ps1", "restore-db.ps1", "setup-aws.ps1")) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\release\maintenance\$maintenancePs") -Destination $releaseToolsMaintenanceDir -Force
  }

  Write-Host ">> Compressing release archive"
  Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $releaseZip -Force

  Write-Host ""
  Write-Host "Release folder: $releaseDir"
  Write-Host "Release zip:    $releaseZip"
}
finally {
  if ($restoreDefaultPrismaClient) {
    try {
      Invoke-Step "node scripts/db/generate-default-prisma-client.cjs"
    } catch {
      Write-Warning "No se pudo restaurar el Prisma client por defecto: $($_.Exception.Message)"
    }
  }
  Pop-Location
}
