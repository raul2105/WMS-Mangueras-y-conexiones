import { Suspense } from 'react';
import { WarehouseHomeContent } from '@/components/home/WarehouseHomeContent';
import { WarehouseHomeSkeleton } from '@/components/home/WarehouseHomeSkeleton';

export default function WarehouseHomePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Almacén</h1>
      <Suspense fallback={<WarehouseHomeSkeleton />}>
        <WarehouseHomeContent />
      </Suspense>
    </div>
  );
}