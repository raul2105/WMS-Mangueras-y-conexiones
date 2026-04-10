<#
.SYNOPSIS
  Build and deploy WMS to AWS (Lambda + CloudFront via OpenNext + CDK)
.DESCRIPTION
  1. Generate Prisma client for the AWS PostgreSQL schema
  2. Build Next.js with OpenNext
  3. Apply PostgreSQL migrations
  4. Clean Windows-specific Prisma engines from Lambda bundle
  5. Ensure ARM64 Prisma engine exists
  6. Deploy via CDK
  7. Update Lambda env vars and verify health
.PARAMETER SkipBuild
  Skip the OpenNext build step (use existing .open-next/)
.PARAMETER Profile
  AWS CLI profile name (default: wms-mobile-dev)
.PARAMETER StackName
  CloudFormation stack name (default: WmsWebDevStack)
.PARAMETER LambdaFunctionName
  Lambda function name to update env vars (default: wms-web-dev-server)
.PARAMETER SkipMigrate
  Skip DB migration step before deploy (not recommended)
#>
param(
    [switch]$SkipBuild,
    [switch]$SkipMigrate,
    [string]$Profile = "wms-mobile-dev",
    [string]$StackName = "WmsWebDevStack",
    [string]$LambdaFunctionName = "wms-web-dev-server"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path "$PSScriptRoot\..\.."
$openNextDir = Join-Path $projectRoot ".open-next"
$serverBundle = Join-Path $openNextDir "server-functions\default"
$prismaClientDir = Join-Path $serverBundle "node_modules\.prisma\client"
$cdkDir = Join-Path $projectRoot "infra\cdk"
$awsPrismaSchemaPath = Join-Path $projectRoot "prisma\postgresql\schema.prisma"

$env:AWS_PROFILE = $Profile

Write-Host "`n=== WMS AWS Deploy ===" -ForegroundColor Cyan

function Get-StackOutputsMap {
    param([string]$CurrentStackName)

    $raw = aws cloudformation describe-stacks --stack-name $CurrentStackName --query "Stacks[0].Outputs" --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo leer outputs de stack ${CurrentStackName}: $raw"
    }

    $outputs = $raw | ConvertFrom-Json
    $map = @{}
    foreach ($entry in $outputs) {
        $map[$entry.OutputKey] = $entry.OutputValue
    }
    return $map
}

function Build-DatabaseUrlFromStack {
    param([hashtable]$OutputsMap)

    $dbSecretArn = $OutputsMap["DbSecretArn"]
    $rdsEndpoint = $OutputsMap["RdsEndpoint"]
    $rdsPort = $OutputsMap["RdsPort"]

    if (-not $dbSecretArn -or -not $rdsEndpoint -or -not $rdsPort) {
        throw "Faltan outputs requeridos (DbSecretArn, RdsEndpoint, RdsPort) para construir DATABASE_URL."
    }

    $secretRaw = aws secretsmanager get-secret-value --secret-id $dbSecretArn --query "SecretString" --output text 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo leer secreto DB ($dbSecretArn): $secretRaw"
    }

    $secret = $secretRaw | ConvertFrom-Json
    $username = $secret.username
    $password = $secret.password
    $dbname = if ($secret.dbname) { $secret.dbname } else { "wms" }

    if (-not $username -or -not $password) {
        throw "El secreto DB no contiene username/password válidos."
    }

    $usernameEnc = [System.Uri]::EscapeDataString($username)
    $passwordEnc = [System.Uri]::EscapeDataString($password)
    return "postgresql://${usernameEnc}:${passwordEnc}@${rdsEndpoint}:${rdsPort}/${dbname}?schema=public"
}

function Use-AwsPrismaClient {
    Push-Location $projectRoot
    try {
        node scripts/db/generate-aws-prisma-client.cjs
        if ($LASTEXITCODE -ne 0) {
            throw "prisma generate para AWS/PostgreSQL falló"
        }
    } finally {
        Pop-Location
    }
}

function Restore-DefaultPrismaClient {
    Push-Location $projectRoot
    try {
        node scripts/db/generate-default-prisma-client.cjs
        if ($LASTEXITCODE -ne 0) {
            throw "prisma generate para el schema SQLite por defecto falló"
        }
    } finally {
        Pop-Location
    }
}

$restoreDefaultClient = $false

