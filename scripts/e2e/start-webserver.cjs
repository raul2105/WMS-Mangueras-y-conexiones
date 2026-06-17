#!/usr/bin/env node
/* eslint-disable no-console */

const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const env = { ...process.env };

if (!env.AUTH_SECRET && !env.NEXTAUTH_SECRET) {
  env.AUTH_SECRET = "wms-e2e-local-secret";
  env.NEXTAUTH_SECRET = env.AUTH_SECRET;
  console.log("[e2e:webserver] AUTH_SECRET not set, using deterministic local test secret.");
}

if (!env.AUTH_TRUST_HOST) {
  env.AUTH_TRUST_HOST = "true";
}

const child = spawn(process.execPath, [nextCli, "dev", "--webpack", "-p", "3002"], {
  cwd: repoRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout?.pipe(process.stdout);
child.stderr?.pipe(process.stderr);

function terminateChild(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => terminateChild("SIGINT"));
process.on("SIGTERM", () => terminateChild("SIGTERM"));

child.on("error", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[e2e:webserver] failed to start dev server: ${message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
