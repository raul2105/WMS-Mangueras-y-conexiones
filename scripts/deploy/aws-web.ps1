<#
.SYNOPSIS
  Build and deploy WMS web to AWS (OpenNext + Lambda + CloudFront + CDK).
.DESCRIPTION
  Production-ready deployment workflow for the web runtime.

  Phase 1. Validate AWS access, environment config and production safety checks.
  Phase 2. Generate Prisma client for PostgreSQL and build OpenNext.
  Phase 3. Apply PostgreSQL migrations when stack outputs are available.
  Phase 4. Deploy infrastructure and app with CDK.
  Phase 5. Reconcile Lambda environment variables.
  Phase 6. Smoke check CloudFront and /api/health.

  If the stack does not exist yet, the script performs a bootstrap CDK deploy first,
  then runs migrations and reconciles the runtime configuration.
.PARAMETER Environment
  Target environment. Supported: dev, prod.
.PARAMETER SkipBuild
  Skip the OpenNext build step and reuse the existing .open-next directory.
.PARAMETER SkipMigrate
  Skip Prisma migrate deploy.
.PARAMETER Profile
  AWS CLI profile.
.PARAMETER StackName
  Optional override for the CloudFormation stack name.
.PARAMETER LambdaFunctionName
  Optional override for the server Lambda function name.
#>
param(
    [ValidateSet("dev", "prod")]
    [string]$Environment = "dev",
    [switch]$SkipBuild,
    [switch]$SkipMigrate,
    [string]$Profile = "wms-mobile-dev",
    [string]$StackName,
    [string]$LambdaFunctionName,
    [string]$SmokeAuthEmail,
    [string]$SmokeAuthPassword
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path "$PSScriptRoot\..\.."
$openNextDir = Join-Path $projectRoot ".open-next"
$serverBundle = Join-Path $openNextDir "server-functions\default"
$prismaClientDir = Join-Path $serverBundle "node_modules\.prisma\client"
$cdkDir = Join-Path $projectRoot "infra\cdk"
$awsPrismaSchemaPath = Join-Path $projectRoot "prisma\postgresql\schema.prisma"
$configDir = Join-Path $projectRoot "infra\cdk\config"
$packageJsonPath = Join-Path $projectRoot "package.json"
$packageVersion = if (Test-Path $packageJsonPath) { (Get-Content $packageJsonPath -Raw | ConvertFrom-Json).version } else { "unknown" }

$toolPaths = @(
    "C:\Program Files\nodejs",
    "C:\Program Files\Amazon\AWSCLIV2"
)
foreach ($toolPath in $toolPaths) {
    if ((Test-Path $toolPath) -and -not (($env:Path -split ";") -contains $toolPath)) {
        $env:Path = "$toolPath;$env:Path"
    }
}

$env:AWS_PROFILE = $Profile
$env:AWS_PAGER = ""
$env:WMS_ENV = $Environment

function Write-Phase {
    param(
        [string]$Index,
        [string]$Label
    )
    Write-Host "`n[$Index] $Label" -ForegroundColor Yellow
}

function Load-WebConfig {
    param([string]$TargetEnvironment)

    $path = Join-Path $configDir "$TargetEnvironment.json"
    if (-not (Test-Path $path)) {
        throw "No existe el archivo de configuración: $path"
    }

    $config = Get-Content $path -Raw | ConvertFrom-Json
    $required = @("environment", "region", "namePrefix", "stackName", "dbName", "dbUsername", "officeIpCidr")
    foreach ($key in $required) {
        if (-not $config.$key) {
            throw "Falta la llave '$key' en $path"
        }
    }

    return $config
}

function Test-StackExists {
    param([string]$CurrentStackName)

    aws cloudformation describe-stacks --stack-name $CurrentStackName --query "Stacks[0].StackName" --output text *> $null
    return $LASTEXITCODE -eq 0
}

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

function Assert-RequiredOutputs {
    param(
        [hashtable]$OutputsMap,
        [string[]]$Keys
    )

    foreach ($key in $Keys) {
        if (-not $OutputsMap.ContainsKey($key) -or -not $OutputsMap[$key]) {
            throw "Falta el output requerido '$key' en el stack."
        }
    }
}

function Build-DatabaseUrlFromStack {
    param(
        [hashtable]$OutputsMap,
        [string]$ExpectedDbName
    )

    Assert-RequiredOutputs -OutputsMap $OutputsMap -Keys @("DbSecretArn", "RdsEndpoint", "RdsPort")

    $dbSecretArn = $OutputsMap["DbSecretArn"]
    $rdsEndpoint = $OutputsMap["RdsEndpoint"]
    $rdsPort = $OutputsMap["RdsPort"]

    $secretRaw = aws secretsmanager get-secret-value --secret-id $dbSecretArn --query "SecretString" --output text 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo leer secreto DB ($dbSecretArn): $secretRaw"
    }

    $secret = $secretRaw | ConvertFrom-Json
    $username = $secret.username
    $password = $secret.password
    $dbname = if ($secret.dbname) { $secret.dbname } else { $ExpectedDbName }

    if (-not $username -or -not $password) {
        throw "El secreto DB no contiene username/password válidos."
    }

    $usernameEnc = [System.Uri]::EscapeDataString($username)
    $passwordEnc = [System.Uri]::EscapeDataString($password)
    # connection_limit: conservative per-instance pool for db.t4g.micro.
    # pool_timeout: fail faster to avoid long perceived hangs in login/actions.
    return "postgresql://${usernameEnc}:${passwordEnc}@${rdsEndpoint}:${rdsPort}/${dbname}?schema=public&connection_limit=2&pool_timeout=5"
}

