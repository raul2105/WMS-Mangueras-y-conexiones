'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Truck, Box, ScanLine } from 'lucide-react';
import Link from 'next/link';

export function WarehouseHomeContent() {
  const stats = [
    { label: 'Picking Pendiente', value: '23', icon: Package, color: 'text-blue-600', href: '/warehouse/picking?status=pending' },
    { label: 'Recepciones Hoy', value: '5', icon: Truck, color: 'text-green-600', href: '/warehouse/receiving?date=today' },
    { label: 'Ensambles Activos', value: '8', icon: Box, color: 'text-purple-600', href: '/warehouse/assembly?status=active' },
    { label: 'Envíos Preparados', value: '12', icon: ScanLine, color: 'text-orange-600', href: '/warehouse/shipping?status=ready' },
  ];

  const myTasks = [
    { id: 'PICK-001', type: 'Picking', order: 'ORD-2024-001', location: 'A-12-04', priority: 'high' },
    { id: 'PICK-002', type: 'Picking', order: 'ORD-2024-002', location: 'B-01-01', priority: 'medium' },
    { id: 'ASM-001', type: 'Ensamble', order: 'ORD-2024-003', location: 'ENS-01', priority: 'high' },
    { id: 'RCV-001', type: 'Recepción', order: 'PO-2024-001', location: 'RECV-01', priority: 'medium' },
  ];

  const priorityActions = [
    { label: 'Iniciar Picking', href: '/warehouse/picking/start', icon: Package, primary: true },
    { label: 'Registrar Recepción', href: '/warehouse/receiving/new', icon: Truck, primary: false },
    { label: 'Continuar Ensamble', href: '/warehouse/assembly/active', icon: Box, primary: false },
    { label: 'Preparar Envío', href: '/warehouse/shipping/prepare', icon: ScanLine, primary: false },
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

      {/* My Assigned Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package size={20} />
            Mis Tareas Asignadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {myTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${task.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {task.type === 'Picking' && <Package size={18} />}
                    {task.type === 'Ensamble' && <Box size={18} />}
                    {task.type === 'Recepción' && <Truck size={18} />}
                  </div>
                  <div>
                    <p className="font-medium">{task.id} - {task.type}</p>
                    <p className="text-sm text-gray-500">{task.order} · {task.location}</p>
                  </div>
                </div>
                <Button variant="primary" size="sm">Iniciar</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Priority Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck size={20} />
            Acciones Rápidas
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
    </div>
  );
}