try {
    Write-Host "`n[1/7] Verifying AWS credentials..." -ForegroundColor Yellow
    try {
        $identity = aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
        Write-Host "  Account: $($identity.Account) | ARN: $($identity.Arn)"
    } catch {
        throw "AWS credentials expired. Run: aws sso login --profile $Profile"
    }

    Write-Host "`n[2/7] Preparing AWS Prisma client..." -ForegroundColor Yellow
    Use-AwsPrismaClient
    $restoreDefaultClient = $true

    if (-not $SkipBuild) {
        Write-Host "  Building with OpenNext..."
        Push-Location $projectRoot
        try {
            npx @opennextjs/aws build
            if ($LASTEXITCODE -ne 0) {
                throw "OpenNext build failed"
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  Skipping build (using existing .open-next/)" -ForegroundColor Yellow
        if (-not (Test-Path $openNextDir)) {
            throw ".open-next/ not found. Run without -SkipBuild"
        }
        Write-Warning "SkipBuild assumes the existing .open-next bundle was built with prisma/postgresql/schema.prisma"
    }

    if (-not $SkipMigrate) {
        Write-Host "`n[3/7] Applying DB migrations..." -ForegroundColor Yellow
        $outputsMapForMigration = Get-StackOutputsMap -CurrentStackName $StackName
        $databaseUrl = Build-DatabaseUrlFromStack -OutputsMap $outputsMapForMigration

        $previousDatabaseUrl = $env:DATABASE_URL
        $hadPreviousDatabaseUrl = Test-Path Env:DATABASE_URL
        $env:DATABASE_URL = $databaseUrl

        try {
            Push-Location $projectRoot
            npx prisma migrate status --schema $awsPrismaSchemaPath
            if ($LASTEXITCODE -ne 0) {
                throw "prisma migrate status falló"
            }

            npx prisma migrate deploy --schema $awsPrismaSchemaPath
            if ($LASTEXITCODE -ne 0) {
                throw "prisma migrate deploy falló"
            }

            @'
const { PrismaClient } = require("@prisma/client");
async function run() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        to_regclass('public."User"')::text AS user_table,
        to_regclass('public."Product"')::text AS product_table,
        to_regclass('public."Warehouse"')::text AS warehouse_table
    `;
    const row = rows?.[0] ?? {};
    console.log(JSON.stringify(row));
    if (!row.user_table || !row.product_table || !row.warehouse_table) {
      throw new Error("Tablas base no encontradas después de migrate deploy");
    }
  } finally {
    await prisma.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@ | node
            if ($LASTEXITCODE -ne 0) {
                throw "Verificación de tablas base falló"
            }
        } finally {
            Pop-Location
            if ($hadPreviousDatabaseUrl) {
                $env:DATABASE_URL = $previousDatabaseUrl
            } else {
                Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
            }
        }
    } else {
        Write-Host "`n[3/7] Skipping DB migrations (NOT RECOMMENDED)" -ForegroundColor Yellow
    }

    Write-Host "`n[4/7] Cleaning Windows Prisma engines from Lambda bundle..." -ForegroundColor Yellow
    $windowsEngines = Get-ChildItem $prismaClientDir -Filter "*windows*" -ErrorAction SilentlyContinue
    $tmpFiles = Get-ChildItem $prismaClientDir -Filter "*.tmp*" -ErrorAction SilentlyContinue
    $cleaned = 0
    foreach ($file in @($windowsEngines) + @($tmpFiles)) {
        if ($file -and (Test-Path -LiteralPath $file.FullName)) {
            Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
            if (-not (Test-Path -LiteralPath $file.FullName)) {
                Write-Host "  Removed: $($file.Name) ($([math]::Round($file.Length / 1MB, 1))MB)"
                $cleaned++
            }
        }
    }
    if ($cleaned -eq 0) {
        Write-Host "  Already clean"
    }

    Write-Host "`n[5/7] Checking ARM64 Prisma engine..." -ForegroundColor Yellow
    $arm64Engine = Join-Path $prismaClientDir "libquery_engine-linux-arm64-openssl-3.0.x.so.node"
    if (-not (Test-Path $arm64Engine)) {
        Write-Host "  ARM64 engine missing - downloading..."
        $engineHash = (npx prisma --version 2>&1 | Select-String "Default Engines Hash") -replace '.*:\s+', ''
        $url = "https://binaries.prisma.sh/all_commits/$engineHash/linux-arm64-openssl-3.0.x/libquery_engine.so.node.gz"
        $gzPath = Join-Path $env:TEMP "prisma-arm64-engine.gz"
        Invoke-WebRequest -Uri $url -OutFile $gzPath
        $stream = [System.IO.File]::OpenRead($gzPath)
        $gzip = New-Object System.IO.Compression.GZipStream($stream, [System.IO.Compression.CompressionMode]::Decompress)
        $output = [System.IO.File]::Create($arm64Engine)
        try {
            $gzip.CopyTo($output)
        } finally {
            $output.Close()
            $gzip.Close()
            $stream.Close()
            Remove-Item $gzPath -Force -ErrorAction SilentlyContinue
        }
        $arm64SizeMb = [math]::Round((Get-Item $arm64Engine).Length / 1MB, 1)
        Write-Host ("  Downloaded: " + $arm64SizeMb + "MB")
    } else {
        $arm64SizeMb = [math]::Round((Get-Item $arm64Engine).Length / 1MB, 1)
        Write-Host ("  Already present (" + $arm64SizeMb + "MB)")
    }

    $rhelEngine = Join-Path $prismaClientDir "libquery_engine-rhel-openssl-3.0.x.so.node"
    if (Test-Path $rhelEngine) {
        Remove-Item $rhelEngine -Force
        Write-Host "  Removed x86_64 RHEL engine (not needed for ARM64)"
    }

    $bundleSize = [math]::Round((Get-ChildItem $serverBundle -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "  Server Lambda bundle: ${bundleSize}MB"
    if ($bundleSize -gt 250) {
        throw "Bundle exceeds 250MB Lambda limit"
    }

    Write-Host "`n[6/7] Deploying via CDK..." -ForegroundColor Yellow
    Push-Location $cdkDir
    try {
        npx cdk deploy --require-approval never 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "CDK deploy failed"
        }
    } finally {
        Pop-Location
    }

    Write-Host "`n[7/7] Post-deploy configuration..." -ForegroundColor Yellow
    $env:AWS_PAGER = ""

    $outputs = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
    $cfUrl = ($outputs | Where-Object OutputKey -eq "CloudFrontUrl").OutputValue
    Write-Host "  CloudFront URL: $cfUrl"

    $config = aws lambda get-function-configuration --function-name $LambdaFunctionName --query "Environment" --output json | ConvertFrom-Json
    $changed = $false

    if ($config.Variables.NEXTAUTH_URL -ne $cfUrl) {
        $config.Variables.NEXTAUTH_URL = $cfUrl
        $changed = $true
    }
    if (-not $config.Variables.NEXT_PUBLIC_APP_BASE_URL -or $config.Variables.NEXT_PUBLIC_APP_BASE_URL -ne $cfUrl) {
        $config.Variables | Add-Member -NotePropertyName "NEXT_PUBLIC_APP_BASE_URL" -NotePropertyValue $cfUrl -Force
        $changed = $true
    }
    if (-not $config.Variables.AUTH_TRUST_HOST -or $config.Variables.AUTH_TRUST_HOST -ne "true") {
        $config.Variables | Add-Member -NotePropertyName "AUTH_TRUST_HOST" -NotePropertyValue "true" -Force
        $changed = $true
    }
    if (-not $config.Variables.NODE_ENV -or $config.Variables.NODE_ENV -ne "production") {
        $config.Variables | Add-Member -NotePropertyName "NODE_ENV" -NotePropertyValue "production" -Force
        $changed = $true
    }

    if ($changed) {
        $envFile = Join-Path $env:TEMP "lambda-env-deploy.json"
        $config | ConvertTo-Json -Depth 3 | Set-Content -Path $envFile -Encoding UTF8
        aws lambda update-function-configuration --function-name $LambdaFunctionName --environment "file://$envFile" --query "LastUpdateStatus" --output text
        aws lambda wait function-updated-v2 --function-name $LambdaFunctionName
        Write-Host "  Lambda env vars updated"
    } else {
        Write-Host "  Lambda env vars already correct"
    }

    Write-Host "`n=== Verifying deployment ===" -ForegroundColor Cyan
    try {
        $health = Invoke-RestMethod -Uri "$cfUrl/api/health" -SkipHttpErrorCheck
        Write-Host "  Health: ok=$($health.ok) | db=$($health.db)"
    } catch {
        Write-Host "  WARNING: Health check failed (cold start may take a moment)" -ForegroundColor Yellow
    }

    Write-Host "`n=== Deploy complete ===" -ForegroundColor Green
    Write-Host "  URL: $cfUrl" -ForegroundColor Green
    Write-Host "  Login: admin@scmayher.com / Admin123*`n" -ForegroundColor Green
} finally {
    if ($restoreDefaultClient) {
        Write-Host "`n[cleanup] Restoring default SQLite Prisma client..." -ForegroundColor Yellow
        try {
            Restore-DefaultPrismaClient
        } catch {
            Write-Warning "No se pudo restaurar el Prisma client por defecto: $($_.Exception.Message)"
        }
    }
}
