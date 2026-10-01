param(
    [switch]$Apply,
    [switch]$ReuseRecovery,
    [string]$Profile = 'Raul_ITsupport',
    [string]$ExpectedCommitSha,
    [string]$RecoveryPath = (Join-Path $env:LOCALAPPDATA 'WMS\private\operational-credentials.clixml')
)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $Apply) {
    Write-Host 'Sin cambios. Para aplicar se exige -Apply y -ExpectedCommitSha del runtime productivo validado.'
    exit 0
}
if ($ExpectedCommitSha -notmatch '^[0-9a-f]{40}$') { throw 'ExpectedCommitSha debe identificar el candidato exacto.' }
$taskIdentity = aws sts get-caller-identity --profile $Profile --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $taskIdentity.Account -ne '904891391424') { throw 'Cuenta AWS incorrecta.' }
$taskHealth = Invoke-RestMethod ('https://d2b1ltxtvypxr4.cloudfront.net/api/health?credentialRotation=' + [DateTime]::UtcNow.Ticks)
if (!$taskHealth.ok -or $taskHealth.db -ne 'up' -or $taskHealth.environment -ne 'prod' -or $taskHealth.commitSha -ne $ExpectedCommitSha) {
    throw 'El candidato productivo debe estar desplegado y disponible antes de rotar credenciales.'
}
$taskOutputs = aws cloudformation describe-stacks --stack-name WmsWebDevStack --profile $Profile --region us-east-1 --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
$taskEndpoint = ($taskOutputs | Where-Object OutputKey -eq RdsEndpoint).OutputValue
if ($LASTEXITCODE -ne 0 -or $taskEndpoint -ne 'wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com') { throw 'Endpoint canónico incorrecto.' }
$taskEmails = @('admin@scmayher.com', 'admin2@scmayher.com', 'manager@scmayher.com', 'operator@scmayher.com', 'sales@scmayher.com')
if (Test-Path -LiteralPath $RecoveryPath) {
    if (!$ReuseRecovery) { throw 'Ya existe recuperación privada. No se sobrescribe; revisa y usa -ReuseRecovery para completar la misma operación.' }
    $taskCredentials = @(Import-Clixml -LiteralPath $RecoveryPath)
} else {
    if ($ReuseRecovery) { throw 'No existe la recuperación solicitada.' }
    $taskCredentials = foreach ($taskEmail in $taskEmails) {
        $taskBytes = New-Object byte[] 24
        $taskRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $taskRandom.GetBytes($taskBytes) } finally { $taskRandom.Dispose() }
        $taskPassword = [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') + 'Aa1*'
        [PSCredential]::new($taskEmail, (ConvertTo-SecureString $taskPassword -AsPlainText -Force))
    }
    $taskPrivateDirectory = Split-Path $RecoveryPath -Parent
    [System.IO.Directory]::CreateDirectory($taskPrivateDirectory) > $null
    $taskCredentials | Export-Clixml -LiteralPath $RecoveryPath
    $taskCredentials = @(Import-Clixml -LiteralPath $RecoveryPath)
}
if ($taskCredentials.Count -ne 5 -or @($taskCredentials | Where-Object { $_ -isnot [PSCredential] -or $_.UserName -notin $taskEmails }).Count -ne 0 -or @($taskCredentials.UserName | Select-Object -Unique).Count -ne 5) {
    throw 'La recuperación debe contener exactamente las cinco identidades acordadas.'
}
$taskRunId = 'credential-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$taskSecretArn = ($taskOutputs | Where-Object OutputKey -eq DbSecretArn).OutputValue
$taskSecret = aws secretsmanager get-secret-value --secret-id $taskSecretArn --profile $Profile --region us-east-1 --query SecretString --output text | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'No se pudo establecer la sesión DB.' }
$env:DATABASE_URL = 'postgresql://' + [Uri]::EscapeDataString($taskSecret.username) + ':' + [Uri]::EscapeDataString($taskSecret.password) + '@' + $taskEndpoint + ':5432/wms?schema=public&connection_limit=2&pool_timeout=10&sslmode=require'
$env:WMS_CREDENTIAL_ROTATION_APPROVED = '1'
$taskPayload = @{ runId = $taskRunId; credentials = @($taskCredentials | ForEach-Object { @{ email = $_.UserName; password = $_.GetNetworkCredential().Password } }) } | ConvertTo-Json -Depth 5 -Compress
try {
    $taskProof = $taskPayload | node (Join-Path $PSScriptRoot 'rotate-operational-credentials.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'La rotación transaccional falló. La recuperación privada se conserva; no continuar CI.' }
    $taskProofObject = ($taskProof -join [Environment]::NewLine) | ConvertFrom-Json
    if ($taskProofObject.rotated -ne 5) { throw 'Prueba de rotación incompleta.' }
    $taskProofObject | Add-Member -NotePropertyName awsIdentity -NotePropertyValue $taskIdentity.Arn
    $taskProofObject | Add-Member -NotePropertyName commitSha -NotePropertyValue $ExpectedCommitSha
    $taskProofObject | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $taskRoot 'output\operational-credential-rotation-proof.json')
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:WMS_CREDENTIAL_ROTATION_APPROVED -ErrorAction SilentlyContinue
    $taskPayload = $null
}
# Reuse the encrypted recovery if GitHub becomes unavailable after the DB commit.
Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
function Set-PrivateGithubSecret {
    param([string]$Name, [string]$Value)
    if ($Name -notmatch '^WMS_E2E_[A-Z_]+$') { throw 'Nombre de secreto inesperado.' }
    $taskProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $taskProcessInfo.FileName = (Get-Command gh -ErrorAction Stop).Source
    $taskProcessInfo.Arguments = "secret set $Name --repo raul2105/WMS-Mangueras-y-conexiones"
    $taskProcessInfo.UseShellExecute = $false
    $taskProcessInfo.CreateNoWindow = $true
    $taskProcessInfo.RedirectStandardInput = $true
    $taskProcessInfo.RedirectStandardOutput = $true
    $taskProcessInfo.RedirectStandardError = $true
    $taskProcess = New-Object System.Diagnostics.Process
    $taskProcess.StartInfo = $taskProcessInfo
    try {
        $taskProcess.Start() > $null
        # Write, not WriteLine: no newline is added to the stored credential.
        $taskProcess.StandardInput.Write($Value)
        $taskProcess.StandardInput.Close()
        $taskProcess.StandardOutput.ReadToEnd() > $null
        $taskProcess.StandardError.ReadToEnd() > $null
        $taskProcess.WaitForExit()
        if ($taskProcess.ExitCode -ne 0) { throw 'No se pudo conciliar un secreto CI; conserva recuperación y completa la operación.' }
    } finally { $taskProcess.Dispose() }
}
$taskRoles = @{ SYSTEM_ADMIN = 'admin@scmayher.com'; MANAGER = 'manager@scmayher.com'; WAREHOUSE_OPERATOR = 'operator@scmayher.com'; SALES_EXECUTIVE = 'sales@scmayher.com' }
foreach ($taskRole in $taskRoles.Keys) {
    $taskCredential = $taskCredentials | Where-Object UserName -eq $taskRoles[$taskRole]
    Set-PrivateGithubSecret -Name "WMS_E2E_${taskRole}_EMAIL" -Value $taskCredential.UserName
    Set-PrivateGithubSecret -Name "WMS_E2E_${taskRole}_PASSWORD" -Value $taskCredential.GetNetworkCredential().Password
}
Write-Host 'Cinco identidades conservadas, claves privadas rotadas y ocho secretos CI conciliados.'
Write-Host "Recuperación DPAPI para la misma cuenta Windows: $RecoveryPath"
Write-Host 'Ejecuta tú scripts/security/show-operational-credentials.ps1 para consultar tus accesos; no publiques su salida.'