function Assert-ProdConfigSafe {
    param([pscustomobject]$Config)

    if ($Config.environment -ne "prod") {
        return
    }

    $officeIp = [string]$Config.officeIpCidr
    if (-not $officeIp -or $officeIp -eq "0.0.0.0/0" -or $officeIp -eq "CHANGE_ME/32") {
        throw "Configuración insegura para prod: officeIpCidr debe estar restringido y no puede ser '$officeIp'."
    }
}

function Invoke-Checked {
    param(
        [string]$Command,
        [string]$FailureMessage,
        [string]$WorkingDirectory = $projectRoot
    )

    Push-Location $WorkingDirectory
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0) {
            throw $FailureMessage
        }
    } finally {
        Pop-Location
    }
}

function Use-AwsPrismaClient {
    Invoke-Checked -Command "node scripts/db/generate-aws-prisma-client.cjs" -FailureMessage "prisma generate para AWS/PostgreSQL falló"
}

function Restore-DefaultPrismaClient {
    Invoke-Checked -Command "node scripts/db/generate-default-prisma-client.cjs" -FailureMessage "prisma generate para el schema SQLite por defecto falló"
}

function Invoke-Migrations {
    param(
        [string]$DatabaseUrl,
        [string]$SchemaPath
    )

    $previousDatabaseUrl = $env:DATABASE_URL
    $hadPreviousDatabaseUrl = Test-Path Env:DATABASE_URL
    $env:DATABASE_URL = $DatabaseUrl

    try {
        Push-Location $projectRoot
        npx prisma migrate status --schema $SchemaPath
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "prisma migrate status reportó migraciones pendientes o estado no limpio; continuando con migrate deploy."
        }

        npx prisma migrate deploy --schema $SchemaPath
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
        to_regclass('public."Warehouse"')::text AS warehouse_table,
        to_regclass('public."SyncEvent"')::text AS sync_event_table
    `;
    const row = rows?.[0] ?? {};
    console.log(JSON.stringify(row));
    if (!row.user_table || !row.product_table || !row.warehouse_table || !row.sync_event_table) {
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
}

function Remove-WindowsPrismaArtifacts {
    param([string]$TargetDir)

    Write-Phase "4" "Cleaning Windows Prisma engines from Lambda bundle..."

    if (-not (Test-Path $TargetDir)) {
        throw "No existe el bundle de Prisma esperado: $TargetDir"
    }

    $windowsEngines = Get-ChildItem $TargetDir -Filter "*windows*" -ErrorAction SilentlyContinue
    $tmpFiles = Get-ChildItem $TargetDir -Filter "*.tmp*" -ErrorAction SilentlyContinue
    $prismaRuntimeDir = Join-Path $serverBundle "node_modules\@prisma\client\runtime"
    $prismaDbFile = Join-Path $serverBundle "prisma\dev.db"
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

    $arm64Engine = Join-Path $TargetDir "libquery_engine-linux-arm64-openssl-3.0.x.so.node"
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
    }

    $rhelEngine = Join-Path $TargetDir "libquery_engine-rhel-openssl-3.0.x.so.node"
    if (Test-Path $rhelEngine) {
        Remove-Item $rhelEngine -Force
        Write-Host "  Removed x86_64 RHEL engine (not needed for ARM64)"
    }

    if (Test-Path $prismaRuntimeDir) {
        $runtimePrunePatterns = @(
            "*.map",
            "*query_engine_bg.cockroachdb*",
            "*query_engine_bg.mysql*",
            "*query_engine_bg.sqlserver*",
            "*query_engine_bg.sqlite*",
            "*query_compiler_bg.cockroachdb*",
            "*query_compiler_bg.mysql*",
            "*query_compiler_bg.sqlserver*",
            "*query_compiler_bg.sqlite*"
        )
        foreach ($pattern in $runtimePrunePatterns) {
            Get-ChildItem -Path $prismaRuntimeDir -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
                if (Test-Path -LiteralPath $_.FullName) {
                    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
                    if (-not (Test-Path -LiteralPath $_.FullName)) {
                        Write-Host "  Pruned runtime: $($_.Name)"
                        $cleaned++
                    }
                }
            }
        }
    }

    if (Test-Path $prismaDbFile) {
        Remove-Item -LiteralPath $prismaDbFile -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path -LiteralPath $prismaDbFile)) {
            Write-Host "  Removed: prisma\\dev.db"
            $cleaned++
        }
    }

    $bundleSize = [math]::Round((Get-ChildItem $serverBundle -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "  Server Lambda bundle: ${bundleSize}MB"
    if ($bundleSize -gt 75) {
        throw "Bundle optimization gate failed (${bundleSize}MB > 75MB target)"
    }
    if ($bundleSize -gt 250) {
        throw "Bundle exceeds 250MB Lambda limit"
    }
}

function Invoke-CdkDeploy {
    param(
        [string]$WorkingDirectory,
        [string]$CurrentEnvironment
    )

    Push-Location $WorkingDirectory
    try {
        $env:WMS_ENV = $CurrentEnvironment
        npx cdk deploy --require-approval never 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "CDK deploy failed"
        }
    } finally {
        Pop-Location
    }
}

function Update-LambdaEnvironment {
    param(
        [string]$CurrentLambdaFunctionName,
        [string]$CloudFrontUrl,
        [hashtable]$OutputsMap
    )

    $configRaw = aws lambda get-function-configuration --function-name $CurrentLambdaFunctionName --query "Environment" --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo leer la configuración Lambda ($CurrentLambdaFunctionName): $configRaw"
    }

    $config = $configRaw | ConvertFrom-Json
    $changed = $false

    if ($config.Variables.NEXTAUTH_URL -ne $CloudFrontUrl) {
        $config.Variables.NEXTAUTH_URL = $CloudFrontUrl
        $changed = $true
    }
    if (-not $config.Variables.NEXT_PUBLIC_APP_BASE_URL -or $config.Variables.NEXT_PUBLIC_APP_BASE_URL -ne $CloudFrontUrl) {
        $config.Variables | Add-Member -NotePropertyName "NEXT_PUBLIC_APP_BASE_URL" -NotePropertyValue $CloudFrontUrl -Force
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
    if (-not $config.Variables.WMS_DISABLE_SYNC_EVENTS_IN_WEB -or $config.Variables.WMS_DISABLE_SYNC_EVENTS_IN_WEB -ne "true") {
        $config.Variables | Add-Member -NotePropertyName "WMS_DISABLE_SYNC_EVENTS_IN_WEB" -NotePropertyValue "true" -Force
        $changed = $true
    }
    $perfDebugExpected = if ($Environment -eq "dev") { "true" } else { "false" }
    if (-not $config.Variables.PERF_DEBUG_LOGS -or $config.Variables.PERF_DEBUG_LOGS -ne $perfDebugExpected) {
        $config.Variables | Add-Member -NotePropertyName "PERF_DEBUG_LOGS" -NotePropertyValue $perfDebugExpected -Force
        $changed = $true
    }
    if (-not $config.Variables.APP_VERSION -or $config.Variables.APP_VERSION -ne $packageVersion) {
        $config.Variables | Add-Member -NotePropertyName "APP_VERSION" -NotePropertyValue $packageVersion -Force
        $changed = $true
    }
    if (-not $config.Variables.AUTH_SECRET) {
        $nextAuthSecretArn = $OutputsMap["NextAuthSecretArn"]
        if ($nextAuthSecretArn) {
            $secretRaw = aws secretsmanager get-secret-value --secret-id $nextAuthSecretArn --query "SecretString" --output text 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "No se pudo leer secreto auth ($nextAuthSecretArn): $secretRaw"
            }

            $config.Variables | Add-Member -NotePropertyName "AUTH_SECRET" -NotePropertyValue $secretRaw -Force
            $config.Variables | Add-Member -NotePropertyName "NEXTAUTH_SECRET" -NotePropertyValue $secretRaw -Force
            $changed = $true
        }
    }

    if ($changed) {
        $envFile = Join-Path $env:TEMP "lambda-env-deploy.json"
        $json = $config | ConvertTo-Json -Depth 4
        [System.IO.File]::WriteAllText(
            $envFile,
            $json,
            (New-Object System.Text.UTF8Encoding($false))
        )
        aws lambda update-function-configuration --function-name $CurrentLambdaFunctionName --environment "file://$envFile" --query "LastUpdateStatus" --output text
        aws lambda wait function-updated-v2 --function-name $CurrentLambdaFunctionName
        Write-Host "  Lambda env vars updated"
    } else {
        Write-Host "  Lambda env vars already correct"
    }
}

function Invoke-AuthSmokeCheck {
    param(
        [string]$BaseUrl,
        [string]$Email,
        [string]$Password
    )

    if (-not $Email) {
        $Email = $env:WMS_SMOKE_AUTH_EMAIL
    }
    if (-not $Password) {
        $Password = $env:WMS_SMOKE_AUTH_PASSWORD
    }

    if (-not $Email -or -not $Password) {
        Write-Warning "Skipping auth smoke check. Provide -SmokeAuthEmail/-SmokeAuthPassword or env vars WMS_SMOKE_AUTH_EMAIL/WMS_SMOKE_AUTH_PASSWORD."
        return
    }

    Write-Host "  Auth smoke: login -> protected route -> logout ($Email)"

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    $csrfResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/csrf" -WebSession $session -UseBasicParsing -ErrorAction Stop
    $csrfCookie = $session.Cookies.GetCookies($BaseUrl)["__Host-authjs.csrf-token"]
    if (-not $csrfCookie) {
        $csrfCookie = $session.Cookies.GetCookies($BaseUrl)["authjs.csrf-token"]
    }
    if (-not $csrfCookie -or -not $csrfCookie.Value) {
        throw "No se pudo obtener la cookie csrf de auth smoke."
    }

    $csrfToken = [System.Uri]::UnescapeDataString($csrfCookie.Value).Split('|')[0]
    if (-not $csrfToken) {
        throw "No se pudo extraer csrfToken desde la cookie."
    }

    $loginResponse = Invoke-WebRequest `
        -Uri "$BaseUrl/api/auth/callback/credentials" `
        -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body @{
            csrfToken = $csrfToken
            email = $Email
            password = $Password
            callbackUrl = "$BaseUrl/"
        } `
        -WebSession $session `
        -UseBasicParsing `
        -ErrorAction Stop

    $loginFinalUrl = if ($loginResponse.BaseResponse.ResponseUri) {
        $loginResponse.BaseResponse.ResponseUri.AbsoluteUri
    } else {
        [string]($loginResponse.Headers.Location | Select-Object -First 1)
    }
    if ($loginFinalUrl -match "/login") {
        $loginBody = ""
        try { $loginBody = [string]$loginResponse.Content } catch {}
        throw "Auth smoke login regresó a /login: $loginFinalUrl. Verifica credenciales y AUTH_SECRET/NEXTAUTH_URL. BodyHint: $($loginBody.Substring(0, [Math]::Min(180, $loginBody.Length)))"
    }

    $protectedResponse = Invoke-WebRequest -Uri "$BaseUrl/" -WebSession $session -UseBasicParsing -ErrorAction Stop
    $protectedFinalUrl = if ($protectedResponse.BaseResponse.ResponseUri) {
        $protectedResponse.BaseResponse.ResponseUri.AbsoluteUri
    } else {
        [string]($protectedResponse.Headers.Location | Select-Object -First 1)
    }
    if ($protectedFinalUrl -match "/login") {
        throw "La ruta protegida siguió redirigiendo a /login después del login."
    }

    $logoutResponse = Invoke-WebRequest -Uri "$BaseUrl/logout" -WebSession $session -UseBasicParsing -ErrorAction Stop

    $cookiesAfterLogout = @($session.Cookies.GetCookies($BaseUrl))
    $remainingSessionCookies = @(
        $cookiesAfterLogout | Where-Object {
            $_.Name -match "authjs\.session-token" -or $_.Name -match "next-auth\.session-token"
        }
    )

    if ($remainingSessionCookies.Count -eq 0) {
        Write-Host "  Auth smoke logout OK (session cookies cleared)"
        Write-Host "  Auth smoke OK"
        return
    }

    $postLogoutFinalUrl = ""
    try {
        $postLogoutResponse = Invoke-WebRequest -Uri "$BaseUrl/" -WebSession $session -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
        $postLogoutFinalUrl = if ($postLogoutResponse.BaseResponse.ResponseUri) {
            $postLogoutResponse.BaseResponse.ResponseUri.AbsoluteUri
        } else {
            [string]($postLogoutResponse.Headers.Location | Select-Object -First 1)
        }
    } catch {
        $webEx = $_.Exception
        $response = $webEx.Response
        if ($response -and $response.Headers -and $response.Headers["Location"]) {
            $postLogoutFinalUrl = [string]$response.Headers["Location"]
        } else {
            throw
        }
    }
    if ($postLogoutFinalUrl -notmatch "/login") {
        $remaining = ($remainingSessionCookies | ForEach-Object { $_.Name }) -join ", "
        throw "La sesion siguio activa despues de logout. Cookies persistentes: $remaining"
    }

    Write-Host "  Auth smoke OK"
}

