import { Prisma, type PrismaClient } from "@prisma/client";
import { createAuditLogSafeWithDb } from "@/lib/audit-log";

type TxClient = Prisma.TransactionClient;
type DbClient = PrismaClient | TxClient;

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  businessName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerDelegate = {
  findFirst: (args: unknown) => Promise<CustomerRow | null>;
  findUnique: (args: unknown) => Promise<CustomerRow | null>;
  findMany: (args: unknown) => Promise<CustomerRow[]>;
  count: (args: unknown) => Promise<number>;
  create: (args: unknown) => Promise<CustomerRow>;
  update: (args: unknown) => Promise<CustomerRow>;
};

type CustomerDb = DbClient & {
  customer: CustomerDelegate;
};

const CUSTOMER_CODE_PREFIX = "CLI";
const CUSTOMER_CODE_PATTERN = /^[A-Z0-9-]+$/;
const MAX_CODE_GENERATION_ATTEMPTS = 5;

export class CustomerServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CustomerServiceError";
  }
}

export type CreateCustomerInput = {
  code?: string | null;
  name: string;
  legalName?: string | null;
  businessName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
  actor?: string | null;
  actorUserId?: string | null;
  source?: string | null;
};

export type UpdateCustomerInput = {
  id: string;
  code?: string | null;
  name?: string | null;
  legalName?: string | null;
  businessName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
  actor?: string | null;
  actorUserId?: string | null;
  source?: string | null;
};

export type SearchCustomersOptions = {
  query?: string;
  name?: string;
  taxId?: string;
  isActive?: boolean | "all";
  page?: number;
  pageSize?: number;
};

export type CustomerListItem = {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  updatedAt: Date;
};

export type CustomerDetail = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  businessName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerSearchResult = {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type CustomerSnapshot = {
  customerId: string | null;
  customerName: string | null;
};

type SnapshotCustomer = {
  id?: string | null;
  name?: string | null;
};

function getCustomerModel(db: DbClient) {
  return (db as unknown as CustomerDb).customer;
}

function normalizeRequiredName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new CustomerServiceError("CUSTOMER_NAME_REQUIRED", "El nombre del cliente es obligatorio");
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (!CUSTOMER_CODE_PATTERN.test(normalized)) {
    throw new CustomerServiceError("INVALID_CUSTOMER_CODE", "Código inválido (solo mayúsculas, números y guiones)");
  }
  return normalized;
}

function normalizeTaxId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function toCustomerListItem(row: CustomerRow): CustomerListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  };
}

