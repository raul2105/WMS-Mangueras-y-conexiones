param(
  [string]$JiraProject = "KAN",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host "=== $title ==="
}

function Get-GitSnapshot {
  $branch = (git branch --show-current).Trim()
  git fetch --all --prune --quiet | Out-Null
  $counts = ((git rev-list --left-right --count HEAD...origin/main).Trim() -split "\s+")
  $behind = 0
  $ahead = 0
  if ($counts.Length -ge 2) {
    $ahead = [int]$counts[0]
    $behind = [int]$counts[1]
  }

  $status = git status --short --branch
  $activeBranches = git for-each-ref --format="%(refname:short) %(committerdate:short)" refs/heads/

  [pscustomobject]@{
    branch = $branch
    behind = $behind
    ahead = $ahead
    status = $status
    activeBranches = $activeBranches
  }
}

function Get-GitHubSnapshot {
  $ghExists = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $ghExists) {
    return [pscustomobject]@{
      available = $false
      note = "GitHub CLI (gh) no disponible."
      prs = @()
      failedChecks = @()
    }
  }

  $authOk = $true
  try {
    gh auth status | Out-Null
  } catch {
    $authOk = $false
  }

  if (-not $authOk) {
    return [pscustomobject]@{
      available = $false
      note = "GitHub CLI disponible, pero sin autenticacion activa."
      prs = @()
      failedChecks = @()
    }
  }

  $repo = (git config --get remote.origin.url).Trim()
  $repoName = $repo -replace "https://github.com/", "" -replace "\.git$", ""
  $prsJson = gh pr list --repo $repoName --state open --json number,title,headRefName,author,url,statusCheckRollup
  $prs = $prsJson | ConvertFrom-Json

  $failed = @()
  foreach ($pr in $prs) {
    if ($null -ne $pr.statusCheckRollup) {
      foreach ($check in $pr.statusCheckRollup) {
        if ($check.conclusion -eq "FAILURE" -or $check.conclusion -eq "TIMED_OUT" -or $check.conclusion -eq "CANCELLED") {
          $failed += [pscustomobject]@{
            pr = $pr.number
            title = $pr.title
            check = $check.name
            conclusion = $check.conclusion
          }
        }
      }
    }
  }

  return [pscustomobject]@{
    available = $true
    note = ""
    prs = $prs
    failedChecks = $failed
  }
}

function Get-JiraSnapshot {
  $site = $env:JIRA_SITE
  if ([string]::IsNullOrWhiteSpace($site)) {
    $site = "https://rigentec.atlassian.net"
  }
  $projectEscaped = [uri]::EscapeDataString($JiraProject)
  $jqlHighestOverdue = [uri]::EscapeDataString("project = $JiraProject AND priority = Highest AND statusCategory != Done AND duedate < startOfDay() ORDER BY duedate ASC")
  $jqlNoOwner = [uri]::EscapeDataString("project = $JiraProject AND statusCategory != Done AND assignee is EMPTY ORDER BY priority DESC, updated DESC")
  $jqlInFlight = [uri]::EscapeDataString("project = $JiraProject AND status in (""Tareas por hacer"", ""En revision"", ""En curso"") ORDER BY updated DESC")

  $links = [pscustomobject]@{
    highestOverdue = "$site/issues/?jql=$jqlHighestOverdue"
    noOwner = "$site/issues/?jql=$jqlNoOwner"
    inFlight = "$site/issues/?jql=$jqlInFlight"
  }

  $email = $env:JIRA_EMAIL
  $token = $env:JIRA_API_TOKEN
  if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($token)) {
    return [pscustomobject]@{
      apiAvailable = $false
      note = "Sin JIRA_EMAIL/JIRA_API_TOKEN; se entregan enlaces JQL para revision manual."
      links = $links
      highestOverdue = -1
      noOwner = -1
      inFlight = -1
    }
  }

  $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$email`:$token"))
  $headers = @{
    Authorization = "Basic $auth"
    Accept = "application/json"
  }

  function Get-JiraCount($baseUrl, $jqlEncoded, $headers) {
    $url = "$baseUrl/rest/api/3/search/jql?jql=$jqlEncoded&maxResults=1&fields=key"
    $res = Invoke-RestMethod -Method Get -Uri $url -Headers $headers
    return [int]$res.issues.totalCount
  }

  $highestCount = Get-JiraCount $site $jqlHighestOverdue $headers
  $noOwnerCount = Get-JiraCount $site $jqlNoOwner $headers
  $inFlightCount = Get-JiraCount $site $jqlInFlight $headers

  return [pscustomobject]@{
    apiAvailable = $true
    note = ""
    links = $links
    highestOverdue = $highestCount
    noOwner = $noOwnerCount
    inFlight = $inFlightCount
  }
}

$git = Get-GitSnapshot
$gh = Get-GitHubSnapshot
$jira = Get-JiraSnapshot

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("DELTA DEL DIA - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("")
$lines.Add("Git local")
$lines.Add("- Branch activa: $($git.branch)")
$lines.Add("- Divergencia vs origin/main: behind=$($git.behind), ahead=$($git.ahead)")
$lines.Add("- Cambios locales:")
foreach ($line in $git.status) {
  $lines.Add([string]$line)
}
$lines.Add("")
$lines.Add("GitHub")
if (-not $gh.available) {
  $lines.Add("- $($gh.note)")
} else {
  $lines.Add("- PRs abiertos: $($gh.prs.Count)")
  foreach ($pr in $gh.prs) {
    $lines.Add("  - #$($pr.number) $($pr.title) ($($pr.headRefName)) $($pr.url)")
  }
  if ($gh.failedChecks.Count -gt 0) {
    $lines.Add("- Checks fallidos:")
    foreach ($f in $gh.failedChecks) {
      $lines.Add("  - PR #$($f.pr): $($f.check) [$($f.conclusion)]")
    }
  } else {
    $lines.Add("- Checks fallidos: 0 detectados")
  }
}
$lines.Add("")
$lines.Add("Jira")
if (-not $jira.apiAvailable) {
  $lines.Add("- $($jira.note)")
} else {
  $lines.Add("- Highest vencidos: $($jira.highestOverdue)")
  $lines.Add("- Tickets sin owner: $($jira.noOwner)")
  $lines.Add("- Tickets en curso/revision: $($jira.inFlight)")
}
$lines.Add("- JQL Highest vencidos: $($jira.links.highestOverdue)")
$lines.Add("- JQL Sin owner: $($jira.links.noOwner)")
$lines.Add("- JQL En curso/revision: $($jira.links.inFlight)")

$report = $lines -join [Environment]::NewLine

Write-Section "Delta del dia"
Write-Output $report

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
  $dir = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $report | Out-File -LiteralPath $OutputPath -Encoding utf8
  Write-Host ""
  Write-Host "Reporte guardado en: $OutputPath"
}