$restoreDefaultClient = $false
$config = Load-WebConfig -TargetEnvironment $Environment
$resolvedStackName = if ($StackName) { $StackName } else { [string]$config.stackName }
$resolvedLambdaFunctionName = if ($LambdaFunctionName) { $LambdaFunctionName } else { "$($config.namePrefix)-server" }

try {
    Write-Host "`n=== WMS AWS Deploy ($Environment) ===" -ForegroundColor Cyan

    Write-Phase "1" "Validating AWS access and environment config..."
    Assert-ProdConfigSafe -Config $config
    try {
        $identity = aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
        Write-Host "  Account: $($identity.Account) | ARN: $($identity.Arn)"
    } catch {
        throw "AWS credentials expired or unavailable. Run: aws sso login --profile $Profile"
    }

    Write-Host "  Environment: $Environment"
    Write-Host "  Region: $($config.region)"
    Write-Host "  Stack: $resolvedStackName"
    Write-Host "  Lambda: $resolvedLambdaFunctionName"
    Write-Host "  officeIpCidr: $($config.officeIpCidr)"

    Write-Phase "2" "Preparing Prisma client and OpenNext build..."
    Use-AwsPrismaClient
    $restoreDefaultClient = $true

    if (-not $SkipBuild) {
        Invoke-Checked -Command "npx @opennextjs/aws build" -FailureMessage "OpenNext build failed"
    } else {
        Write-Host "  Skipping build (using existing .open-next/)"
        if (-not (Test-Path $openNextDir)) {
            throw ".open-next/ not found. Run without -SkipBuild."
        }
    }

    Remove-WindowsPrismaArtifacts -TargetDir $prismaClientDir

    $stackExists = Test-StackExists -CurrentStackName $resolvedStackName
    $outputsBeforeDeploy = @{}
    if ($stackExists) {
        $outputsBeforeDeploy = Get-StackOutputsMap -CurrentStackName $resolvedStackName
    }

    if (-not $SkipMigrate) {
        if ($stackExists) {
            Write-Phase "3" "Applying DB migrations..."
            $databaseUrl = Build-DatabaseUrlFromStack -OutputsMap $outputsBeforeDeploy -ExpectedDbName $config.dbName
            Invoke-Migrations -DatabaseUrl $databaseUrl -SchemaPath $awsPrismaSchemaPath
        } else {
            Write-Phase "3" "Stack not found yet; bootstrap deploy required before migrations."
        }
    } else {
        Write-Phase "3" "Skipping DB migrations (NOT RECOMMENDED)"
    }

    Write-Phase "4" "Deploying via CDK..."
    Invoke-CdkDeploy -WorkingDirectory $cdkDir -CurrentEnvironment $Environment

    $outputsAfterDeploy = Get-StackOutputsMap -CurrentStackName $resolvedStackName
    Assert-RequiredOutputs -OutputsMap $outputsAfterDeploy -Keys @("CloudFrontUrl", "DbSecretArn", "RdsEndpoint", "RdsPort", "NextAuthSecretArn")

    if (-not $SkipMigrate -and -not $stackExists) {
        Write-Phase "3b" "Applying DB migrations after bootstrap deploy..."
        $databaseUrl = Build-DatabaseUrlFromStack -OutputsMap $outputsAfterDeploy -ExpectedDbName $config.dbName
        Invoke-Migrations -DatabaseUrl $databaseUrl -SchemaPath $awsPrismaSchemaPath
    }

    Write-Phase "5" "Reconciling Lambda environment variables..."
    $cloudFrontUrl = $outputsAfterDeploy["CloudFrontUrl"]
    Write-Host "  CloudFront URL: $cloudFrontUrl"
    Update-LambdaEnvironment `
        -CurrentLambdaFunctionName $resolvedLambdaFunctionName `
        -CloudFrontUrl $cloudFrontUrl `
        -OutputsMap $outputsAfterDeploy

    Write-Phase "6" "Running smoke checks..."
    Write-Host "  Expected prod protections: deletionProtection=$([bool]($config.environment -eq 'prod'))"
    Write-Host "  Expected DB secret resolved: $($outputsAfterDeploy['DbSecretArn'])"

    try {
        $response = Invoke-WebRequest -Uri "$cloudFrontUrl/api/health" -UseBasicParsing
        $health = $response.Content | ConvertFrom-Json
        Write-Host "  Health: ok=$($health.ok) | db=$($health.db)"
    } catch {
        Write-Warning "Health check failed for $cloudFrontUrl/api/health. Cold start or runtime issue may need review."
    }

    Invoke-AuthSmokeCheck -BaseUrl $cloudFrontUrl -Email $SmokeAuthEmail -Password $SmokeAuthPassword

    Write-Host "`n=== Deploy complete ===" -ForegroundColor Green
    Write-Host "  Environment: $Environment" -ForegroundColor Green
    Write-Host "  URL: $cloudFrontUrl" -ForegroundColor Green
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
