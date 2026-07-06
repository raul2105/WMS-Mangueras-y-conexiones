import { getSessionContext } from "@/lib/auth/session-context";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { SalesHomeClient } from "./sales-home-client";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  // Compute date threshold using a stable reference
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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

  // Fetch orders grouped by flow stage for the sales user
  const [
    capturaOrders,
    porAsignarOrders,
    enSurtidoOrders,
    listoEntregaOrders,
    entregadoOrders,
    activeCustomers,
  ] = await Promise.all([
    prisma.salesInternalOrder.count({
      where: {
        status: "CONFIRMADA",
        assignedToUserId: null,
        updatedAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.salesInternalOrder.count({
      where: {
        status: "CONFIRMADA",
        assignedToUserId: userId,
        pulledAt: null,
        deliveredToCustomerAt: null,
      },
    }),
    prisma.salesInternalOrder.count({
      where: {
        status: "CONFIRMADA",
        assignedToUserId: userId,
        pulledAt: { not: null },
        deliveredToCustomerAt: null,
      },
    }),
    prisma.salesInternalOrder.count({
      where: {
        status: "CONFIRMADA",
        assignedToUserId: userId,
        deliveredToCustomerAt: { not: null },
        updatedAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.salesInternalOrder.count({
      where: {
        status: "CONFIRMADA",
        assignedToUserId: userId,
        deliveredToCustomerAt: { not: null },
        updatedAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.customer.count({ where: { isActive: true } }),
  ]);

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
      assignedAt: true,
      pulledAt: true,
      deliveredToCustomerAt: true,
      updatedAt: true,
    },
  });

  const recentOrders = recentOrdersData.map((order) => {
    const flowStage = computeFlowStage(order);
    return {
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

function computeFlowStage(order: {
  status: string;
  assignedAt: Date | null;
  pulledAt: Date | null;
  deliveredToCustomerAt: Date | null;
  cancelledAt?: Date | null;
}): string {
  if (order.status === "BORRADOR") return "captura";
  if (order.status === "CANCELADA") return "cancelado";
  if (order.deliveredToCustomerAt) return "entregado";
  if (order.pulledAt) return "en_surtido";
  if (order.assignedAt) return "por_asignar";
  return "captura";
}
