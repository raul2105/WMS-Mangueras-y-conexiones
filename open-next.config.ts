import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

const config: OpenNextConfig = {
  imageOptimization: {
    install: {
      packages: ["sharp@0.35.4"],
      arch: "arm64",
      os: "linux",
      nodeVersion: "22",
      libc: "glibc",
    },
  },
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
