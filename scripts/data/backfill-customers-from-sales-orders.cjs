/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    linkOrders: false,
    confirm: false,
    since: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (token === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (token === "--link-orders") {
      args.linkOrders = true;
    } else if (token === "--confirm") {
      args.confirm = true;
    } else if (token === "--since") {
      args.since = argv[++i] ?? null;
    } else if (token.startsWith("--since=")) {
      args.since = token.slice("--since=".length);
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else {
      throw new Error(`Argumento no soportado: ${token}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Backfill seguro de Customer desde SalesInternalOrder.customerName (histórico).",
    "",
    "Uso:",
    "  node scripts/data/backfill-customers-from-sales-orders.cjs --dry-run",
    "  node scripts/data/backfill-customers-from-sales-orders.cjs --apply --confirm",
    "  node scripts/data/backfill-customers-from-sales-orders.cjs --apply --link-orders --confirm",
    "  node scripts/data/backfill-customers-from-sales-orders.cjs --dry-run --since=2026-01-01",
    "",
    "Flags:",
    "  --dry-run      Modo análisis (default). No escribe en DB.",
    "  --apply        Aplica creación y/o vinculación.",
    "  --link-orders  Vincula customerId en pedidos sin customerId (requiere --apply).",
    "  --confirm      Confirmación explícita requerida cuando se usa --apply.",
    "  --since        Fecha mínima createdAt en formato YYYY-MM-DD.",
  ].join("\n");
}

function normalizeBase(input) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CORPORATE_SUFFIXES = [
  "sa de cv",
  "s de rl de cv",
  "s de rl",
  "sapi de cv",
  "sapi",
  "sa",
];

function stripCorporateSuffix(normalized) {
  let current = normalized;
  let updated = true;
  while (updated && current) {
    updated = false;
    for (const suffix of CORPORATE_SUFFIXES) {
      if (current === suffix) continue;
      if (current.endsWith(` ${suffix}`)) {
        current = current.slice(0, current.length - suffix.length).trim();
        updated = true;
      }
    }
  }
  return current;
}

function normalizeAlias(input) {
  const base = normalizeBase(input);
  if (!base) return "";
  return stripCorporateSuffix(base);
}

function parseSinceDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Valor inválido para --since. Usa formato YYYY-MM-DD.");
  }
  return parsed;
}

async function getNextCustomerCode(tx, now = new Date()) {
  const year = now.getUTCFullYear();
  const prefix = `CLI-${year}-`;
  const last = await tx.customer.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const seq = last?.code ? Number.parseInt(String(last.code).slice(prefix.length), 10) : 0;
  const next = Number.isFinite(seq) ? seq + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function nowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}`;
}

function createReportSkeleton(args, since) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: args.dryRun ? "dry-run" : "apply",
      linkOrders: Boolean(args.linkOrders),
      since: since ? since.toISOString() : null,
      rules: {
        matching: "exact normalized OR exact alias-normalized",
        aliasProfile: "corporativo básico",
        onAmbiguous: "no_create_no_link",
      },
    },
    summary: {
      ordersAnalyzed: 0,
      groupedNames: 0,
      emptyNamesSkipped: 0,
      matchedExisting: 0,
      createdCustomers: 0,
      linkedOrders: 0,
      ambiguousGroups: 0,
      skippedGroups: 0,
      errors: 0,
    },
    details: [],
    ambiguous: [],
    errors: [],
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es requerido.");
  }
  if (databaseUrl.startsWith("file:")) {
    throw new Error("Este script está diseñado para PostgreSQL/RDS. DATABASE_URL actual apunta a SQLite.");
  }
  if (args.linkOrders && !args.apply) {
    throw new Error("--link-orders requiere --apply.");
  }
  if (args.apply && !args.confirm) {
    throw new Error("Para ejecutar --apply debes confirmar explícitamente con --confirm.");
  }

  const sinceDate = parseSinceDate(args.since);
  const report = createReportSkeleton(args, sinceDate);
  const prisma = new PrismaClient();

  try {
    const where = {
      customerName: { not: null },
      ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
    };

    const [orders, existingCustomers] = await Promise.all([
      prisma.salesInternalOrder.findMany({
        where,
        select: {
          id: true,
          customerName: true,
          customerId: true,
          createdAt: true,
        },
      }),
      prisma.customer.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      }),
    ]);

    report.summary.ordersAnalyzed = orders.length;

    const customerById = new Map(existingCustomers.map((customer) => [customer.id, customer]));
    const customersByNormalized = new Map();
    const customersByAlias = new Map();

    for (const customer of existingCustomers) {
      const n = normalizeBase(customer.name);
      const a = normalizeAlias(customer.name);
      if (n) {
        const bucket = customersByNormalized.get(n) ?? [];
        bucket.push(customer);
        customersByNormalized.set(n, bucket);
      }
      if (a) {
        const bucket = customersByAlias.get(a) ?? [];
        bucket.push(customer);
        customersByAlias.set(a, bucket);
      }
    }

    const groups = new Map();
    for (const order of orders) {
      const raw = String(order.customerName ?? "").trim();
      if (!raw) {
        report.summary.emptyNamesSkipped += 1;
        continue;
      }
      const normalizedName = normalizeBase(raw);
      if (!normalizedName) {
        report.summary.emptyNamesSkipped += 1;
        continue;
      }

      const aliasNormalizedName = normalizeAlias(raw);
      const current = groups.get(normalizedName) ?? {
        normalizedName,
        aliasNormalizedName,
        rawNames: new Set(),
        orderIds: [],
        linkCandidateOrderIds: [],
        linkedCustomerIds: new Set(),
      };

      current.rawNames.add(raw);
      current.orderIds.push(order.id);
      if (!order.customerId) {
        current.linkCandidateOrderIds.push(order.id);
      } else {
        current.linkedCustomerIds.add(order.customerId);
      }

      groups.set(normalizedName, current);
    }

    report.summary.groupedNames = groups.size;

    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));

    for (const group of sortedGroups) {
      try {
        const candidatesMap = new Map();

        for (const customer of customersByNormalized.get(group.normalizedName) ?? []) {
          candidatesMap.set(customer.id, customer);
        }
        if (group.aliasNormalizedName) {
          for (const customer of customersByAlias.get(group.aliasNormalizedName) ?? []) {
            candidatesMap.set(customer.id, customer);
          }
        }
        for (const linkedCustomerId of group.linkedCustomerIds) {
          const linked = customerById.get(linkedCustomerId);
          if (linked) candidatesMap.set(linked.id, linked);
        }

        const candidates = Array.from(candidatesMap.values());
        const linkedCustomerIds = Array.from(group.linkedCustomerIds);
        const detail = {
          normalizedName: group.normalizedName,
          aliasNormalizedName: group.aliasNormalizedName,
          rawNames: Array.from(group.rawNames).sort((a, b) => a.localeCompare(b)),
          orderIds: [...group.orderIds],
          action: "skipped",
          customerId: null,
          customerCode: null,
          linkedOrderIds: [],
          reason: null,
          candidateCustomerIds: candidates.map((c) => c.id),
        };

        if (linkedCustomerIds.length > 1 || candidates.length > 1) {
          detail.action = "ambiguous";
          detail.reason = linkedCustomerIds.length > 1
            ? "multiple_linked_customers_in_orders"
            : "multiple_candidate_customers";
          report.summary.ambiguousGroups += 1;
          report.ambiguous.push({
            normalizedName: group.normalizedName,
            rawNames: detail.rawNames,
            orderIds: detail.orderIds,
            candidateCustomerIds: detail.candidateCustomerIds,
            reason: detail.reason,
          });
          report.details.push(detail);
          continue;
        }

        let resolvedCustomer = candidates[0] ?? null;
        if (resolvedCustomer) {
          detail.action = "matched_existing";
          detail.customerId = resolvedCustomer.id;
          detail.customerCode = resolvedCustomer.code;
          report.summary.matchedExisting += 1;
        } else if (args.apply) {
          resolvedCustomer = await prisma.$transaction(async (tx) => {
            for (let attempt = 0; attempt < 5; attempt += 1) {
              const code = await getNextCustomerCode(tx);
              try {
                return await tx.customer.create({
                  data: {
                    code,
                    name: detail.rawNames[0],
                    isActive: true,
                  },
                  select: { id: true, code: true, name: true, isActive: true },
                });
              } catch (error) {
                if (error && typeof error === "object" && error.code === "P2002") {
                  continue;
                }
                throw error;
              }
            }
            throw new Error(`No se pudo generar código para ${detail.rawNames[0]}`);
          });

          detail.action = "created";
          detail.customerId = resolvedCustomer.id;
          detail.customerCode = resolvedCustomer.code;
          report.summary.createdCustomers += 1;
          customerById.set(resolvedCustomer.id, resolvedCustomer);

          const n = normalizeBase(resolvedCustomer.name);
          const a = normalizeAlias(resolvedCustomer.name);
          if (n) {
            const bucket = customersByNormalized.get(n) ?? [];
            bucket.push(resolvedCustomer);
            customersByNormalized.set(n, bucket);
          }
          if (a) {
            const bucket = customersByAlias.get(a) ?? [];
            bucket.push(resolvedCustomer);
            customersByAlias.set(a, bucket);
          }
        } else {
          detail.action = "skipped";
          detail.reason = "dry_run_would_create_customer";
          report.summary.skippedGroups += 1;
          report.details.push(detail);
          continue;
        }

        if (args.apply && args.linkOrders && resolvedCustomer && group.linkCandidateOrderIds.length > 0) {
          const updated = await prisma.salesInternalOrder.updateMany({
            where: {
              id: { in: group.linkCandidateOrderIds },
              customerId: null,
            },
            data: {
              customerId: resolvedCustomer.id,
            },
          });
          detail.linkedOrderIds = group.linkCandidateOrderIds.slice(0, updated.count);
          report.summary.linkedOrders += updated.count;
        }

        report.details.push(detail);
      } catch (error) {
        report.summary.errors += 1;
        report.errors.push({
          normalizedName: group.normalizedName,
          error: error instanceof Error ? error.message : String(error),
          orderIds: group.orderIds,
        });
      }
    }

    const reportsDir = path.join(process.cwd(), "scripts", "reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `customer-backfill-${nowStamp()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    console.log("\n=== Customer Backfill Summary ===");
    console.log(`Mode: ${args.dryRun ? "dry-run" : "apply"}`);
    console.log(`Orders analyzed: ${report.summary.ordersAnalyzed}`);
    console.log(`Grouped names: ${report.summary.groupedNames}`);
    console.log(`Matched existing: ${report.summary.matchedExisting}`);
    console.log(`Created customers: ${report.summary.createdCustomers}`);
    console.log(`Linked orders: ${report.summary.linkedOrders}`);
    console.log(`Ambiguous groups: ${report.summary.ambiguousGroups}`);
    console.log(`Skipped groups: ${report.summary.skippedGroups}`);
    console.log(`Errors: ${report.summary.errors}`);
    console.log(`Report: ${reportPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(`[customer-backfill] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
