import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,js,cjs}"],
    testTimeout: 30000,
    setupFiles: ["tests/setup/postgres-worker-isolation.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
