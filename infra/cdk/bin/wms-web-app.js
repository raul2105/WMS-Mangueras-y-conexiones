#!/usr/bin/env node
/**
 * CDK entry point — WMS Web Stack
 *
 * Usage:
 *   WMS_ENV=dev  npx cdk synth
 *   WMS_ENV=prod npx cdk deploy
 *
 * Or via context:
 *   npx cdk synth -c env=dev
 */
const cdk = require("aws-cdk-lib");
const { loadWebConfig } = require("../lib/web-config");
const { WmsWebStack } = require("../lib/wms-web-stack");

const app = new cdk.App();
const config = loadWebConfig(app);

new WmsWebStack(app, config.stackName, {
  env: {
    region: config.region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  webConfig: config,
  description: `WMS Web infrastructure (${config.environment}) — VPC, RDS, SSM`,
});
