import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function ShellHomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  // Redirect to role-specific home
  const role = session.user.role || 'SALES_EXECUTIVE';
  
  const roleHomeMap: Record<string, string> = {
    'SALES_EXECUTIVE': '/home/sales',
    'WAREHOUSE_OPERATOR': '/home/warehouse',
    'MANAGER': '/home/manager',
    'SYSTEM_ADMIN': '/home/admin',
  };

  const homePath = roleHomeMap[role] || '/dashboard';
  redirect(homePath);
}