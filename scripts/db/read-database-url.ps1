param(
  [ValidateSet("env_file", "machine_env")]
  [string]$Source = "env_file",
  [string]$EnvFilePath = ".env"
)

$ErrorActionPreference = "Stop"

function Normalize-DatabaseUrl {
  param([string]$Value)

  if (-not $Value) {
    return ""
  }

  $normalized = $Value.Trim()
  if ($normalized.Length -ge 2) {
    $first = $normalized.Substring(0, 1)
    $last = $normalized.Substring($normalized.Length - 1, 1)
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      $normalized = $normalized.Substring(1, $normalized.Length - 2)
    }
  }

  return $normalized
}

if ($Source -eq "env_file") {
  if (-not (Test-Path -LiteralPath $EnvFilePath)) {
    exit 0
  }

  $line = Get-Content -LiteralPath $EnvFilePath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1

  if (-not $line) {
    exit 0
  }

  $parts = $line -split "=", 2
  if ($parts.Count -lt 2) {
    exit 0
  }

  $value = Normalize-DatabaseUrl -Value $parts[1]
  if ($value) {
    [Console]::Write($value)
  }
  exit 0
}

$machineValue = [System.Environment]::GetEnvironmentVariable("DATABASE_URL", "Machine")
$normalizedMachineValue = Normalize-DatabaseUrl -Value $machineValue
if ($normalizedMachineValue) {
  [Console]::Write($normalizedMachineValue)
}
