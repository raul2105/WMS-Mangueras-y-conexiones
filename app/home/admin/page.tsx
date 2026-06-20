import { Suspense } from 'react';
import { AdminHomeContent } from '@/components/home/AdminHomeContent';
import { AdminHomeSkeleton } from '@/components/home/AdminHomeSkeleton';

export default function AdminHomePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inicio Administración</h1>
      <Suspense fallback={<AdminHomeSkeleton />}>
        <AdminHomeContent />
      </Suspense>
    </div>
  );
}