function toCustomerDetail(row: CustomerRow): CustomerDetail {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    legalName: row.legalName,
    businessName: row.businessName,
    taxId: row.taxId,
    email: row.email,
    phone: row.phone,
    address: row.address,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function uniqueConstraintTarget(error: Prisma.PrismaClientKnownRequestError) {
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.map((entry) => String(entry));
  if (typeof target === "string") return [target];
  return [];
}

function isUniqueViolationFor(error: unknown, field: string) {
  if (!isUniqueConstraintError(error)) return false;
  const targets = uniqueConstraintTarget(error as Prisma.PrismaClientKnownRequestError);
  return targets.some((target) => target.includes(field));
}

async function getNextCustomerCode(db: DbClient, now = new Date()) {
  const customer = getCustomerModel(db);
  const year = now.getFullYear();
  const prefix = `${CUSTOMER_CODE_PREFIX}-${year}-`;
  const last = await customer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });

  const lastCode = last?.code ?? "";
  const lastSequence = lastCode ? Number.parseInt(lastCode.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

async function assertTaxIdAvailable(db: DbClient, taxId: string, excludingCustomerId?: string) {
  const customer = getCustomerModel(db);
  const duplicated = await customer.findFirst({
    where: {
      taxId,
      ...(excludingCustomerId ? { id: { not: excludingCustomerId } } : {}),
    },
    select: { id: true, code: true, name: true },
  });

  if (duplicated) {
    throw new CustomerServiceError(
      "DUPLICATE_CUSTOMER_TAX_ID",
      `Ya existe un cliente con ese RFC/NIF (${duplicated.code} - ${duplicated.name})`
    );
  }
}

export async function createCustomer(prisma: PrismaClient, input: CreateCustomerInput) {
  const name = normalizeRequiredName(input.name);
  const explicitCode = normalizeCode(input.code);
  const taxId = normalizeTaxId(input.taxId);
  const email = normalizeEmail(input.email);
  const legalName = normalizeOptionalText(input.legalName);
  const businessName = normalizeOptionalText(input.businessName);
  const phone = normalizeOptionalText(input.phone);
  const address = normalizeOptionalText(input.address);
  const isActive = input.isActive ?? true;

  return prisma.$transaction(async (tx) => {
    if (taxId) {
      await assertTaxIdAvailable(tx, taxId);
    }

    const customer = getCustomerModel(tx);

    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const code = explicitCode ?? (await getNextCustomerCode(tx));

      const existingByCode = await customer.findUnique({
        where: { code },
        select: { id: true },
      });
      if (existingByCode) {
        if (explicitCode) {
          throw new CustomerServiceError("DUPLICATE_CUSTOMER_CODE", `Ya existe un cliente con código ${code}`);
        }
        continue;
      }

      try {
        const created = await customer.create({
          data: {
            code,
            name,
            legalName,
            businessName,
            taxId,
            email,
            phone,
            address,
            isActive,
          },
          select: {
            id: true,
            code: true,
            name: true,
            legalName: true,
            businessName: true,
            taxId: true,
            email: true,
            phone: true,
            address: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await createAuditLogSafeWithDb(
          {
            entityType: "CUSTOMER",
            entityId: created.id,
            action: "CREATE",
            actor: input.actor ?? null,
            actorUserId: input.actorUserId ?? null,
            source: input.source ?? "customers/customer-service",
            after: {
              code: created.code,
              name: created.name,
              taxId: created.taxId,
              isActive: created.isActive,
            },
          },
          tx
        );

        return toCustomerDetail(created);
      } catch (error) {
        if (isUniqueViolationFor(error, "code")) {
          if (explicitCode) {
            throw new CustomerServiceError("DUPLICATE_CUSTOMER_CODE", `Ya existe un cliente con código ${code}`);
          }
          continue;
        }
        if (isUniqueViolationFor(error, "taxId")) {
          throw new CustomerServiceError("DUPLICATE_CUSTOMER_TAX_ID", "Ya existe un cliente con ese RFC/NIF");
        }
        throw error;
      }
    }

    throw new CustomerServiceError("CUSTOMER_CODE_GENERATION_FAILED", "No se pudo generar un código único de cliente");
  });
}

export async function updateCustomer(prisma: PrismaClient, input: UpdateCustomerInput) {
  const customerId = String(input.id ?? "").trim();
  if (!customerId) {
    throw new CustomerServiceError("CUSTOMER_ID_REQUIRED", "El id del cliente es obligatorio");
  }

  return prisma.$transaction(async (tx) => {
    const customer = getCustomerModel(tx);
    const existing = await customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        businessName: true,
        taxId: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");
    }

    const nextCode = input.code === undefined ? existing.code : normalizeCode(input.code);
    if (!nextCode) {
      throw new CustomerServiceError("CUSTOMER_CODE_REQUIRED", "El código del cliente es obligatorio");
    }

    const nextName = input.name === undefined ? existing.name : normalizeRequiredName(input.name);
    const nextTaxId = input.taxId === undefined ? existing.taxId : normalizeTaxId(input.taxId);
    const nextEmail = input.email === undefined ? existing.email : normalizeEmail(input.email);
    const nextLegalName = input.legalName === undefined ? existing.legalName : normalizeOptionalText(input.legalName);
    const nextBusinessName = input.businessName === undefined ? existing.businessName : normalizeOptionalText(input.businessName);
    const nextPhone = input.phone === undefined ? existing.phone : normalizeOptionalText(input.phone);
    const nextAddress = input.address === undefined ? existing.address : normalizeOptionalText(input.address);
    const nextIsActive = input.isActive ?? existing.isActive;

    if (nextTaxId) {
      await assertTaxIdAvailable(tx, nextTaxId, existing.id);
    }

    if (nextCode !== existing.code) {
      const duplicatedCode = await customer.findUnique({
        where: { code: nextCode },
        select: { id: true },
      });
      if (duplicatedCode) {
        throw new CustomerServiceError("DUPLICATE_CUSTOMER_CODE", `Ya existe un cliente con código ${nextCode}`);
      }
    }

    try {
      const updated = await customer.update({
        where: { id: existing.id },
        data: {
          code: nextCode,
          name: nextName,
          legalName: nextLegalName,
          businessName: nextBusinessName,
          taxId: nextTaxId,
          email: nextEmail,
          phone: nextPhone,
          address: nextAddress,
          isActive: nextIsActive,
        },
        select: {
          id: true,
          code: true,
          name: true,
          legalName: true,
          businessName: true,
          taxId: true,
          email: true,
          phone: true,
          address: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await createAuditLogSafeWithDb(
        {
          entityType: "CUSTOMER",
          entityId: updated.id,
          action: "UPDATE",
          actor: input.actor ?? null,
          actorUserId: input.actorUserId ?? null,
          source: input.source ?? "customers/customer-service",
          before: {
            code: existing.code,
            name: existing.name,
            taxId: existing.taxId,
            isActive: existing.isActive,
          },
          after: {
            code: updated.code,
            name: updated.name,
            taxId: updated.taxId,
            isActive: updated.isActive,
          },
        },
        tx
      );

      return toCustomerDetail(updated);
    } catch (error) {
      if (isUniqueViolationFor(error, "code")) {
        throw new CustomerServiceError("DUPLICATE_CUSTOMER_CODE", `Ya existe un cliente con código ${nextCode}`);
      }
      if (isUniqueViolationFor(error, "taxId")) {
        throw new CustomerServiceError("DUPLICATE_CUSTOMER_TAX_ID", "Ya existe un cliente con ese RFC/NIF");
      }
      throw error;
    }
  });
}

function buildSearchWhere(options: SearchCustomersOptions) {
  const name = String(options.name ?? "").trim();
  const taxId = String(options.taxId ?? "").trim();
  const query = String(options.query ?? "").trim();
  const andFilters: Array<Record<string, unknown>> = [];

  if (options.isActive === true || options.isActive === false) {
    andFilters.push({ isActive: options.isActive });
  }

  if (name.length > 0) {
    andFilters.push({
      name: {
        contains: name,
        mode: "insensitive",
      },
    });
  }

  if (taxId.length > 0) {
    andFilters.push({
      taxId: {
        contains: taxId,
        mode: "insensitive",
      },
    });
  }

  if (query.length > 0) {
    andFilters.push({
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { legalName: { contains: query, mode: "insensitive" } },
        { businessName: { contains: query, mode: "insensitive" } },
        { taxId: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  if (andFilters.length === 0) return {};
  if (andFilters.length === 1) return andFilters[0];
  return { AND: andFilters };
}

export async function searchCustomers(prisma: DbClient, options: SearchCustomersOptions = {}): Promise<CustomerSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 20, 100));
  const where = buildSearchWhere(options);
  const customer = getCustomerModel(prisma);

  const [rows, total] = await Promise.all([
    customer.findMany({
      where,
      orderBy: [{ name: "asc" }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        businessName: true,
        taxId: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    customer.count({ where }),
  ]);

  return {
    items: rows.map(toCustomerListItem),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getCustomerById(prisma: DbClient, id: string): Promise<CustomerDetail> {
  const customerId = String(id ?? "").trim();
  if (!customerId) {
    throw new CustomerServiceError("CUSTOMER_ID_REQUIRED", "El id del cliente es obligatorio");
  }

  const customer = getCustomerModel(prisma);
  const row = await customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      code: true,
      name: true,
      legalName: true,
      businessName: true,
      taxId: true,
      email: true,
      phone: true,
      address: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) {
    throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "Cliente no encontrado");
  }

  return toCustomerDetail(row);
}

export function resolveCustomerSnapshot(customer: SnapshotCustomer | null | undefined): CustomerSnapshot {
  const customerId = customer?.id?.trim() ? customer.id.trim() : null;
  const customerName = customer?.name?.trim() ? customer.name.trim() : null;
  return { customerId, customerName };
}
