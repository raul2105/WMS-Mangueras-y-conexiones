import { Suspense } from 'react';
import { SalesHomeContent } from '@/components/home/SalesHomeContent';
import { SalesHomeSkeleton } from '@/components/home/SalesHomeSkeleton';

export default function SalesHomePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Comercial</h1>
      <Suspense fallback={<SalesHomeSkeleton />}>
        <SalesHomeContent />
      </Suspense>
    </div>
  );
}