'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Shield, Database, AlertTriangle, Settings } from 'lucide-react';
import Link from 'next/link';

interface AdminHomeContentProps {
  activeUsersCount: number;
  auditPendingCount: number;
  tracesRecentCount: number;
  recentAudits?: Array<{ id: string; action: string; actor: string | null; createdAt: Date | string; entityType?: string }>;
}

function formatTimeAgo(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'hace un momento';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours} h`;
  return `hace ${diffDays} d`;
}

export function AdminHomeContent({ 
  activeUsersCount, 
  auditPendingCount, 
  tracesRecentCount,
  recentAudits = []
}: AdminHomeContentProps) {
  const stats = [
    { label: 'Usuarios Activos', value: String(activeUsersCount), icon: Users, color: 'text-blue-600', href: '/users', live: true },
    { label: 'Auditoría Pendiente', value: String(auditPendingCount), icon: AlertTriangle, color: 'text-orange-600', href: '/audit?status=pending', live: true },
    { label: 'Rastros Recientes', value: String(tracesRecentCount), icon: Database, color: 'text-purple-600', href: '/trace', live: true },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 bg-gray-100 rounded-lg ${stat.color}`}>
                    <stat.icon size={24} />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Live</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Audit */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield size={20} className="text-purple-600" />
              Auditoría Reciente
            </CardTitle>
            <Link href="/audit" className="text-sm text-blue-600 hover:underline">Ver todos</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(recentAudits && recentAudits.length > 0 ? recentAudits : []).map((audit) => (
              <div key={audit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{audit.action}</p>
                  <p className="text-sm text-gray-500">
                    {audit.actor ?? 'Sistema'} · {formatTimeAgo(audit.createdAt)}
                  </p>
                </div>
                <span className="px-2 py-1 text-xs rounded-full text-gray-700 bg-gray-100">
                  {audit.entityType ?? 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings size={20} />
            Administración
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {
              [
                { label: 'Gestionar Usuarios', href: '/users', icon: Users },
                { label: 'Auditoría', href: '/audit', icon: Shield },
                { label: 'Rastros', href: '/trace', icon: Settings },
                { label: 'Etiquetas', href: '/labels', icon: Database },
              ].map((action) => (
                <Link key={action.label} href={action.href}>
                  <Button variant="secondary" className="w-full justify-start gap-2 h-auto py-3">
                    <action.icon size={18} />
                    <span>{action.label}</span>
                  </Button>
                </Link>
              ))
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}