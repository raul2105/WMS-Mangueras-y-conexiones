import { getSessionContext } from '@/lib/auth/session-context';
import { redirect } from 'next/navigation';
import { SalesConsole } from '@/components/home/SalesConsole';

export default async function SalesHomePage() {
  const ctx = await getSessionContext();
  
  if (!ctx.isAuthenticated || !ctx.roles.includes('SALES_EXECUTIVE')) {
    redirect('/forbidden');
  }

  return <SalesConsole email={ctx.user?.email} />;
}
