export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FlagEditor } from '@/components/admin/FlagEditor';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function NewFlagPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/admin/flags" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--c-text-2)' }}>
        <ArrowLeft size={14} /> Todos los flags
      </Link>
      <FlagEditor mode="create" />
    </div>
  );
}
