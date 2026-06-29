import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { WarehouseHomeContent } from '@/components/home/WarehouseHomeContent';
import { Suspense } from 'react';

export default async function WarehouseHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || !ctx.roles.includes('WAREHOUSE_OPERATOR')) {
    redirect('/forbidden');
  }

  // Fetch real warehouse data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [pendingPicking, todaysReceptions, activeAssemblies] = await Promise.all([
    // Pending picking count
    prisma.inventory.count({
      where: {
        reserved: { gt: 0 }
      }
    }),
    // Today's receptions
    prisma.inventoryMovement.count({
      where: {
        type: 'IN',
        createdAt: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
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