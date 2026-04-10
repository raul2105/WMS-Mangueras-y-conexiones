$ErrorActionPreference = "Stop"

$target = Join-Path $PSScriptRoot "release\build-release.ps1"
if (-not (Test-Path $target)) {
  throw "Missing target script: $target"
}

& $target @args
exit $LASTEXITCODE
