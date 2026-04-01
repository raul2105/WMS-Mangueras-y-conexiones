param(
  [int]$Port = 3002
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "maintenance\healthcheck.ps1") -Port $Port
