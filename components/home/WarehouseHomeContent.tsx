'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Truck, Box } from 'lucide-react';
import Link from 'next/link';

interface WarehouseHomeContentProps {
  pendingPicking: number;
  todaysReceptions: number;
  activeAssemblies: number;
}

export function WarehouseHomeContent({ 
  pendingPicking, 
  todaysReceptions, 
  activeAssemblies
}: WarehouseHomeContentProps) {
  const stats = [
    { label: 'Picking Pendiente', value: String(pendingPicking), icon: Package, color: 'text-blue-600', href: '/inventory/pick?status=pending', live: true },
    { label: 'Recepciones Hoy', value: String(todaysReceptions), icon: Truck, color: 'text-green-600', href: '/inventory/receive?date=today', live: true },
    { label: 'Ensambles Activos', value: String(activeAssemblies), icon: Box, color: 'text-purple-600', href: '/production?ops=assembly_open', live: true },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="block">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 bg-gray-100 rounded-lg ${stat.color}`}>
                    <stat.icon size={24} />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {stat.live ? (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Live</span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">Demo</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Priority Actions - use existing routes only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck size={20} />
            Acciones Rápidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Ver Picking', href: '/inventory/pick?status=pending', icon: Package, primary: true },
              { label: 'Ver Recepciones', href: '/inventory/receive?date=today', icon: Truck, primary: false },
              { label: 'Ver Ensambles', href: '/production?ops=assembly_open', icon: Box, primary: false },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <Button
                  variant={action.primary ? 'primary' : 'secondary'}
                  className="w-full justify-start gap-2 h-auto py-3"
                >
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