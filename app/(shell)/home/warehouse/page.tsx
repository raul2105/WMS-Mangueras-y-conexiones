import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { WarehouseHomeContent } from '@/components/home/WarehouseHomeContent';
import { Suspense } from 'react';
import { buildSalesRequestVisibilityWhere } from '@/lib/sales/visibility';

export default async function WarehouseHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || !ctx.roles.includes('WAREHOUSE_OPERATOR')) {
    redirect('/forbidden');
  }

  // These cards deliberately use the same confirmed, non-delivered order scope
  // as the execution cockpit. Inventory reservations alone are not operator work.
  const visibleWhere = buildSalesRequestVisibilityWhere({
    roles: ctx.roles,
    userId: ctx.user?.id ?? null,
  });
  const executionOrders = await prisma.salesInternalOrder.findMany({
    where: visibleWhere,
    select: {
      id: true,
      lines: { select: { lineKind: true } },
      pickLists: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { status: true },
      },
    },
  });
  const assemblyOrderIds = executionOrders
    .filter((order) => order.lines.some((line) => line.lineKind === 'CONFIGURED_ASSEMBLY'))
    .map((order) => order.id);
  const openAssemblyRows = assemblyOrderIds.length > 0
    ? await prisma.productionOrder.findMany({
        where: {
          sourceDocumentType: 'SalesInternalOrder',
          sourceDocumentId: { in: assemblyOrderIds },
          status: { in: ['BORRADOR', 'ABIERTA', 'EN_PROCESO'] },
        },
        select: { sourceDocumentId: true },
      })
    : [];
  const pendingPicking = executionOrders.filter((order) => {
    const hasDirectProduct = order.lines.some((line) => line.lineKind === 'PRODUCT');
    const status = order.pickLists[0]?.status;
    return hasDirectProduct && (!status || status === 'DRAFT');
  }).length;
  const inProgressPicking = executionOrders.filter(
    (order) => order.pickLists[0]?.status === 'IN_PROGRESS',
  ).length;
  const verifyPicking = executionOrders.filter(
    (order) => order.pickLists[0]?.status === 'PARTIAL',
  ).length;
  const activeAssemblies = new Set(
    openAssemblyRows.map((row) => row.sourceDocumentId).filter(Boolean),
  ).size;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Trabajo de hoy</h1>
      <Suspense fallback={<WarehouseHomeSkeleton />}>
        <WarehouseHomeContent 
          pendingPicking={pendingPicking}
          inProgressPicking={inProgressPicking}
          verifyPicking={verifyPicking}
          activeAssemblies={activeAssemblies}
        />
      </Suspense>
    </div>
  );
}

// Simple skeleton component
function WarehouseHomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-6 bg-white rounded-lg shadow-sm border border-gray-200 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
