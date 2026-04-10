const { loadMobileConfig } = require("../lib/mobile-config");

function run() {
  const app = {
    node: {
      tryGetContext: () => undefined,
    },
  };

  const config = loadMobileConfig(app);
  console.log(`[mobile-precheck] environment=${config.environment}`);
  console.log(`[mobile-precheck] stack=${config.stackName}`);
  console.log(`[mobile-precheck] mobile_enabled=${String(Boolean(config.flags?.mobile_enabled))}`);
  console.log("[mobile-precheck] config validation OK");
}

run();
