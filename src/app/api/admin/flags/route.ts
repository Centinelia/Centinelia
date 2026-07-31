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

const FLAG_KEY_RE = /^(meerkat|portal|tool|silent)\.[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('flag_key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    flag_key,
    description,
    rollout_pct = 0,
    allowlist = [],
    denylist = [],
    default_on = false,
  } = body as {
    flag_key?: string;
    description?: string;
    rollout_pct?: number;
    allowlist?: string[];
    denylist?: string[];
    default_on?: boolean;
  };

  if (!flag_key || typeof flag_key !== 'string' || !FLAG_KEY_RE.test(flag_key)) {
    return NextResponse.json({
      error: 'flag_key requerido con formato <scope>.<subject>[.<variant>] donde scope in (meerkat, portal, tool, silent)',
    }, { status: 400 });
  }
  if (!description || typeof description !== 'string') {
    return NextResponse.json({ error: 'description requerida' }, { status: 400 });
  }
  if (typeof rollout_pct !== 'number' || rollout_pct < 0 || rollout_pct > 100) {
    return NextResponse.json({ error: 'rollout_pct debe estar entre 0 y 100' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('feature_flags')
    .select('flag_key')
    .eq('flag_key', flag_key)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `flag_key ya existe: ${flag_key}` }, { status: 409 });
  }

  const row = {
    flag_key,
    description,
    rollout_pct,
    allowlist,
    denylist,
    default_on,
    killed:     false,
    updated_by: ADMIN_ACTOR,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from('feature_flags')
    .insert(row)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({
    flag_key,
    actor:  ADMIN_ACTOR,
    action: 'created',
    before: null,
    after:  inserted,
  });

  invalidateFlagCache();
  return NextResponse.json({ flag: inserted }, { status: 201 });
}
