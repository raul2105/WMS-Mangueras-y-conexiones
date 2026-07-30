import { Suspense } from "react";
import prisma from "@/lib/prisma";
import { getSalesOrderFlowStage } from "@/lib/sales/internal-orders";
import { SalesHomeClient } from "@/app/(shell)/sales/sales-home-client";

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

function getNextAction(flowStage: string): string {
  switch (flowStage) {
    case "captura":
      return "Completar captura";
    case "por_asignar":
      return "Asignar operador";
    case "en_surtido":
      return "Seguimiento surtido";
    case "preparar_entrega":
      return "Separar para entrega";
    case "listo_entrega":
      return "Coordinar entrega";
    case "entregado":
      return "Completado";
    default:
      return "Ver detalles";
  }
}

function SalesConsoleSkeleton() {
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

export async function SalesConsole({ email }: { email?: string | null }) {
  const user = await prisma.user.findUnique({
    where: { email: email ?? "" },
    select: { id: true },
  });
  const userId = user?.id ?? "";

  const orderSelection = {
    id: true,
    code: true,
    status: true,
    assignedToUserId: true,
    preparedForDeliveryAt: true,
    deliveredToCustomerAt: true,
    updatedAt: true,
    customerName: true,
    lines: { select: { id: true, lineKind: true } },
    pickLists: {
      select: { status: true },
      take: 1,
      orderBy: { updatedAt: "desc" as const },
    },
  };
  const visibleOrders = {
    OR: [{ requestedByUserId: userId }, { assignedToUserId: userId }],
  };
  const [orders, recentOrdersData, activeCustomers] = await Promise.all([
    prisma.salesInternalOrder.findMany({ where: visibleOrders, select: orderSelection }),
    prisma.salesInternalOrder.findMany({
      where: visibleOrders,
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: orderSelection,
    }),
    prisma.customer.count({ where: { isActive: true } }),
  ]);

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

  const stageCounts = {
    captura: 0,
    porAsignar: 0,
    enSurtido: 0,
    prepararEntrega: 0,
    listoEntrega: 0,
    entregado: 0,
  };
  for (const order of orders) {
    switch (getCanonicalSalesFlowStage(order, linkedAssembliesByOrderId.get(order.id) ?? [])) {
      case "captura": stageCounts.captura++; break;
      case "por_asignar": stageCounts.porAsignar++; break;
      case "en_surtido": stageCounts.enSurtido++; break;
      case "preparar_entrega": stageCounts.prepararEntrega++; break;
      case "listo_entrega": stageCounts.listoEntrega++; break;
      case "entregado": stageCounts.entregado++; break;
    }
  }

  const recentOrders = recentOrdersData.map((order) => {
    const status = getCanonicalSalesFlowStage(
      order,
      linkedAssembliesByOrderId.get(order.id) ?? [],
    );
    return {
      id: order.id,
      code: order.code,
      customerName: order.customerName ?? "Cliente desconocido",
      status,
      dueDate: order.updatedAt ? new Date(order.updatedAt).toLocaleDateString("es-ES") : "N/A",
      nextAction: getNextAction(status),
    };
  });

  return (
    <div className="container mx-auto px-4 py-6">
      <Suspense fallback={<SalesConsoleSkeleton />}>
        <SalesHomeClient stats={{ ...stageCounts, activeCustomers }} recentOrders={recentOrders} />
      </Suspense>
    </div>
  );
}
