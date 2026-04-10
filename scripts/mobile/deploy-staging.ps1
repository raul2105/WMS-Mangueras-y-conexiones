$ErrorActionPreference = "Stop"

$target = Join-Path $PSScriptRoot "..\deploy\mobile-staging.ps1"
if (-not (Test-Path $target)) {
  throw "Missing target script: $target"
}

& $target @args
exit $LASTEXITCODE
