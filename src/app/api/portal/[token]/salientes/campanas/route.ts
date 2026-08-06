import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { computeNextRunAt } from '@/lib/voice/campaign-scheduler';
import type { ScheduleType } from '@/lib/voice/campaign-scheduler';
import { canRunOutboundCampaign } from '@/lib/portal/outbound-gate';

interface Params { params: Promise<{ token: string }> }

async function getAgent(token: string, portalEmail: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, timezone, outbound_calls, features')
    .eq('portal_token', token)
    .eq('portal_email', portalEmail)
    .single();
  return data;
}

export async function GET(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from('outbound_campaigns')
    .select('*')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const agent = await getAgent(token, session.portalEmail);
  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json();
  const {
    nombre, instrucciones, motivo,
    schedule_type, run_at_time, run_on_days, run_at_date,
    contact_filter,
    tag_filter,
    capability,
  } = body;

  // Sanitiza tag_filter: array de strings, trim + lowercase + dedup, cap 10
  const cleanTagFilter = Array.isArray(tag_filter)
    ? Array.from(new Set(
        (tag_filter as unknown[])
          .filter((t): t is string => typeof t === 'string')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0 && t.length <= 40)
      )).slice(0, 10)
    : [];

  if (!nombre?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (!schedule_type) return NextResponse.json({ error: 'El tipo de programación es requerido' }, { status: 400 });
  if (!run_at_time)   return NextResponse.json({ error: 'La hora de ejecución es requerida' }, { status: 400 });

  // Enforce capability gate por rol de meerkat.
  // 'custom' es escape: pasa si el empleado tiene outbound_calls activo.
  const cap = typeof capability === 'string' && capability.trim() ? capability.trim() : 'custom';
  const gate = canRunOutboundCampaign(agent as any, cap);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason ?? 'Campaña no permitida' }, { status: 403 });
  }

  const tz = agent.timezone ?? 'America/Monterrey';
  const next = computeNextRunAt(tz, run_at_time, schedule_type as ScheduleType, run_on_days ?? []);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('outbound_campaigns')
    .insert({
      agent_id:       agent.id,
      nombre:         nombre.trim(),
      instrucciones:  instrucciones?.trim() || null,
      motivo:         motivo?.trim()        || null,
      schedule_type,
      run_at_time,
      run_on_days:    run_on_days  ?? [],
      run_at_date:    run_at_date  ?? null,
      contact_filter: contact_filter ?? null,
      tag_filter:     cleanTagFilter,
      capability:     cap,
      status:         'active',
      next_run_at:    next?.toISOString() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
