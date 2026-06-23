import { Suspense } from 'react';
import { ManagerHomeContent } from '@/components/home/ManagerHomeContent';
import { ManagerHomeSkeleton } from '@/components/home/ManagerHomeSkeleton';

export default function ManagerHomePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Gerencial</h1>
      <Suspense fallback={<ManagerHomeSkeleton />}>
        <ManagerHomeContent />
      </Suspense>
    </div>
  );
}