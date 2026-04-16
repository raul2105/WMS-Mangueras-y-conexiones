param(
  [Parameter(Mandatory = $true)]
  [int]$Port
)

$ErrorActionPreference = "Stop"

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $listener) {
  exit 0
}

$processId = $listener.OwningProcess
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue

Write-Host "[ERROR] Puerto $Port en uso (PID $processId)."
if ($processInfo -and $processInfo.CommandLine) {
  Write-Host "[ERROR] CommandLine: $($processInfo.CommandLine)"
}

exit 2
