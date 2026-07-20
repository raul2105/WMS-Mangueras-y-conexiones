'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Box, Package, Truck } from 'lucide-react';
import Link from 'next/link';

interface WarehouseHomeContentProps {
  pendingPicking: number;
  inProgressPicking: number;
  verifyPicking: number;
  activeAssemblies: number;
}

export function WarehouseHomeContent({ 
  pendingPicking, 
  inProgressPicking,
  verifyPicking,
  activeAssemblies
}: WarehouseHomeContentProps) {
  const workBuckets = [
    { label: 'Verificar', value: verifyPicking, icon: AlertTriangle, href: '/production/requests?queue=partial', description: 'Revisa surtidos parciales antes de continuar.' },
    { label: 'En proceso', value: inProgressPicking, icon: Truck, href: '/production/requests?stage=en_surtido', description: 'Continúa el surtido que ya está abierto.' },
    { label: 'Por surtir', value: pendingPicking, icon: Package, href: '/production/requests?queue=unreleased', description: 'Empieza pedidos que esperan material.' },
    { label: 'Ensambles pendientes', value: activeAssemblies, icon: Box, href: '/production/requests?queue=assembly_blocked', description: 'Completa ensambles ligados a un pedido.' },
  ];
  const nextWork = workBuckets.find((bucket) => bucket.value > 0) ?? null;

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle>{nextWork ? 'Siguiente trabajo' : 'No hay trabajo pendiente'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {nextWork ? (
            <div className="flex items-center gap-3">
              <nextWork.icon className="h-7 w-7 text-blue-700" aria-hidden="true" />
              <div>
                <p className="font-semibold text-gray-900">{nextWork.label}: {nextWork.value}</p>
                <p className="text-sm text-gray-600">{nextWork.description}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">Cuando haya una tarea confirmada aparecerá aquí.</p>
          )}
          {nextWork ? <Link href={nextWork.href}><Button>Ver trabajo</Button></Link> : null}
        </CardContent>
      </Card>

      <section aria-labelledby="work-buckets-title">
        <h2 id="work-buckets-title" className="mb-3 text-base font-semibold text-gray-900">Trabajo pendiente</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {workBuckets.map((bucket) => (
            <Link key={bucket.label} href={bucket.href} className="block">
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <bucket.icon className="mb-3 h-5 w-5 text-gray-600" aria-hidden="true" />
                  <p className="text-sm text-gray-600">{bucket.label}</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{bucket.value}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck size={20} />
            Otras actividades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Recibir mercancía', href: '/purchasing/orders?preset=por_recibir', icon: Truck, primary: true },
              { label: 'Ver todo el trabajo', href: '/production/requests', icon: Package, primary: false },
              { label: 'Consultar materiales', href: '/catalog', icon: Box, primary: false },
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
