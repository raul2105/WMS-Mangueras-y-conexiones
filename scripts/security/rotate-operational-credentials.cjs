#!/usr/bin/env node
// Credentials arrive on stdin, never argv, logs or a plaintext file.
const fs = require("node:fs");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const identities = [
  { email: "admin@scmayher.com", role: "SYSTEM_ADMIN", oldPassword: "Admin123*" },
  { email: "admin2@scmayher.com", role: "SYSTEM_ADMIN", oldPassword: "Admin123*" },
  { email: "manager@scmayher.com", role: "MANAGER", oldPassword: "Manager123*" },
  { email: "operator@scmayher.com", role: "WAREHOUSE_OPERATOR", oldPassword: "Operator123*" },
  { email: "sales@scmayher.com", role: "SALES_EXECUTIVE", oldPassword: "Sales123*" },
];

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (database.hostname !== "wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com"
      || database.pathname !== "/wms" || database.searchParams.get("schema") !== "public"
      || process.env.WMS_CREDENTIAL_ROTATION_APPROVED !== "1") {
    throw new Error("Canonical database/authorization guard failed");
  }
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(input.runId) || input.credentials?.length !== identities.length) {
    throw new Error("Invalid rotation manifest");
  }
  const prepared = [];
  for (const identity of identities) {
    const credential = input.credentials.find(item => item.email === identity.email);
    if (!credential || typeof credential.password !== "string" || credential.password.length < 28) {
      throw new Error("Unique private credentials are required for every identity");
    }
    prepared.push({ ...identity, passwordHash: await bcrypt.hash(credential.password, 12) });
  }
  if (new Set(input.credentials.map(item => item.password)).size !== identities.length) {
    throw new Error("Credentials must be distinct");
  }
  const prisma = new PrismaClient();
  try {
    const proof = await prisma.$transaction(async tx => {
      const users = await tx.user.findMany({ where: { email: { in: identities.map(item => item.email) } },
        include: { userRoles: { include: { role: true } } } });
      if (users.length !== identities.length) throw new Error("Operational identity count changed");
      const administrator = users.find(user => user.email === identities[0].email);
      const events = [];
      for (const identity of prepared) {
        const user = users.find(item => item.email === identity.email);
        if (!user?.isActive || user.userRoles.length !== 1 || user.userRoles[0].role.code !== identity.role || !user.userRoles[0].role.isActive) {
          throw new Error("Operational identity or role changed; rotation aborted");
        }
        const changed = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash, isActive: true },
          data: { passwordHash: identity.passwordHash } });
        if (changed.count !== 1) throw new Error("Concurrent credential change; rotation aborted");
        await tx.auditLog.create({ data: {
          entityType: "USER", entityId: user.id, action: "RESET_PASSWORD", actor: administrator.name,
          actorUserId: administrator.id, source: "security/operational-credential-rotation",
          before: JSON.stringify({ email: user.email, credentialConfigured: true }),
          after: JSON.stringify({ email: user.email, passwordResetAt: new Date().toISOString(),
            reason: "Retirar contraseña pública del seed conservando identidad, roles y relaciones", runId: input.runId }),
        } });
        if (await bcrypt.compare(identity.oldPassword, identity.passwordHash)) throw new Error("Public credential still valid");
        events.push({ id: user.id, email: user.email, roles: [identity.role], isActive: user.isActive,
          identityPreserved: true, publicSeedPasswordAccepted: false });
      }
      return events;
    }, { timeout: 30000 });
    process.stdout.write(JSON.stringify({ runId: input.runId, rotated: proof.length, identities: proof }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => {
  // Prisma errors may contain connection details or query parameters.
  process.stderr.write(`Credential rotation failed (${error?.code ?? error?.name ?? "error"}); no credential details logged.\n`);
  process.exitCode = 1;
});
