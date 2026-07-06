"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  Package,
  Users,
  Search,
  Box,
  Zap,
  ChevronRight,
  Clock,
  AlertTriangle,
  Truck,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

interface SalesHomeClientProps {
  stats: {
    captura: number;
    porAsignar: number;
    enSurtido: number;
    listoEntrega: number;
    entregado: number;
    activeCustomers: number;
  };
  recentOrders: Array<{
    code: string;
    customerName: string;
    status: string;
    dueDate: string;
    nextAction: string;
  }>;
}

function getStageBadgeVariant(variant: string) {
  switch (variant) {
    case "accent":
      return "accent";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "danger":
      return "danger";
    default:
      return "neutral";
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "entregado":
      return "success";
    case "cancelado":
      return "danger";
    case "captura":
      return "warning";
    case "por_asignar":
      return "warning";
    case "en_surtido":
      return "info";
    case "listo_entrega":
      return "success";
    default:
      return "neutral";
  }
}

export function SalesHomeClient({ stats, recentOrders }: SalesHomeClientProps) {
  // Quick actions
  const quickActions = [
    {
      label: "Buscar producto",
      href: "/catalog",
      icon: Search,
      description: "Catálogo comercial con filtros",
    },
    {
      label: "Ver disponibilidad",
      href: "/production/availability",
      icon: Box,
      description: "Disponibilidad comercial por almacén",
    },
    {
      label: "Revisar equivalencias",
      href: "/production/equivalences",
      icon: Zap,
      description: "Alternativas y sustitutos de producto",
    },
    {
      label: "Clientes",
      href: "/sales/customers",
      icon: Users,
      description: "Gestión de clientes y contactos",
    },
  ];

  // Work summary stages for sales
  const workStages = [
    {
      key: "captura",
      label: "En captura",
      count: stats.captura,
      description: "Pedidos en borrador con líneas abiertas",
      icon: Clock,
      variant: "accent" as const,
      href: "/production/requests?status=BORRADOR",
    },
    {
      key: "porAsignar",
      label: "Por asignar",
      count: stats.porAsignar,
      description: "Pedidos confirmados sin responsable",
      icon: AlertTriangle,
      variant: "warning" as const,
      href: "/production/requests?stage=por_asignar",
    },
    {
      key: "enSurtido",
      label: "En surtido",
      count: stats.enSurtido,
      description: "Asignados al almacén, surtido en proceso",
      icon: Package,
      variant: "success" as const,
      href: "/production/requests?stage=en_surtido",
    },
    {
      key: "listoEntrega",
      label: "Listos para entregar",
      count: stats.listoEntrega,
      description: "Surtido y ensambles completados",
      icon: Truck,
      variant: "success" as const,
      href: "/production/requests?stage=listo_entrega",
    },
    {
      key: "entregado",
      label: "Entregados",
      count: stats.entregado,
      description: "Pedidos entregados y cerrados",
      icon: CheckCircle,
      variant: "neutral" as const,
      href: "/production/requests?stage=entregado",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Ventas"
        description="Tu consola comercial: inicia, continúa y da seguimiento a pedidos de clientes."
        actions={
          <Link href="/production/requests/new">
            <Button className="gap-2">
              <Package size={18} />
              Nuevo pedido
            </Button>
          </Link>
        }
      />

      {/* Quick Actions */}
      <SectionCard title="Acciones rápidas" className="max-w-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" role="region" aria-label="Acciones rápidas comercial">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <action.icon size={20} className="text-gray-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{action.label}</p>
                      <p className="text-sm text-gray-500 truncate">{action.description}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </SectionCard>

      {/* Work Summary */}
      <SectionCard title="Mi trabajo activo">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {workStages.map((stage) => (
            <Link key={stage.key} href={stage.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <stage.icon size={20} className="text-gray-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900 truncate">{stage.label}</p>
                        <Badge variant={getStageBadgeVariant(stage.variant)} className="text-xs">
                          {stage.count}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-1">{stage.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </SectionCard>

      {/* Recent / Active Orders */}
      <SectionCard
        title="Pedidos recientes"
        actions={
          <Link href="/production/requests">
            <Button variant="ghost" size="sm">
              Ver todos <ChevronRight size={14} />
            </Button>
          </Link>
        }
      >
        {recentOrders.length > 0 ? (
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200">
                {recentOrders.map((order) => (
                  <Link
                    key={order.code}
                    href={`/production/requests/${order.code}`}
                    className="block hover:bg-gray-50 transition-colors"
                  >
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {order.code} · {order.customerName}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          <span>Entrega: {order.dueDate}</span>
                          <span>•</span>
                          <span>{order.nextAction}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <Badge variant={getStatusBadgeVariant(order.status)}>
                          {order.status}
                        </Badge>
                        <Badge variant={getStageBadgeVariant(order.status)}>
                          {order.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          // Empty state
          <Card className="border-dashed border-2 border-gray-200">
            <CardContent className="p-8 text-center">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay pedidos recientes</h3>
              <p className="text-gray-500 mb-4 max-w-md mx-auto">
                Comienza creando tu primer pedido comercial o busca productos en el catálogo.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/production/requests/new">
                  <Button className="gap-2">
                    <Package size={18} />
                    Nuevo pedido
                  </Button>
                </Link>
                <Link href="/catalog">
                  <Button variant="secondary" className="gap-2">
                    <Search size={18} />
                    Buscar producto
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </SectionCard>
    </div>
  );
}