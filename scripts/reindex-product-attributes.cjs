#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const target = path.join(__dirname, 'data', 'reindex-product-attributes.cjs');
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
