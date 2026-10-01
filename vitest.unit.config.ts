import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.unit.test.{ts,js,cjs}", "tests/**/*.contract.test.{ts,js,cjs}", "tests/sales-internal-order-flow.test.ts"],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
