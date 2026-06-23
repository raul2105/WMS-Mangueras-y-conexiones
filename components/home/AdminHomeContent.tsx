'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Shield, Database, Activity, Settings, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export function AdminHomeContent() {
  const stats = [
    { label: 'Usuarios Activos', value: '24', icon: Users, color: 'text-blue-600', href: '/admin/users' },
    { label: 'Salud del Sistema', value: '99.9%', icon: Activity, color: 'text-green-600', href: '/admin/health' },
    { label: 'Auditoría Pendiente', value: '3', icon: AlertTriangle, color: 'text-orange-600', href: '/admin/audit?status=pending' },
    { label: 'Backups Recientes', value: '5', icon: Database, color: 'text-purple-600', href: '/admin/backups' },
  ];

  const systemHealth = [
    { name: 'Base de Datos', status: 'healthy', latency: '12ms' },
    { name: 'API Externa', status: 'healthy', latency: '45ms' },
    { name: 'Procesos Background', status: 'warning', latency: '2.3s' },
    { name: 'Almacenamiento', status: 'healthy', usage: '67%' },
  ];

  const recentAudit = [
    { id: 'AUD-001', action: 'Cambio permisos rol', user: 'admin@wms.com', time: '15 min', status: 'review' },
    { id: 'AUD-002', action: 'Eliminación usuario', user: 'manager@wms.com', time: '1 hora', status: 'approved' },
    { id: 'AUD-003', action: 'Configuración webhook', user: 'dev@wms.com', time: '3 horas', status: 'pending' },
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

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity size={20} className="text-green-600" />
            Salud del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {systemHealth.map((service) => (
              <div key={service.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${service.status === 'healthy' ? 'bg-green-100' : 'bg-yellow-100'}`}>
                    <CheckCircle size={16} className={service.status === 'healthy' ? 'text-green-700' : 'text-yellow-700'} />
                  </div>
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-sm text-gray-500">
                      {service.latency ? `Latencia: ${service.latency}` : `Uso: ${service.usage}`}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    service.status === 'healthy' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {service.status === 'healthy' ? 'Operativo' : 'Atención'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Audit */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield size={20} className="text-purple-600" />
              Auditoría Reciente
            </CardTitle>
            <Link href="/admin/audit">
              <Button variant="ghost" size="sm">Ver todos</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentAudit.map((audit) => (
              <div key={audit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{audit.action}</p>
                  <p className="text-sm text-gray-500">{audit.user} · {audit.time}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    audit.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    audit.status === 'review' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}
                >
                  {audit.status}
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
                { label: 'Gestionar Usuarios', href: '/admin/users', icon: Users },
                { label: 'Roles y Permisos', href: '/admin/roles', icon: Shield },
                { label: 'Configuración', href: '/admin/settings', icon: Settings },
                { label: 'Respaldos', href: '/admin/backups', icon: Database },
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