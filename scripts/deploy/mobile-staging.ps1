$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Script
  )
  & $Script
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

if (-not $env:AWS_PROFILE) { $env:AWS_PROFILE = "Rigentec-SCMayer" }
if (-not $env:AWS_REGION) { $env:AWS_REGION = "us-east-1" }
$env:MOBILE_ENV = "staging"

Write-Host "[mobile] precheck staging"
Invoke-Checked { npm --prefix mobile/infra/cdk run precheck }

Write-Host "[mobile] synth staging"
Invoke-Checked { npm --prefix mobile/infra/cdk run synth | Out-Null }

Write-Host "[mobile] diff staging"
Invoke-Checked { npm --prefix mobile/infra/cdk run diff }

Write-Host "[mobile] deploy staging"
Invoke-Checked { npm --prefix mobile/infra/cdk run deploy -- --require-approval never }

Write-Host "[mobile] generate runtime config"
$manifestJson = & node scripts/mobile/generate-mobile-config.cjs
if ($LASTEXITCODE -ne 0) { throw "mobile config generation failed" }
$manifest = $manifestJson | ConvertFrom-Json

Write-Host "[mobile] sync PWA to s3://$($manifest.bucketName)"
Invoke-Checked { aws s3 sync $manifest.webDir "s3://$($manifest.bucketName)" --delete --profile $env:AWS_PROFILE --region $env:AWS_REGION }

Write-Host "[mobile] invalidate CloudFront $($manifest.distributionId)"
Invoke-Checked { aws cloudfront create-invalidation --distribution-id $manifest.distributionId --paths "/*" --profile $env:AWS_PROFILE --region $env:AWS_REGION | Out-Null }

Write-Host "[mobile] bootstrap read models"
Invoke-Checked { node scripts/mobile/bootstrap-read-models.cjs }

Write-Host "[mobile] staging deploy complete"
Write-Host "webUrl=$($manifest.webUrl)"
Write-Host "apiBaseUrl=$($manifest.apiBaseUrl)"
