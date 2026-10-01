param([Parameter(Mandatory=$true)][string]$ExpectedCommitSha)
$ErrorActionPreference='Stop'
if($ExpectedCommitSha -notmatch '^[0-9a-f]{40}$'){throw 'Expected candidate SHA required'}
$taskPrefix=$ExpectedCommitSha.Substring(0,12)
$taskRestoreId='wms-prod-restore-20260930-'+$taskPrefix
$taskSnapshotId='wms-prod-delivery-'+$taskPrefix+'-20260930'
$taskRun='prod-recovery-'+$taskPrefix
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskFolder=Join-Path $taskRoot 'output\production-restore-proof-20260930'
[System.IO.Directory]::CreateDirectory($taskFolder)>$null
$taskCreated=$false
$taskRestoreAttempted=$false
$taskProof=@{instance=$taskRestoreId;snapshot=$taskSnapshotId;runId=$taskRun;commitSha=$ExpectedCommitSha;startedAt=[DateTime]::UtcNow.ToString('o');cleaned=$false}
function Read-AwsJson([string[]]$Arguments) {
  $taskResult=& aws @Arguments --profile Raul_ITsupport --region us-east-1 --output json 2>&1
  if($LASTEXITCODE -ne 0){throw 'AWS recovery operation failed; review the service state before retrying.'}
  return (($taskResult|Out-String)|ConvertFrom-Json)
}
function Save-RecoveryProof {$taskProof|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taskFolder 'evidence.json')}
try {
  $taskIdentity=Read-AwsJson @('sts','get-caller-identity')
  if($taskIdentity.Account -ne '904891391424'){throw 'AWS account guard'}
  $taskHealth=Invoke-RestMethod ('https://d2b1ltxtvypxr4.cloudfront.net/api/health?recovery='+[DateTime]::UtcNow.Ticks)
  if(!$taskHealth.ok -or $taskHealth.db -ne 'up' -or $taskHealth.environment -ne 'prod' -or $taskHealth.commitSha -ne $ExpectedCommitSha){throw 'Validated production runtime required'}
  $taskInstances=Read-AwsJson @('rds','describe-db-instances')
  if($taskInstances.DBInstances.DBInstanceIdentifier -contains $taskRestoreId){throw 'Restore name already exists; will not modify it'}
  $taskDb=($taskInstances.DBInstances|Where-Object DBInstanceIdentifier -eq 'wms-web-dev-pg')
  if(!$taskDb -or !$taskDb.StorageEncrypted -or !$taskDb.DeletionProtection -or $taskDb.DBInstanceStatus -ne 'available'){throw 'Canonical RDS operational protection required'}
  $taskOutputs=Read-AwsJson @('cloudformation','describe-stacks','--stack-name','WmsWebDevStack')
  $taskSecretArn=($taskOutputs.Stacks[0].Outputs|Where-Object OutputKey -eq 'DbSecretArn').OutputValue
  $taskSecret=Read-AwsJson @('secretsmanager','get-secret-value','--secret-id',$taskSecretArn)
  $taskSecret=($taskSecret.SecretString|ConvertFrom-Json)
  if($taskDb.Endpoint.Address -ne 'wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com'){throw 'Canonical endpoint guard'}
  $env:DATABASE_URL='postgresql://'+[Uri]::EscapeDataString($taskSecret.username)+':'+[Uri]::EscapeDataString($taskSecret.password)+'@'+$taskDb.Endpoint.Address+':5432/wms?schema=public&connection_limit=2&pool_timeout=10&sslmode=require'
  node (Join-Path $PSScriptRoot 'aws-recovery-fingerprints.cjs') baseline
  if($LASTEXITCODE -ne 0){throw 'Final baseline integrity failed'}
  $taskSnapshots=Read-AwsJson @('rds','describe-db-snapshots','--db-instance-identifier','wms-web-dev-pg')
  if($taskSnapshots.DBSnapshots.DBSnapshotIdentifier -contains $taskSnapshotId){throw 'Snapshot name already exists; preserve it and inspect evidence'}
  $null=Read-AwsJson @('rds','create-db-snapshot','--db-instance-identifier','wms-web-dev-pg','--db-snapshot-identifier',$taskSnapshotId,'--tags','Key=Project,Value=WMS',("Key=ValidationRun,Value="+$taskRun))
  Save-RecoveryProof
  aws rds wait db-snapshot-available --db-snapshot-identifier $taskSnapshotId --profile Raul_ITsupport --region us-east-1
  if($LASTEXITCODE -ne 0){throw 'Snapshot not yet available'}
  $taskSnapshot=(Read-AwsJson @('rds','describe-db-snapshots','--db-snapshot-identifier',$taskSnapshotId)).DBSnapshots[0]
  if(!$taskSnapshot.Encrypted -or $taskSnapshot.Status -ne 'available'){throw 'Snapshot protection guard'}
  $taskSg=$taskDb.VpcSecurityGroups[0].VpcSecurityGroupId
  $taskGroup=(Read-AwsJson @('ec2','describe-security-groups','--group-ids',$taskSg)).SecurityGroups[0]
  $taskResources=Read-AwsJson @('cloudformation','describe-stack-resources','--stack-name','WmsWebDevStack')
  $taskLambdaSg=($taskResources.StackResources|Where-Object LogicalResourceId -eq 'LambdaSecurityGroup0BD9FC99').PhysicalResourceId
  $taskOfficeIp=(Get-Content -LiteralPath (Join-Path $taskRoot 'output\office-public-address-20260929.txt') -Raw).Trim()
  $taskParsedOfficeIp=$null
  if(!$taskLambdaSg -or ![System.Net.IPAddress]::TryParse($taskOfficeIp,[ref]$taskParsedOfficeIp) -or $taskParsedOfficeIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork){throw 'Recovery network allowlist unavailable'}
  if(@($taskDb.VpcSecurityGroups).Count -ne 1 -or @($taskGroup.IpPermissions).Count -lt 1 -or @($taskGroup.IpPermissions).Count -gt 2){throw 'Unexpected recovery security groups or ingress rules'}
  $taskOfficeRule=0; $taskLambdaRule=0
  foreach($taskIngress in $taskGroup.IpPermissions){
    if($taskIngress.IpProtocol -ne 'tcp' -or $taskIngress.FromPort -ne 5432 -or $taskIngress.ToPort -ne 5432 -or @($taskIngress.Ipv6Ranges).Count -or @($taskIngress.PrefixListIds).Count){throw 'Unexpected recovery ingress protocol, port or source'}
    if(@($taskIngress.IpRanges).Count + @($taskIngress.UserIdGroupPairs).Count -eq 0){throw 'Recovery ingress source missing'}
    foreach($taskRange in $taskIngress.IpRanges){
      if($taskRange.CidrIp -ne ($taskOfficeIp+'/32')){throw 'Recovery IPv4 ingress differs from the office allowlist'}
      $taskOfficeRule++
    }
    foreach($taskPair in $taskIngress.UserIdGroupPairs){
      if($taskPair.GroupId -ne $taskLambdaSg -or $taskPair.UserId -ne $taskIdentity.Account){throw 'Recovery group ingress differs from the Lambda allowlist'}
      $taskLambdaRule++
    }
  }
  if($taskOfficeRule -ne 1 -or $taskLambdaRule -ne 1){throw 'Recovery ingress allowlist incomplete'}
  $taskProof.networkAllowlistVerified=$true
  $taskRestoreAttempted=$true
  $null=Read-AwsJson @('rds','restore-db-instance-from-db-snapshot','--db-instance-identifier',$taskRestoreId,'--db-snapshot-identifier',$taskSnapshotId,'--db-instance-class','db.t4g.micro','--db-subnet-group-name',$taskDb.DBSubnetGroup.DBSubnetGroupName,'--db-parameter-group-name',$taskDb.DBParameterGroups[0].DBParameterGroupName,'--vpc-security-group-ids',$taskSg,'--publicly-accessible','--no-multi-az','--no-deletion-protection','--tags','Key=Environment,Value=validation','Key=Project,Value=WMS',("Key=ValidationRun,Value="+$taskRun))
  $taskCreated=$true
  $taskProof.created=$true
  Save-RecoveryProof
  aws rds wait db-instance-available --db-instance-identifier $taskRestoreId --profile Raul_ITsupport --region us-east-1
  if($LASTEXITCODE -ne 0){throw 'Restore not available; owned cleanup required'}
  $taskRestored=(Read-AwsJson @('rds','describe-db-instances','--db-instance-identifier',$taskRestoreId)).DBInstances[0]
  $env:WMS_RESTORE_QA_ENDPOINT=$taskRestored.Endpoint.Address
  node (Join-Path $PSScriptRoot 'aws-recovery-fingerprints.cjs') restored
  if($LASTEXITCODE -ne 0){throw 'Restored data verification failed'}
  $taskProof.database=Get-Content -LiteralPath (Join-Path $taskFolder 'restored.json') -Raw|ConvertFrom-Json
  $taskProof.outcome='PASS'
} catch {$taskProof.outcome='FAIL';$taskProof.error=$_.Exception.Message}
finally {
  if($taskCreated -or $taskRestoreAttempted){
    try {
      $taskOwned=(Read-AwsJson @('rds','describe-db-instances')).DBInstances|Where-Object DBInstanceIdentifier -eq $taskRestoreId
      if(!$taskOwned){$taskProof.cleaned=$true; $taskProof.restoreAbsentAtCleanup=$true}
      else {
      $taskTags=(Read-AwsJson @('rds','list-tags-for-resource','--resource-name',$taskOwned.DBInstanceArn)).TagList
      if($taskRestoreId -notmatch '^wms-prod-restore-20260930-[0-9a-f]{12}$' -or !($taskTags|Where-Object{$_.Key -eq 'ValidationRun' -and $_.Value -eq $taskRun})){throw 'Recovery cleanup ownership mismatch'}
      $null=Read-AwsJson @('rds','delete-db-instance','--db-instance-identifier',$taskRestoreId,'--skip-final-snapshot','--delete-automated-backups')
      aws rds wait db-instance-deleted --db-instance-identifier $taskRestoreId --profile Raul_ITsupport --region us-east-1
      if($LASTEXITCODE -ne 0){throw 'Owned restore deletion unconfirmed'}
      $taskProof.cleaned=$true
      }
    }catch{$taskProof.cleanupError=$_.Exception.Message}
  }
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:WMS_RESTORE_QA_ENDPOINT -ErrorAction SilentlyContinue
  $taskProof.finishedAt=[DateTime]::UtcNow.ToString('o')
  Save-RecoveryProof
  [pscustomobject]@{outcome=$taskProof.outcome;cleaned=$taskProof.cleaned;snapshot=$taskSnapshotId;instance=$taskRestoreId;error=$taskProof.error;cleanupError=$taskProof.cleanupError}|ConvertTo-Json
}
if($taskProof.outcome -ne 'PASS' -or !$taskProof.cleaned){exit 1}
