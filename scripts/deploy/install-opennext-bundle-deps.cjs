#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[token] = "true";
      continue;
    }

    args[token] = next;
    index += 1;
  }
  return args;
}

function copyBinSymlinks(tempInstallDir, outputDir) {
  const tempBinDir = path.join(tempInstallDir, "node_modules", ".bin");
  const outputBinDir = path.join(outputDir, "node_modules", ".bin");
  if (!fs.existsSync(tempBinDir)) {
    return;
  }

  fs.mkdirSync(outputBinDir, { recursive: true });
  for (const fileName of fs.readdirSync(tempBinDir)) {
    const symlinkPath = path.join(tempBinDir, fileName);
    const stat = fs.lstatSync(symlinkPath);
    if (!stat.isSymbolicLink()) {
      continue;
    }

    const linkTarget = fs.readlinkSync(symlinkPath);
    const realFilePath = path.resolve(tempBinDir, linkTarget);
    const outputFilePath = path.join(outputBinDir, fileName);
    if (fs.existsSync(outputFilePath)) {
      fs.unlinkSync(outputFilePath);
    }

    fs.copyFileSync(realFilePath, outputFilePath);
    fs.chmodSync(outputFilePath, 0o755);
  }
}

const args = parseArgs(process.argv.slice(2));
const outputDir = args["--output-dir"];
const packagesArg = args["--packages"];

if (!outputDir || !packagesArg) {
  console.error("Usage: node scripts/deploy/install-opennext-bundle-deps.cjs --output-dir <dir> --packages <pkg1,pkg2> [--os linux] [--arch arm64] [--target 18] [--libc glibc]");
  process.exit(1);
}

const packages = packagesArg
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

if (packages.length === 0) {
  console.error("No packages provided.");
  process.exit(1);
}

const normalizedName = path.basename(outputDir.replace(/[\\/]+/g, "/"));
const tempInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), `open-next-install-${normalizedName}-`));
const npmArgs = ["install"];

if (args["--os"]) {
  npmArgs.push(`--os=${args["--os"]}`);
}
if (args["--arch"]) {
  npmArgs.push(`--arch=${args["--arch"]}`);
}
if (args["--target"]) {
  npmArgs.push(`--target=${args["--target"]}`);
}
if (args["--libc"]) {
  npmArgs.push(`--libc=${args["--libc"]}`);
}

npmArgs.push(...packages);

try {
  fs.mkdirSync(outputDir, { recursive: true });

  const result = spawnSync("npm", npmArgs, {
    cwd: tempInstallDir,
    env: {
      ...process.env,
      SHARP_IGNORE_GLOBAL_LIBVIPS: "1",
    },
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  fs.cpSync(path.join(tempInstallDir, "node_modules"), path.join(outputDir, "node_modules"), {
    recursive: true,
    force: true,
    dereference: true,
  });
  copyBinSymlinks(tempInstallDir, outputDir);
} finally {
  fs.rmSync(tempInstallDir, { recursive: true, force: true });
}
