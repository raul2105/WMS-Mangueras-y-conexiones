'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Users, DollarSign, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export function SalesHomeContent() {
  const stats = [
    { label: 'Pedidos Pendientes', value: '12', icon: Package, color: 'text-blue-600', href: '/orders?status=pending' },
    { label: 'Clientes Activos', value: '48', icon: Users, color: 'text-green-600', href: '/customers' },
    { label: 'Ventas Mes Actual', value: '$45,230', icon: DollarSign, color: 'text-purple-600', href: '/dashboard/sales' },
    { label: 'Cotizaciones Abiertas', value: '7', icon: TrendingUp, color: 'text-orange-600', href: '/quotes' },
  ];

  const priorityActions = [
    { label: 'Nuevo Pedido', href: '/orders/new', icon: Package, primary: true },
    { label: 'Seguimiento Pedidos', href: '/orders?status=processing', icon: Clock, primary: false },
    { label: 'Clientes por Contactar', href: '/customers?followup=true', icon: Users, primary: false },
    { label: 'Cotizaciones Vencidas', href: '/quotes?status=expired', icon: AlertCircle, primary: false },
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package size={20} />
              Pedidos Recientes
            </CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm">Ver todos</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { id: 'ORD-2024-001', client: 'Construcciones ABC', status: 'processing', total: '$12,450' },
              { id: 'ORD-2024-002', client: 'Mantenimiento Industrial', status: 'pending', total: '$8,900' },
              { id: 'ORD-2024-003', client: 'Minas del Norte', status: 'shipped', total: '$23,100' },
            ].map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{order.id} - {order.client}</p>
                  <p className="text-sm text-gray-500">{order.total}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}
                >
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