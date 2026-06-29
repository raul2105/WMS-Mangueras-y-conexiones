import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { SalesHomeContent } from '@/components/home/SalesHomeContent';
import { SalesHomeSkeleton } from '@/components/home/SalesHomeSkeleton';
import { Suspense } from 'react';

export default async function SalesHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || !ctx.roles.includes('SALES_EXECUTIVE')) {
    redirect('/forbidden');
  }

  // Get the user ID for filtering
  const user = await prisma.user.findUnique({
    where: { email: ctx.user?.email ?? '' },
    select: { id: true }
  });

  const userId = user?.id ?? '';

  const [pendingOrders, activeCustomers, recentOrdersData] = await Promise.all([
    prisma.salesInternalOrder.count({
      where: {
        status: 'CONFIRMADA',
        assignedToUserId: userId,
      },
    }),
    prisma.customer.count({
      where: { isActive: true },
    }),
    prisma.salesInternalOrder.findMany({
      where: {
        assignedToUserId: userId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        code: true,
        customerName: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);
  
  // Format recent orders for the component
  const recentOrders = recentOrdersData.map((order) => ({
    id: order.code,
    client: order.customerName ?? 'Cliente desconocido',
    status: order.status?.toLowerCase() ?? 'confirmada',
    total: 'N/D'
  }));

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Ventas</h1>
      <Suspense fallback={<SalesHomeSkeleton />}>
        <SalesHomeContent 
          pendingOrders={pendingOrders}
          activeCustomers={activeCustomers}
          recentOrders={recentOrders}
        />
      </Suspense>
    </div>
  );
}
