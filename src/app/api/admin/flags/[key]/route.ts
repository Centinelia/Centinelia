export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';
import { computeAt100Transition } from '@/lib/feature-flags/auto-promote';
import type { FlagRow } from '@/lib/feature-flags/types';

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

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const supabase = createAdminClient();

  const { data: flag } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', key)
    .maybeSingle();
  if (!flag) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: audit } = await supabase
    .from('feature_flag_audit')
    .select('*')
    .eq('flag_key', key)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ flag, audit: audit ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<FlagRow>;
  const supabase = createAdminClient();

  const { data: before } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', key)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Solo permitimos editar estos campos por PATCH. flag_key es inmutable.
  // killed se maneja por endpoint dedicado /kill para claridad de audit.
  const nextPct    = (typeof body.rollout_pct === 'number' && body.rollout_pct >= 0 && body.rollout_pct <= 100)
    ? body.rollout_pct
    : before.rollout_pct;
  const nextKilled = before.killed; // PATCH no toca killed

  const patch: Partial<FlagRow> = {
    updated_by:   ADMIN_ACTOR,
    updated_at:   new Date().toISOString(),
    at_100_since: computeAt100Transition({
      before: { rollout_pct: before.rollout_pct, killed: before.killed, at_100_since: before.at_100_since },
      after_pct: nextPct,
      after_killed: nextKilled,
    }),
  };
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.rollout_pct === 'number' && body.rollout_pct >= 0 && body.rollout_pct <= 100) {
    patch.rollout_pct = body.rollout_pct;
  }
  if (Array.isArray(body.allowlist)) patch.allowlist = body.allowlist.map(String);
  if (Array.isArray(body.denylist)) patch.denylist = body.denylist.map(String);
  if (typeof body.default_on === 'boolean') patch.default_on = body.default_on;

  const { data: after, error } = await supabase
    .from('feature_flags')
    .update(patch)
    .eq('flag_key', key)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({ flag_key: key, actor: ADMIN_ACTOR, action: 'updated', before, after });
  invalidateFlagCache();
  return NextResponse.json({ flag: after });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const supabase = createAdminClient();

  const { data: before } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', key)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await supabase.from('feature_flags').delete().eq('flag_key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({ flag_key: key, actor: ADMIN_ACTOR, action: 'deleted', before, after: null });
  invalidateFlagCache();
  return NextResponse.json({ ok: true });
}
