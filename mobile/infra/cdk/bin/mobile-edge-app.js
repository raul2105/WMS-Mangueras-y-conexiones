#!/usr/bin/env node
const cdk = require("aws-cdk-lib");
const { MobileEdgeStack } = require("../lib/mobile-edge-stack");
const { loadMobileConfig } = require("../lib/mobile-config");

const app = new cdk.App();
const config = loadMobileConfig(app);

new MobileEdgeStack(app, config.stackName, {
  mobileConfig: config,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
});
