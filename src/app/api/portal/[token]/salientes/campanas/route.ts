import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { computeNextRunAt } from '@/lib/voice/campaign-scheduler';
import type { ScheduleType } from '@/lib/voice/campaign-scheduler';
import { canRunOutboundCampaign } from '@/lib/portal/outbound-gate';

interface Params { params: Promise<{ token: string }> }

async function getAgent(token: string, portalEmail: string) {
  const data = await getPrimaryAgentFromToken<{ id: string; timezone: string | null; outbound_calls: boolean | null; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, timezone, outbound_calls, features, portal_email');
  if (!data || data.portal_email !== portalEmail) return null;
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
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json();
  const {
    agent_id,
    nombre, instrucciones, motivo,
    schedule_type, run_at_time, run_on_days, run_at_date,
    contact_filter,
    tag_filter,
    contact_ids,
    capability,
  } = body;

  // Sanitiza contact_ids: array de uuids no vacíos, dedupe, cap 500
  const cleanContactIds = Array.isArray(contact_ids)
    ? Array.from(new Set(
        (contact_ids as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      )).slice(0, 500)
    : [];

  // Resuelve empleado asignado: viene del body (multi-agent) o fallback al
  // agente primario del portal (retrocompat con clientes viejos).
  const supabaseA = createAdminClient();
  const chosenAgentId =
    typeof agent_id === 'string' && access.ids.includes(agent_id)
      ? agent_id
      : null;
  const fallback = chosenAgentId
    ? null
    : await getAgent(token, session.portalEmail);
  if (!chosenAgentId && !fallback) {
    return NextResponse.json({ error: 'No se pudo determinar el empleado que ejecutará la campaña.' }, { status: 400 });
  }
  const agent = chosenAgentId
    ? (await supabaseA.from('voice_agents')
        .select('id, timezone, outbound_calls, features')
        .eq('id', chosenAgentId)
        .single()).data
    : fallback;
  if (!agent) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

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

  const { data, error } = await supabaseA
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
      contact_ids:    cleanContactIds,
      capability:     cap,
      status:         'active',
      next_run_at:    next?.toISOString() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Event-driven: si next_run_at ya venció al momento de crear, dispara YA.
  // Campañas futuras las agarra el cron horario.
  if (next && next <= new Date()) {
    const { triggerOutboundCampaigns } = await import('@/lib/outbound/campaigns-trigger');
    triggerOutboundCampaigns(`portal campaign create ${data?.id}`, session.portalEmail);
  }

  return NextResponse.json(data);
}
