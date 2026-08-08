import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const NASH_PORTAL = 'hola@centinelia.mx';

async function findNash() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('voice_agents')
    .select('id, features')
    .eq('portal_email', NASH_PORTAL)
    .contains('features', { meerkat_role_id: 'nash' })
    .eq('active', true)
    .maybeSingle();
  return { supabase, nash: data, error };
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nash, error } = await findNash();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!nash) return NextResponse.json({ error: 'Nash agent not found' }, { status: 404 });

  const features = (nash.features as Record<string, unknown> | null) ?? {};
  return NextResponse.json({ enabled: features.nash_cron_enabled === true });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
  }

  const { supabase, nash, error } = await findNash();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!nash) return NextResponse.json({ error: 'Nash agent not found' }, { status: 404 });

  const features = { ...((nash.features as Record<string, unknown> | null) ?? {}), nash_cron_enabled: body.enabled };
  const { error: updateErr } = await supabase
    .from('voice_agents')
    .update({ features })
    .eq('id', nash.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ enabled: body.enabled });
}
