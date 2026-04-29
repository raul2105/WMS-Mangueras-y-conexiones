param(
  [string]$JiraProject = "KAN",
  [string]$JiraSite = "",
  [switch]$Favorite = $true,
  [switch]$SkipShare = $false,
  [string]$ShareGroup = "",
  [switch]$FailOnMissingAuth = $false
)

$ErrorActionPreference = "Stop"

function Get-EnvOrDefault([string]$Value, [string]$Default) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $Default }
  return $Value
}

function New-AuthHeader {
  param(
    [string]$Email,
    [string]$Token
  )
  $pair = "$Email`:$Token"
  $base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
  return @{
    Authorization = "Basic $base64"
    Accept = "application/json"
    "Content-Type" = "application/json"
  }
}

function Invoke-JiraApi {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  if ($null -ne $Body) {
    $jsonBody = $Body | ConvertTo-Json -Depth 20
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -Body $jsonBody
  }

  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
}

function Get-ExistingFilterByName {
  param(
    [string]$Site,
    [hashtable]$Headers,
    [string]$Name
  )
  $query = [uri]::EscapeDataString($Name)
  $url = "$Site/rest/api/3/filter/search?filterName=$query&maxResults=50"
  $res = Invoke-JiraApi -Method "GET" -Url $url -Headers $Headers
  if ($null -eq $res.values) { return $null }
  return ($res.values | Where-Object { $_.name -eq $Name } | Select-Object -First 1)
}

function Set-FilterFavorite {
  param(
    [string]$Site,
    [hashtable]$Headers,
    [int]$FilterId
  )
  $url = "$Site/rest/api/3/filter/$FilterId/favourite"
  try {
    Invoke-JiraApi -Method "PUT" -Url $url -Headers $Headers | Out-Null
  } catch {
    Write-Warning "No se pudo marcar como favorito el filtro ${FilterId}: $($_.Exception.Message)"
  }
}

function Ensure-GroupSharePermission {
  param(
    [string]$Site,
    [hashtable]$Headers,
    [int]$FilterId,
    [string]$GroupName
  )

  if ([string]::IsNullOrWhiteSpace($GroupName)) { return }

  $existingUrl = "$Site/rest/api/3/filter/$FilterId/permission"
  try {
    $existing = Invoke-JiraApi -Method "GET" -Url $existingUrl -Headers $Headers
    $already = $false
    if ($null -ne $existing.permissions) {
      $already = $existing.permissions | Where-Object {
        $_.type -eq "group" -and $_.group.name -eq $GroupName
      } | Select-Object -First 1
    }
    if ($already) { return }
  } catch {
    Write-Warning "No se pudieron leer permisos actuales del filtro ${FilterId}. Se intentará crear permiso."
  }

  $createUrl = "$Site/rest/api/3/filter/$FilterId/permission"
  $body = @{
    type = "group"
    groupname = $GroupName
  }
  try {
    Invoke-JiraApi -Method "POST" -Url $createUrl -Headers $Headers -Body $body | Out-Null
  } catch {
    Write-Warning "No se pudo compartir filtro ${FilterId} con grupo '$GroupName': $($_.Exception.Message)"
  }
}

$site = Get-EnvOrDefault -Value $JiraSite -Default $env:JIRA_SITE
$site = Get-EnvOrDefault -Value $site -Default "https://rigentec.atlassian.net"
$email = $env:JIRA_EMAIL
$token = $env:JIRA_API_TOKEN

if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($token)) {
  $msg = "Faltan JIRA_EMAIL/JIRA_API_TOKEN. No se sincronizaron vistas."
  if ($FailOnMissingAuth) {
    throw $msg
  }
  Write-Warning $msg
  Write-Output "TIP: Define variables y reintenta. Ejemplo: `$env:JIRA_EMAIL='tu_correo'; `$env:JIRA_API_TOKEN='***'"
  exit 0
}

$headers = New-AuthHeader -Email $email -Token $token
$shareGroupResolved = Get-EnvOrDefault -Value $ShareGroup -Default $env:JIRA_SHARE_GROUP

$views = @(
  @{
    name = "$JiraProject - En curso y En revision"
    description = "Vista operativa para seguimiento diario de tickets activos."
    jql = "project = $JiraProject AND status in (""En curso"", ""En revisión"", ""Tareas por hacer"") ORDER BY updated DESC"
  },
  @{
    name = "$JiraProject - Highest vencidos o sin owner"
    description = "Control de urgencias con riesgo operativo."
    jql = "project = $JiraProject AND priority = Highest AND statusCategory != Done AND (assignee is EMPTY OR duedate < startOfDay()) ORDER BY duedate ASC"
  },
  @{
    name = "$JiraProject - Sin enlace PR"
    description = "Deteccion de tickets activos sin traza de PR."
    jql = "project = $JiraProject AND statusCategory != Done AND (labels not in (has_pr) OR labels is EMPTY) ORDER BY updated DESC"
  }
)

$results = @()
foreach ($view in $views) {
  $existing = Get-ExistingFilterByName -Site $site -Headers $headers -Name $view.name

  if ($null -eq $existing) {
    $createUrl = "$site/rest/api/3/filter"
    $body = @{
      name = $view.name
      description = $view.description
      jql = $view.jql
      favourite = [bool]$Favorite
    }
    $created = Invoke-JiraApi -Method "POST" -Url $createUrl -Headers $headers -Body $body
    $filter = $created
    $action = "created"
  } else {
    $updateUrl = "$site/rest/api/3/filter/$($existing.id)"
    $body = @{
      name = $view.name
      description = $view.description
      jql = $view.jql
    }
    Invoke-JiraApi -Method "PUT" -Url $updateUrl -Headers $headers -Body $body | Out-Null
    $filter = Get-ExistingFilterByName -Site $site -Headers $headers -Name $view.name
    $action = "updated"
  }

  if ($Favorite) {
    Set-FilterFavorite -Site $site -Headers $headers -FilterId ([int]$filter.id)
  }

  if (-not $SkipShare -and -not [string]::IsNullOrWhiteSpace($shareGroupResolved)) {
    Ensure-GroupSharePermission -Site $site -Headers $headers -FilterId ([int]$filter.id) -GroupName $shareGroupResolved
  }

  $results += [pscustomobject]@{
    name = $view.name
    id = $filter.id
    action = $action
    jql = $view.jql
    url = "$site/issues/?filter=$($filter.id)"
  }
}

Write-Output "Jira views sync completed:"
$results | ForEach-Object {
  Write-Output "- [$($_.action)] $($_.name) | id=$($_.id) | $($_.url)"
}
