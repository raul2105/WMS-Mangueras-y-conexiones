import { getSessionContext } from "@/lib/auth/session-context";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { SalesHomeClient } from "./sales-home-client";
import { Suspense } from "react";
import { getSalesOrderFlowStage } from "@/lib/sales/internal-orders";

export const dynamic = "force-dynamic";

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
      deliveredToCustomerAt: true,
      cancelledAt: true,
      updatedAt: true,
      customerName: true,
      lines: {
        select: { id: true },
        take: 1,
      },
      pickLists: {
        select: { status: true },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  // Count orders by canonical flow stage using shared helper
  let capturaOrders = 0;
  let porAsignarOrders = 0;
  let enSurtidoOrders = 0;
  let listoEntregaOrders = 0;
  let entregadoOrders = 0;

  for (const order of orders) {
    const hasProductLines = order.lines.length > 0;
    const hasAssemblyLines = false; // Assembly configs are on order lines, not directly on order
    const latestPickStatus = order.pickLists[0]?.status ?? null;
    const hasCompletedConfiguredAssembly = false; // Assembly completion tracked elsewhere

    const stage = getSalesOrderFlowStage({
      status: order.status,
      assignedToUserId: order.assignedToUserId,
      deliveredToCustomerAt: order.deliveredToCustomerAt,
      latestPickStatus,
      hasProductLines,
      hasAssemblyLines,
      hasCompletedConfiguredAssembly,
    });

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

  // Fetch recent orders for the "Recent Orders" section
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
      deliveredToCustomerAt: true,
      cancelledAt: true,
      updatedAt: true,
      lines: {
        select: { id: true },
        take: 1,
      },
      pickLists: {
        select: { status: true },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  const recentOrders = recentOrdersData.map((order) => {
    const hasProductLines = order.lines.length > 0;
    const hasAssemblyLines = false;
    const latestPickStatus = order.pickLists[0]?.status ?? null;
    const hasCompletedConfiguredAssembly = false;

    const flowStage = getSalesOrderFlowStage({
      status: order.status,
      assignedToUserId: order.assignedToUserId,
      deliveredToCustomerAt: order.deliveredToCustomerAt,
      latestPickStatus,
      hasProductLines,
      hasAssemblyLines,
      hasCompletedConfiguredAssembly,
    });
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
