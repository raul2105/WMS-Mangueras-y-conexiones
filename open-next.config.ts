import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

const config: OpenNextConfig = {
  default: {
    // Override: skip DynamoDB for ISR cache (all pages are force-dynamic)
    override: {
      tagCache: "dummy",
      incrementalCache: "dummy",
      queue: "dummy",
    },
  },
};

export default config;
