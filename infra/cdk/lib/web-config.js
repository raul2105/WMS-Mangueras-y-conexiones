/**
 * Load environment-specific configuration for the WMS Web stack.
 * Usage: WMS_ENV=dev|prod cdk synth
 */
const fs = require("node:fs");
const path = require("node:path");

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

  for (const key of REQUIRED_KEYS) {
    if (config[key] === undefined) {
      throw new Error(`Missing required config key "${key}" in ${configPath}`);
    }
  }

  return config;
}

module.exports = { loadWebConfig };
