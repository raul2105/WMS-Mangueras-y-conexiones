#!/usr/bin/env node
// Called only by the SDK credential_process provider. Its stdout is the
// credentials protocol, never a diagnostic log or a user-facing command.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

try {
  const originalConfig = process.env.WMS_AWS_LOGIN_CONFIG_FILE;
  const profile = process.env.WMS_AWS_LOGIN_PROFILE;
  if (!originalConfig || !path.isAbsolute(originalConfig) || !/^[A-Za-z0-9_-]+$/.test(profile ?? '')) {
    throw new Error('Missing original login configuration');
  }
  const environment = { ...process.env, AWS_CONFIG_FILE: originalConfig, AWS_PROFILE: profile };
  // Do not let exported, expired session credentials mask the console login.
  for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_SHARED_CREDENTIALS_FILE']) {
    delete environment[key];
  }
  const aws = process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Amazon', 'AWSCLIV2', 'aws.exe')
    : 'aws';
  const result = execFileSync(aws, ['configure', 'export-credentials', '--profile', profile, '--format', 'process'], {
    env: environment, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
  const credential = JSON.parse(result);
  if (credential.Version !== 1 || !credential.AccessKeyId || !credential.SecretAccessKey || !credential.SessionToken || !credential.Expiration) {
    throw new Error('Invalid temporary credential response');
  }
  process.stdout.write(JSON.stringify(credential));
} catch {
  process.stderr.write('AWS console-login credential provider unavailable; renew the authorized login.\n');
  process.exitCode = 1;
}
