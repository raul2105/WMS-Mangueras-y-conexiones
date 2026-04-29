/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createCustomer,
  updateCustomer,
  searchCustomers,
  resolveCustomerSnapshot,
  CustomerServiceError,
} from "@/lib/customers/customer-service";

type AnyRecord = Record<string, any>;

function makePrismaMock(options: {
  findFirst?: (args: AnyRecord) => Promise<any>;
  findUnique?: (args: AnyRecord) => Promise<any>;
  findMany?: (args: AnyRecord) => Promise<any[]>;
  count?: (args: AnyRecord) => Promise<number>;
  create?: (args: AnyRecord) => Promise<any>;
  update?: (args: AnyRecord) => Promise<any>;
}) {
  const customer = {
    findFirst: options.findFirst ?? (async () => null),
    findUnique: options.findUnique ?? (async () => null),
    findMany: options.findMany ?? (async () => []),
    count: options.count ?? (async () => 0),
    create: options.create ?? (async () => null),
    update: options.update ?? (async () => null),
  };

  const tx = { customer };
  return {
    customer,
    $transaction: async <T>(callback: (txClient: AnyRecord) => Promise<T>) => callback(tx),
  } as unknown as PrismaClient;
}

function row(overrides: AnyRecord = {}) {
  const now = new Date("2026-04-21T00:00:00.000Z");
  return {
    id: "cust-1",
    code: "CLI-2026-0001",
    name: "Cliente Uno",
    legalName: null,
    businessName: null,
    taxId: null,
    email: null,
    phone: null,
    address: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("customer-service", () => {
  it("resolves snapshot from customer entity", () => {
    expect(resolveCustomerSnapshot({ id: "abc", name: "Cliente A" })).toEqual({
      customerId: "abc",
      customerName: "Cliente A",
    });
    expect(resolveCustomerSnapshot(null)).toEqual({
      customerId: null,
      customerName: null,
    });
  });

  it("creates customer with explicit code and normalized fields", async () => {
    const prisma = makePrismaMock({
      create: async (args) => row(args.data),
      findUnique: async () => null,
    });

    const created = await createCustomer(prisma, {
      code: " cli-2026-0099 ",
      name: "  Cliente Demo  ",
      email: " VENTAS@DEMO.COM ",
      taxId: " abc010101abc ",
    });

    expect(created.code).toBe("CLI-2026-0099");
    expect(created.name).toBe("Cliente Demo");
    expect(created.email).toBe("ventas@demo.com");
    expect(created.taxId).toBe("ABC010101ABC");
  });

  it("rejects empty customer name", async () => {
    const prisma = makePrismaMock({});
    await expect(createCustomer(prisma, { name: "   " })).rejects.toMatchObject({
      code: "CUSTOMER_NAME_REQUIRED",
    } satisfies Partial<CustomerServiceError>);
  });

  it("rejects duplicate taxId in create", async () => {
    const prisma = makePrismaMock({
      findFirst: async (args) => (args.where?.taxId ? row({ code: "CLI-2026-0002", name: "Duplicado" }) : null),
    });

    await expect(
      createCustomer(prisma, {
        name: "Cliente",
        taxId: "RFC123456",
      })
    ).rejects.toMatchObject({
      code: "DUPLICATE_CUSTOMER_TAX_ID",
    } satisfies Partial<CustomerServiceError>);
  });

  it("updates customer and preserves optional fields when omitted", async () => {
    const prisma = makePrismaMock({
      findUnique: async (args) => {
        if (args.where?.id === "cust-1") {
          return row({ taxId: "AAA010101AAA", email: "old@demo.com" });
        }
        if (args.where?.code) return null;
        return null;
      },
      update: async (args) => row(args.data),
    });

    const updated = await updateCustomer(prisma, {
      id: "cust-1",
      name: " Cliente Editado ",
    });

    expect(updated.name).toBe("Cliente Editado");
    expect(updated.taxId).toBe("AAA010101AAA");
    expect(updated.email).toBe("old@demo.com");
  });

  it("searches customers with pagination shape", async () => {
    const prisma = makePrismaMock({
      findMany: async () => [row({ id: "cust-1" }), row({ id: "cust-2", code: "CLI-2026-0002", name: "Cliente Dos" })],
      count: async () => 3,
    });

    const result = await searchCustomers(prisma, { query: "cli", isActive: true, page: 1, pageSize: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(true);
  });
});
