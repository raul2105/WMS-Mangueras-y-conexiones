import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as PrismaClient | null, context: null as AsyncLocalStorage<string> | null, barrier: null as (() => Promise<void>) | null }));
vi.mock("@/lib/rbac", () => ({ requirePermission: async () => ({ user: { id: state.context!.getStore(), name: "QA Administrator" } }) }));
vi.mock("@/lib/auth/session-context", () => ({ getSessionContext: async () => ({ user: { id: state.context!.getStore() } }) }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, {
  get(_target, property) {
    if (property === "$transaction") return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: Prisma.TransactionIsolationLevel }) => state.client!.$transaction(async (tx) => {
      const wrapped = new Proxy(tx, {
        get(target, key) {
          if (key === "user") return new Proxy(target.user, {
            get(delegate, method) {
              if (method === "count") return async (args: Prisma.UserCountArgs) => {
                const result = await delegate.count(args);
                if (state.barrier) await state.barrier();
                return result;
              };
              const value = Reflect.get(delegate, method);
              return typeof value === "function" ? value.bind(delegate) : value;
            },
          });
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return callback(wrapped);
    }, { ...options, timeout: 15000 });
    const value = Reflect.get(state.client!, property);
    return typeof value === "function" ? value.bind(state.client) : value;
  },
}) }));

import { updateUser } from "@/lib/users/admin-service";

const run = process.env.RUN_POSTGRES_TESTS === "1" ? describe : describe.skip;
run("last active administrator concurrency (AWS PostgreSQL)", () => {
  const prisma = new PrismaClient();
  const tag = randomUUID();
  const users: { id: string; email: string; name: string }[] = [];
  let roleId = "";
  beforeAll(async () => {
    state.client = prisma;
    state.context = new AsyncLocalStorage<string>();
    const role = await prisma.role.create({ data: { code: "SYSTEM_ADMIN", name: "Admin" } });
    roleId = role.id;
    for (const suffix of ["a", "b"]) users.push(await prisma.user.create({ data: {
      email: `${tag}-${suffix}@example.invalid`, name: `Admin ${suffix}`, passwordHash: "unused-hash",
      userRoles: { create: { roleId } },
    } }));
  });
  afterAll(async () => {
    state.barrier = null;
    await prisma.auditLog.deleteMany({ where: { entityId: { in: users.map(user => user.id) } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });
  it("two administrators cannot concurrently deactivate each other and remove all access", async () => {
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    state.barrier = async () => { if (++arrived === 2) release(); await gate; };
    const results = await Promise.allSettled(users.map((actor, index) => {
      const target = users[1 - index];
      return state.context!.run(actor.id, () => updateUser(target.id, { name: target.name, email: target.email, roleIds: [roleId], isActive: false }));
    }));
    state.barrier = null;
    expect(arrived).toBe(2);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.user.count({ where: { isActive: true, userRoles: { some: { roleId } } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "UPDATE", entityType: "USER" } })).toBe(1);
  });
});
