import { Suspense } from 'react';
import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import { ManagerHomeContent } from '@/components/home/ManagerHomeContent';
import { ManagerHomeSkeleton } from '@/components/home/ManagerHomeSkeleton';
import { getFulfillmentDashboardSnapshot } from '@/lib/dashboard/fulfillment-dashboard';
import prisma from '@/lib/prisma';

export default async function ManagerHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || (!ctx.roles.includes('MANAGER') && !ctx.roles.includes('SYSTEM_ADMIN'))) {
    redirect('/forbidden');
  }

  // Fetch real data from fulfillment dashboard
  const [fulfillmentSnapshot, purchaseDrafts, purchaseAttention] = await Promise.all([
    getFulfillmentDashboardSnapshot({ role: "MANAGER", staleHours: 4 }),
    prisma.purchaseOrder.count({ where: { status: 'BORRADOR' } }),
    prisma.purchaseOrder.count({ where: { status: 'PARCIAL' } }),
  ]);

  const overdueOrders = fulfillmentSnapshot.kpis?.overdue ?? 0;
  const alerts = fulfillmentSnapshot.alerts ?? [];
  
  // Calculate blockers from alerts with high/critical severity
  const activeBlockers = alerts.filter(a => a.severity === 'danger' || a.severity === 'warning').length;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Gerencial</h1>
      <Suspense fallback={<ManagerHomeSkeleton />}>
        <ManagerHomeContent 
          overdueOrders={overdueOrders}
          activeBlockers={activeBlockers}
          purchaseDrafts={purchaseDrafts}
          purchaseAttention={purchaseAttention}
        />
      </Suspense>
    </div>
  );
}
