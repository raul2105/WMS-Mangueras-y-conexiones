param(
  [int]$Port = 3002
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\common.ps1")

$state = Get-WmsState
$state.Port = $Port
$state.BaseUrl = "http://127.0.0.1:$Port"
$state.HealthUrl = "http://127.0.0.1:$Port/api/health"

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $state.HealthUrl -TimeoutSec 5
  if ($response.StatusCode -ne 200) {
    Write-Host "Healthcheck fallido: HTTP $($response.StatusCode)"
    exit 1
  }

  $payload = $response.Content | ConvertFrom-Json
  if ($payload.ok -eq $true) {
    Write-Host "OK: $($state.HealthUrl)"
    exit 0
  }

  Write-Host "Healthcheck fallido: el servicio respondio ok=false"
  exit 1
} catch {
  Write-Host "Healthcheck fallido: $($_.Exception.Message)"
  exit 1
}
