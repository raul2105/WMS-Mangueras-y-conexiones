#!/usr/bin/env node

require("dotenv/config");

const net = require("node:net");

function assertPostgresEnv(options = {}) {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es requerido para pruebas PostgreSQL.");
  }

  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("DATABASE_URL debe iniciar con postgres:// o postgresql://.");
  }

  const parsed = new URL(databaseUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || "5432");
  if (!host) {
    throw new Error("DATABASE_URL inválido: host vacío.");
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("DATABASE_URL inválido: puerto incorrecto.");
  }

  if (!options.checkConnection) {
    return { databaseUrl, host, port };
  }

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeoutMs = options.timeoutMs ?? 5000;
    let settled = false;

    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(resolve, { databaseUrl, host, port }));
    socket.once("timeout", () => done(reject, new Error(`Sin respuesta TCP de ${host}:${port} en ${timeoutMs}ms.`)));
    socket.once("error", (error) => done(reject, new Error(`No se pudo conectar a ${host}:${port}: ${error.message}`)));
    socket.connect(port, host);
  });
}

async function main() {
  try {
    const checkConnection = process.argv.includes("--check-connection");
    await assertPostgresEnv({ checkConnection });
    const mode = checkConnection ? "conectividad OK" : "env OK";
    console.log(`[assert-postgres-env] ${mode}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(`[assert-postgres-env] ${message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { assertPostgresEnv };
