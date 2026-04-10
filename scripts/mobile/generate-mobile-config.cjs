/* eslint-disable no-console */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function awsJson(args, env) {
  const stdout = execFileSync("aws", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout);
}

function getStackOutputs({ stackName, profile, region, env }) {
  const response = awsJson(
    ["cloudformation", "describe-stacks", "--stack-name", stackName, "--profile", profile, "--region", region],
    env,
  );
  const outputs = response?.Stacks?.[0]?.Outputs || [];
  return Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));
}

function listStackResources({ stackName, profile, region, env }) {
  const response = awsJson(
    ["cloudformation", "list-stack-resources", "--stack-name", stackName, "--profile", profile, "--region", region],
    env,
  );
  return response?.StackResourceSummaries || [];
}

function getResourceByType({ stackName, resourceType, profile, region, env }) {
  const resources = listStackResources({ stackName, profile, region, env });
  const match = resources.find((entry) => entry.ResourceType === resourceType);
  return match?.PhysicalResourceId || "";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(source, target) {
  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function run() {
  const environment = requireEnv("MOBILE_ENV");
  const profile = requireEnv("AWS_PROFILE");
  const region = requireEnv("AWS_REGION");
  const repoRoot = path.resolve(__dirname, "../..");
  const configPath = path.join(repoRoot, "mobile", "infra", "cdk", "config", `${environment}.json`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const stackName = config.stackName;
  const env = { ...process.env, AWS_PAGER: "", AWS_REGION: region };

  const outputs = getStackOutputs({ stackName, profile, region, env });
  const webUrl = String(outputs.MobileCloudFrontUrl || "").replace(/\/+$/, "");
  const apiBaseUrl = String(outputs.MobileApiBaseUrl || "").replace(/\/+$/, "");
  const userPoolId = outputs.MobileUserPoolId;
  const userPoolClientId = outputs.MobileUserPoolClientId;

  const pool = awsJson(
    ["cognito-idp", "describe-user-pool-domain", "--domain", config.cognitoDomainPrefix, "--profile", profile, "--region", region],
    env,
  );
  const cognitoDomain = pool?.DomainDescription?.Domain;
  const domainUrl = cognitoDomain ? `https://${cognitoDomain}.auth.${region}.amazoncognito.com` : "";

  if (!webUrl || !apiBaseUrl || !userPoolId || !userPoolClientId || !domainUrl) {
    throw new Error("Missing required stack outputs for mobile config generation");
  }

  const bucketName = getResourceByType({ stackName, resourceType: "AWS::S3::Bucket", profile, region, env });
  const distributionId = getResourceByType({ stackName, resourceType: "AWS::CloudFront::Distribution", profile, region, env });

  const sourceDir = path.join(repoRoot, "mobile-web");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `wms-mobile-${environment}-`));
  const webDir = path.join(tempDir, "mobile-web");
  copyDir(sourceDir, webDir);

  const mobileConfig = `window.__WMS_MOBILE_CONFIG__ = {
  apiBaseUrl: "${apiBaseUrl}",
  authMode: "${config.mobileAuthMode || "cognito"}",
  environment: "${environment}",
  cognito: {
    domain: "${domainUrl.replace(/"/g, '\\"')}",
    clientId: "${String(userPoolClientId).replace(/"/g, '\\"')}",
    redirectUri: "${config.callbackUrls[0].replace(/"/g, '\\"')}",
    logoutUri: "${config.logoutUrls[0].replace(/"/g, '\\"')}",
    scope: "openid email profile",
  },
};
`;

  fs.writeFileSync(path.join(webDir, "config.js"), mobileConfig, "utf8");

  const manifest = {
    environment,
    stackName,
    bucketName,
    distributionId,
    webDir,
    apiBaseUrl,
    webUrl,
    userPoolId,
    userPoolClientId,
    domainUrl,
  };

  const manifestPath = path.join(tempDir, "deploy-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(JSON.stringify(manifest, null, 2));
}

run();
