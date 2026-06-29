import { Suspense } from 'react';
import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import { AdminHomeContent } from '@/components/home/AdminHomeContent';
import { AdminHomeSkeleton } from '@/components/home/AdminHomeSkeleton';
import { listUsers } from '@/lib/users/admin-service';
import prisma from '@/lib/prisma';

export default async function AdminHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || !ctx.roles.includes('SYSTEM_ADMIN')) {
    redirect('/forbidden');
  }

  // Fetch real data
  const [usersResult, traceCount, auditPendingCountResult, recentAudits] = await Promise.all([
    listUsers({ isActive: "active", pageSize: 1 }),
    prisma.traceRecord.count(),
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, action: true, actor: true, createdAt: true, entityType: true, entityId: true }
    }),
  ]);

  const activeUsersCount = usersResult.total;
  const tracesRecentCount = traceCount;
  const auditTotalCount = auditPendingCountResult;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Administración</h1>
      <Suspense fallback={<AdminHomeSkeleton />}>
        <AdminHomeContent 
          activeUsersCount={activeUsersCount}
          auditTotalCount={auditTotalCount}
          tracesRecentCount={tracesRecentCount}
          recentAudits={recentAudits}
        />
      </Suspense>
    </div>
  );
}