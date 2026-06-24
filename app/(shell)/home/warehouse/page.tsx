import { Suspense } from 'react';
import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import { WarehouseHomeContent } from '@/components/home/WarehouseHomeContent';
import { WarehouseHomeSkeleton } from '@/components/home/WarehouseHomeSkeleton';
import prisma from '@/lib/prisma';

export default async function WarehouseHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || !ctx.roles.includes('WAREHOUSE_OPERATOR')) {
    redirect('/forbidden');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  // Fetch real warehouse data using WarehouseHomeContent component
  const [pendingPicking, todaysReceptions, activeAssemblies] = await Promise.all([
    // Pending picking count - pick lists in active status
    prisma.pickList.count({
      where: {
        status: { in: ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'PARTIAL'] }
      }
    }),
    // Today's receptions
    prisma.inventoryMovement.count({
      where: {
        type: 'IN',
        createdAt: { gte: today, lt: todayEnd }
      }
    }),
    // Active assemblies (production orders in progress)
    prisma.productionOrder.count({
      where: {
        status: { in: ['ABIERTA', 'EN_PROCESO'] }
      }
    })
  ]);

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Almacén</h1>
      <Suspense fallback={<WarehouseHomeSkeleton />}>
        <WarehouseHomeContent 
          pendingPicking={pendingPicking}
          todaysReceptions={todaysReceptions}
          activeAssemblies={activeAssemblies}
        />
      </Suspense>
    </div>
  );
}