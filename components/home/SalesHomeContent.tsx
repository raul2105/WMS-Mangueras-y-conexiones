'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Users, TrendingUp, Clock } from 'lucide-react';
import Link from 'next/link';

interface SalesHomeContentProps {
  pendingOrders: number;
  activeCustomers: number;
  recentOrders?: Array<{ id: string; client: string; status: string; total: string }>;
}

export function SalesHomeContent({ 
  pendingOrders, 
  activeCustomers,
  recentOrders = []
}: SalesHomeContentProps) {
  const stats = [
    { label: 'Pedidos Pendientes', value: String(pendingOrders), icon: Package, color: 'bg-status-processing', href: '/sales/orders?status=pending', live: true },
    { label: 'Clientes Activos', value: String(activeCustomers), icon: Users, color: 'bg-status-available', href: '/sales/customers', live: true },
  ];

  const priorityActions = [
    { label: 'Nuevo Pedido', href: '/sales/orders/new', icon: Package, primary: true },
    { label: 'Seguimiento Pedidos', href: '/sales/orders?status=processing', icon: Clock, primary: false },
    { label: 'Clientes por Contactar', href: '/sales/customers', icon: Users, primary: false },
    { label: 'Equivalencias', href: '/sales/equivalences', icon: TrendingUp, primary: false },
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

      {/* Priority Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package size={20} />
            Acciones Prioritarias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {priorityActions.map((action) => (
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

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <Link href="/sales/orders" className="w-full">
            <CardTitle className="flex items-center gap-2">
              <Package size={20} />
              Pedidos Recientes
            </CardTitle>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(recentOrders && recentOrders.length > 0 ? recentOrders : []).map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{order.id} - {order.client}</p>
                  <p className="text-sm text-gray-500">{order.total}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                    order.status === 'processing' ? 'bg-status-processing text-white' :
                    order.status === 'pending' ? 'bg-status-pending text-white' :
                    order.status === 'shipped' ? 'bg-status-shipped text-white' :
                    'bg-gray-100 text-gray-700'
                  }`} >
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}