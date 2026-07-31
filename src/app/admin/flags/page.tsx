export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { FlagsTable } from '@/components/admin/FlagsTable';
import type { FlagRow } from '@/lib/feature-flags/types';

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

export default async function FlagsPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('feature_flags')
    .select('*')
    .order('flag_key');

  const flags = (data ?? []) as FlagRow[];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Feature flags</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Rollout gradual por organización. Precedencia: killed, denylist, allowlist, hash.
          </p>
        </div>
      </div>

      <FlagsTable initialFlags={flags} />
    </div>
  );
}
