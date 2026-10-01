/**
 * Load environment-specific configuration for the WMS Web stack.
 * Usage: WMS_ENV=dev|prod cdk synth
 */
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

const REQUIRED_KEYS = [
  "environment",
  "region",
  "namePrefix",
  "stackName",
  "dbInstanceClass",
  "dbAllocatedStorageGb",
  "dbName",
  "dbUsername",
];

function loadWebConfig(app) {
  const env =
    app.node.tryGetContext("env") ||
    process.env.WMS_ENV ||
    "dev";

  const configPath = path.join(__dirname, "..", "config", `${env}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Set WMS_ENV=dev|prod`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.productionMode !== undefined && typeof config.productionMode !== "boolean") {
    throw new Error("productionMode must be an explicit boolean");
  }
  if (config.productionMode && config.scheduleControl?.enabled) {
    throw new Error("Production services cannot use development shutdown schedules");
  }
  if ((config.accountId !== undefined || config.productionMode) && !/^\d{12}$/.test(config.accountId ?? "")) {
    throw new Error("Production mode requires an explicit AWS accountId");
  }
  // Keep an operator's current office address out of versioned configuration.
  if (process.env.WMS_NETWORK_MODE) config.networkMode = process.env.WMS_NETWORK_MODE;
  if (process.env.WMS_OFFICE_IP_CIDR) config.officeIpCidr = process.env.WMS_OFFICE_IP_CIDR;
  const productionAlertEmail = process.env.WMS_PRODUCTION_ALERT_EMAIL?.trim();
  if (productionAlertEmail) {
    if (config.environment !== "prod" && config.productionMode !== true) {
      throw new Error("WMS_PRODUCTION_ALERT_EMAIL can only be used with production configuration");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(productionAlertEmail)) {
      throw new Error("WMS_PRODUCTION_ALERT_EMAIL must be a valid email address");
    }
    config.productionAlertEmail = productionAlertEmail;
  }
  if (config.appBaseUrl) {
    const baseUrl = new URL(config.appBaseUrl);
    if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
      throw new Error("appBaseUrl must be a canonical HTTPS origin");
    }
  }

  if (config.gmailOAuth !== undefined) {
    const gmail = config.gmailOAuth;
    if (!gmail || typeof gmail !== "object" || typeof gmail.enabled !== "boolean") {
      throw new Error("gmailOAuth must define an explicit boolean enabled flag");
    }
    if (gmail.secretName != null && gmail.secretName !== `${config.namePrefix}-gmail`) {
      throw new Error("gmailOAuth.secretName must use the environment-owned Gmail secret name");
    }
    if (gmail.enabled && (!gmail.secretName || !config.appBaseUrl)) {
      throw new Error("Enabling Gmail requires its managed secret and canonical appBaseUrl");
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (config[key] === undefined) {
      throw new Error(`Missing required config key "${key}" in ${configPath}`);
    }
  }

  if (config.networkMode !== undefined && config.networkMode !== "ipv6-private") {
    throw new Error(`Unsupported networkMode "${config.networkMode}" in ${configPath}`);
  }

  const isOfficeIpv4Host = (value) => {
    if (typeof value !== "string" || !value.endsWith("/32")) return false;
    return net.isIPv4(value.slice(0, -3));
  };

  if ((config.environment === "prod" || config.productionMode) && !isOfficeIpv4Host(config.officeIpCidr)) {
    throw new Error(
      `Production config must set officeIpCidr to a specific IPv4 /32 in ${configPath}`
    );
  }

  if (config.networkMode === "ipv6-private" && !isOfficeIpv4Host(config.officeIpCidr)) {
    throw new Error(
      `networkMode "ipv6-private" requires officeIpCidr to be a specific IPv4 /32 in ${configPath}`
    );
  }

  return config;
}

module.exports = { loadWebConfig };
