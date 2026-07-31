export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';

const ADMIN_ACTOR = 'admin@centinelia.mx';

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

interface Params {
  params: Promise<{ key: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const body = (await req.json().catch(() => ({}))) as { unkill?: boolean };
  const targetKilled = !body.unkill;

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', key)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (before.killed === targetKilled) {
    return NextResponse.json({ flag: before, noop: true });
  }

  const { data: after, error } = await supabase
    .from('feature_flags')
    .update({ killed: targetKilled, updated_by: ADMIN_ACTOR, updated_at: new Date().toISOString() })
    .eq('flag_key', key)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({
    flag_key: key,
    actor: ADMIN_ACTOR,
    action: targetKilled ? 'killed' : 'unkilled',
    before,
    after,
  });
  invalidateFlagCache();
  return NextResponse.json({ flag: after });
}
