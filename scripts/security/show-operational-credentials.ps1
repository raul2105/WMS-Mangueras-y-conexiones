param(
    [string]$Path = (Join-Path $env:LOCALAPPDATA 'WMS\private\operational-credentials.clixml')
)
$ErrorActionPreference = 'Stop'
# Run this yourself on the same Windows account that prepared the recovery file.
# Export-Clixml encrypts each PSCredential password using Windows DPAPI.
$taskCredentials = Import-Clixml -LiteralPath $Path
foreach ($taskCredential in $taskCredentials) {
    Write-Host $taskCredential.UserName
    Write-Host $taskCredential.GetNetworkCredential().Password
    Write-Host ''
}
Write-Host 'Estas claves son privadas. No las copies a Jira, GitHub ni capturas públicas.'
