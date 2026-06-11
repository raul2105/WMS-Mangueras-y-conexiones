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

function Test-PostgresDatabaseUrl {
  param([string]$Value)

  if (-not $Value) {
    return $false
  }

  return $Value.StartsWith("postgres://", [System.StringComparison]::OrdinalIgnoreCase) -or
    $Value.StartsWith("postgresql://", [System.StringComparison]::OrdinalIgnoreCase)
}

if ($Source -eq "env_file") {
  if (-not (Test-Path -LiteralPath $EnvFilePath)) {
    exit 0
  }

  $databaseUrl = Get-Content -LiteralPath $EnvFilePath |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    ForEach-Object {
      $parts = $_ -split "=", 2
      if ($parts.Count -lt 2) {
        return
      }

      $candidate = Normalize-DatabaseUrl -Value $parts[1]
      if (Test-PostgresDatabaseUrl -Value $candidate) {
        $candidate
      }
    } |
    Select-Object -First 1

  if (-not $databaseUrl) {
    exit 0
  }

  [Console]::Write($databaseUrl)
  exit 0
}

$machineValue = [System.Environment]::GetEnvironmentVariable("DATABASE_URL", "Machine")
$normalizedMachineValue = Normalize-DatabaseUrl -Value $machineValue
if (Test-PostgresDatabaseUrl -Value $normalizedMachineValue) {
  [Console]::Write($normalizedMachineValue)
}
