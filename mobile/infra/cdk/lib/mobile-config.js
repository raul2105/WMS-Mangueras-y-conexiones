const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_KEYS = [
  "environment",
  "region",
  "namePrefix",
  "stackName",
  "cognitoDomainPrefix",
  "callbackUrls",
  "logoutUrls",
  "corsAllowedOrigins",
  "flags",
];

function assertArray(value, key) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid config key "${key}": expected non-empty array`);
  }
}

function assertString(value, key) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid config key "${key}": expected non-empty string`);
  }
}

function assertHttpsUrl(url, key) {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error(`Invalid config key "${key}": expected https URL`);
  }
}

function containsExampleDomain(urls) {
  return urls.some((url) => /example\.com/i.test(String(url)));
}

function loadMobileConfig(app) {
  const envName = (process.env.MOBILE_ENV || app.node.tryGetContext("env") || "dev").trim();
  const configPath = path.resolve(__dirname, `../config/${envName}.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing mobile config file: ${configPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`Missing config key "${key}" in ${configPath}`);
    }
  }

  assertString(parsed.environment, "environment");
  assertString(parsed.region, "region");
  assertString(parsed.namePrefix, "namePrefix");
  assertString(parsed.stackName, "stackName");
  assertString(parsed.cognitoDomainPrefix, "cognitoDomainPrefix");
  assertArray(parsed.callbackUrls, "callbackUrls");
  assertArray(parsed.logoutUrls, "logoutUrls");
  assertArray(parsed.corsAllowedOrigins, "corsAllowedOrigins");

  if (parsed.environment === "prod") {
    if (parsed.mobileAuthMode !== "cognito") {
      throw new Error('Invalid prod config: "mobileAuthMode" must be "cognito"');
    }

    if (!parsed.flags || parsed.flags.mobile_enabled !== true) {
      throw new Error('Invalid prod config: "flags.mobile_enabled" must be true');
    }

    if (containsExampleDomain(parsed.callbackUrls) || containsExampleDomain(parsed.logoutUrls)) {
      throw new Error("Invalid prod config: replace example.com callback/logout URLs before deploy");
    }

    parsed.callbackUrls.forEach((url) => assertHttpsUrl(url, "callbackUrls"));
    parsed.logoutUrls.forEach((url) => assertHttpsUrl(url, "logoutUrls"));
    parsed.corsAllowedOrigins.forEach((url) => assertHttpsUrl(url, "corsAllowedOrigins"));
  }

  return parsed;
}

module.exports = { loadMobileConfig };
