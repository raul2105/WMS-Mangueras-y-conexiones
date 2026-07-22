import { getSessionContext } from "@/lib/auth/session-context";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { SalesHomeClient } from "./sales-home-client";
import { Suspense } from "react";
import { getSalesOrderFlowStage } from "@/lib/sales/internal-orders";

export const dynamic = "force-dynamic";

type SalesOrderForFlow = {
  status: Parameters<typeof getSalesOrderFlowStage>[0]["status"];
  assignedToUserId: string | null;
  deliveredToCustomerAt: Date | null;
  preparedForDeliveryAt: Date | null;
  lines: Array<{ id: string; lineKind: string }>;
  pickLists: Array<{ status: string }>;
};

type LinkedAssemblyOrder = {
  sourceDocumentId: string | null;
  sourceDocumentLineId: string | null;
  status: string;
};

function getCanonicalSalesFlowStage(
  order: SalesOrderForFlow,
  linkedAssemblyOrders: LinkedAssemblyOrder[],
) {
  const productLines = order.lines.filter((line) => line.lineKind === "PRODUCT");
  const assemblyLineIds = order.lines
    .filter((line) => line.lineKind === "CONFIGURED_ASSEMBLY")
    .map((line) => line.id);
  const assemblyLineIdSet = new Set(assemblyLineIds);
  const linkedForOrder = linkedAssemblyOrders.filter(
    (productionOrder) =>
      productionOrder.sourceDocumentLineId !== null &&
      assemblyLineIdSet.has(productionOrder.sourceDocumentLineId),
  );
  const hasCompletedConfiguredAssembly =
    assemblyLineIds.length === 0 ||
    (linkedForOrder.length === assemblyLineIds.length &&
      linkedForOrder.every((productionOrder) => productionOrder.status === "COMPLETADA"));

  return getSalesOrderFlowStage({
    status: order.status,
    assignedToUserId: order.assignedToUserId,
    deliveredToCustomerAt: order.deliveredToCustomerAt,
    preparedForDeliveryAt: order.preparedForDeliveryAt,
    latestPickStatus: order.pickLists[0]?.status ?? null,
    hasProductLines: productLines.length > 0,
    hasAssemblyLines: assemblyLineIds.length > 0,
    hasCompletedConfiguredAssembly,
  });
}

export default async function SalesPage() {
  const ctx = await getSessionContext();

  if (
    !ctx.isAuthenticated ||
    !(ctx.roles.includes("SALES_EXECUTIVE") ||
      ctx.roles.includes("MANAGER") ||
      ctx.roles.includes("SYSTEM_ADMIN"))
  ) {
    redirect("/forbidden");
  }

  // Get the user ID for filtering
  const user = await prisma.user.findUnique({
    where: { email: ctx.user?.email ?? "" },
    select: { id: true },
  });

  const userId = user?.id ?? "";

  // Fetch orders with all needed fields for canonical stage calculation
  const orders = await prisma.salesInternalOrder.findMany({
    where: {
      OR: [
        { requestedByUserId: userId },
        { assignedToUserId: userId },
      ],
    },
    select: {
      id: true,
      code: true,
      status: true,
      assignedToUserId: true,
      pulledAt: true,
      preparedForDeliveryAt: true,
      deliveredToCustomerAt: true,
      cancelledAt: true,
      updatedAt: true,
      customerName: true,
      lines: {
        select: { id: true, lineKind: true },
      },
      pickLists: {
        select: { status: true },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  const recentOrdersData = await prisma.salesInternalOrder.findMany({
    where: {
      OR: [
        { assignedToUserId: userId },
        { requestedByUserId: userId },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      code: true,
      customerName: true,
      status: true,
      assignedToUserId: true,
      pulledAt: true,
      preparedForDeliveryAt: true,
      deliveredToCustomerAt: true,
      cancelledAt: true,
      updatedAt: true,
      lines: {
        select: { id: true, lineKind: true },
      },
      pickLists: {
        select: { status: true },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  const orderIds = [...new Set([...orders, ...recentOrdersData].map((order) => order.id))];
  const linkedAssemblyOrders = orderIds.length
    ? await prisma.productionOrder.findMany({
        where: {
          sourceDocumentType: "SalesInternalOrder",
          sourceDocumentId: { in: orderIds },
        },
        select: {
          sourceDocumentId: true,
          sourceDocumentLineId: true,
          status: true,
        },
      })
    : [];

  const linkedAssembliesByOrderId = new Map<string, LinkedAssemblyOrder[]>();
  for (const productionOrder of linkedAssemblyOrders) {
    if (!productionOrder.sourceDocumentId) continue;
    const current = linkedAssembliesByOrderId.get(productionOrder.sourceDocumentId) ?? [];
    current.push(productionOrder);
    linkedAssembliesByOrderId.set(productionOrder.sourceDocumentId, current);
  }

  // Count orders by canonical flow stage using the same line and assembly facts as the execution flow.
  let capturaOrders = 0;
  let porAsignarOrders = 0;
  let enSurtidoOrders = 0;
  let listoEntregaOrders = 0;
  let entregadoOrders = 0;

  for (const order of orders) {
    const stage = getCanonicalSalesFlowStage(
      order,
      linkedAssembliesByOrderId.get(order.id) ?? [],
    );

    switch (stage) {
      case "captura":
        capturaOrders++;
        break;
      case "por_asignar":
        porAsignarOrders++;
        break;
      case "en_surtido":
        enSurtidoOrders++;
        break;
      case "listo_entrega":
        listoEntregaOrders++;
        break;
      case "entregado":
        entregadoOrders++;
        break;
    }
  }

  const activeCustomers = await prisma.customer.count({ where: { isActive: true } });

  const recentOrders = recentOrdersData.map((order) => {
    const flowStage = getCanonicalSalesFlowStage(
      order,
      linkedAssembliesByOrderId.get(order.id) ?? [],
    );
    return {
      id: order.id,
      code: order.code,
      customerName: order.customerName ?? "Cliente desconocido",
      status: flowStage,
      dueDate: order.updatedAt ? new Date(order.updatedAt).toLocaleDateString("es-ES") : "N/A",
      nextAction: getNextAction(flowStage),
    };
  });

  return (
    <div className="container mx-auto px-4 py-6">
      <Suspense fallback={<SalesHomeSkeleton />}>
        <SalesHomeClient
          stats={{
            captura: capturaOrders,
            porAsignar: porAsignarOrders,
            enSurtido: enSurtidoOrders,
            listoEntrega: listoEntregaOrders,
            entregado: entregadoOrders,
            activeCustomers,
          }}
          recentOrders={recentOrders}
        />
      </Suspense>
    </div>
  );
}

// Skeleton component for loading state
function SalesHomeSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 max-w-xs" />
      <div className="h-4 bg-gray-200 rounded w-1/2 max-w-md" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-48 bg-gray-200 rounded-lg" />
    </div>
  );
}

function getNextAction(flowStage: string): string {
  switch (flowStage) {
    case "captura":
      return "Completar captura";
    case "por_asignar":
      return "Asignar operador";
    case "en_surtido":
      return "Seguimiento surtido";
    case "listo_entrega":
      return "Coordinar entrega";
    case "entregado":
      return "Completado";
    default:
      return "Ver detalles";
  }
}
