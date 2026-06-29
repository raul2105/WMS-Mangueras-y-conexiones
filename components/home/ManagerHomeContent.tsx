'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Users, Flag } from 'lucide-react';
import Link from 'next/link';

interface ManagerHomeContentProps {
  overdueOrders: number;
  activeBlockers: number;
}

export function ManagerHomeContent({ 
  overdueOrders, 
  activeBlockers
}: ManagerHomeContentProps) {
  const stats = [
    { label: 'Pedidos Atrasados', value: String(overdueOrders), icon: AlertCircle, color: 'text-red-600', href: '/production/requests?queue=overdue', live: true },
    { label: 'Bloqueos Activos', value: String(activeBlockers), icon: Flag, color: 'text-purple-600', href: '/production/requests?queue=assembly_blocked', live: true },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {stats.map((stat => <Link key={stat.label} href={stat.href} className="block">
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

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={20} />
            Acciones de Gestión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Reasignar Trabajo', href: '/warehouse?reassign=true', icon: Users },
              { label: 'Resolver Bloqueos', href: '/production/requests?queue=assembly_blocked', icon: Flag },
              { label: 'Ver Reportes', href: '/audit', icon: Flag },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <Button variant="secondary" className="w-full justify-start gap-2 h-auto py-3">
                  <action.icon size={18} />
                  <span>{action.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
