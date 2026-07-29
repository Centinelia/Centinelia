import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import CommandChat from './CommandChat';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE = 'Centinelia_admin';

export default async function ComandoPage() {
  const c = await cookies();
  const admin = c.get(ADMIN_COOKIE)?.value;
  if (!admin || admin !== process.env.ADMIN_SECRET) {
    redirect('/admin/login?from=/admin/comando');
  }

  return <CommandChat />;
}
