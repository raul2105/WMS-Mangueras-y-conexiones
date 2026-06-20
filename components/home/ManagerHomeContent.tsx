'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, Users, TrendingUp, BarChart, Flag } from 'lucide-react';
import Link from 'next/link';

export function ManagerHomeContent() {
  const stats = [
    { label: 'Pedidos Atrasados', value: '8', icon: AlertCircle, color: 'text-red-600', href: '/orders?status=overdue=overdue' },
    { label: 'Trabajo Sin Asignar', value: '15', icon: Users, color: 'text-orange-600', href: '/warehouse/tasks?unassigned=true' },
    { label: 'Bloqueos Activos', value: '3', icon: Flag, color: 'text-purple-600', href: '/dashboard/blockers' },
    { label: 'Eficiencia Semanal', value: '87%', icon: TrendingUp, color: 'text-green-600', href: '/dashboard/efficiency' },
  ];

  const blockers = [
    { id: 'BLK-001', title: 'Falta stock CON-R1AT-04', area: 'Almacén', impact: '5 pedidos', severity: 'critical' },
    { id: 'BLK-002', title: 'Operador ausente turno mañana', area: 'Picking', impact: '3 tareas', severity: 'high' },
    { id: 'BLK-003', title: 'Calibración máquina ensamble', area: 'Producción', impact: '2 ensambles', severity: 'medium' },
  ];

  const unassignedWork = [
    { id: 'UNA-001', type: 'Picking', count: '6', oldest: '2 horas', href: '/warehouse/picking/unassigned' },
    { id: 'UNA-002', type: 'Recepción', count: '4', oldest: '4 horas', href: '/warehouse/receiving/unassigned' },
    { id: 'UNA-003', type: 'Ensamble', count: '3', oldest: '1 hora', href: '/warehouse/assembly/unassigned' },
    { id: 'UNA-004', type: 'Empaque', count: '2', oldest: '30 min', href: '/warehouse/packing/unassigned' },
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

      {/* Active Blockers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag size={20} className="text-red-600" />
            Bloqueos Activos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {blockers.map((blocker) => (
              <div key={blocker.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{blocker.title}</p>
                  <p className="text-sm text-gray-500">{blocker.area} · {blocker.impact}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    blocker.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    blocker.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {blocker.severity}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Unassigned Work */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users size={20} className="text-orange-600" />
              Trabajo Sin Asignar
            </CardTitle>
            <Link href="/warehouse/tasks?unassigned=true">
              <Button variant="ghost" size="sm">Ver todos</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {unassignedWork.map((work) => (
              <Link key={work.id} href={work.href} className="block">
                <div className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <p className="font-medium">{work.type}</p>
                  <p className="text-2xl font-bold text-orange-600">{work.count}</p>
                  <p className="text-xs text-gray-500">Más antiguo: {work.oldest}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart size={20} />
            Acciones de Gestión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {
              [
                { label: 'Reasignar Trabajo', href: '/warehouse/tasks/reassign', icon: Users },
                { label: 'Resolver Bloqueos', href: '/dashboard/blockers', icon: Flag },
                { label: 'Ver Reportes', href: '/reports', icon: BarChart },
                { label: 'Gestionar Turnos', href: '/admin/shifts', icon: Clock },
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