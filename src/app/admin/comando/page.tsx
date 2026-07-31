import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import CommandChat from './CommandChat';

export const dynamic = 'force-dynamic';


export default async function ComandoPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/comando');
  }

  return <CommandChat />;
}
