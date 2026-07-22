export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

async function resolveOrg(token: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  return { supabase, portalEmail: agent?.portal_email ?? null };
}

function currentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// GET — fetch this week's recommendations + current insight_mode
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? ''))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const weekStart = currentWeekStart();

  const [recsRes, orgRes] = await Promise.all([
    supabase
      .from('agent_recommendations')
      .select('id, agent_id, agent_name, agent_role, title, body, metric_key, current_value, priority, status, mode, created_at')
      .eq('org_id', portalEmail)
      .eq('week_start', weekStart)
      .neq('status', 'descartada')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('organizations')
      .select('insight_mode')
      .eq('portal_email', portalEmail)
      .single(),
  ]);

  return NextResponse.json({
    recs:   recsRes.data ?? [],
    mode:   (orgRes.data?.insight_mode ?? 'llm') as 'llm' | 'rules',
    weekStart,
  });
}

// PATCH — update insight_mode for this org
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? ''))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { mode?: string };
  if (!body.mode || !['llm', 'rules'].includes(body.mode))
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase
    .from('organizations')
    .upsert({ portal_email: portalEmail, insight_mode: body.mode }, { onConflict: 'portal_email' });

  return NextResponse.json({ ok: true });
}
