import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { computeNextRunAt } from '@/lib/voice/campaign-scheduler';
import type { ScheduleType } from '@/lib/voice/campaign-scheduler';

interface Params { params: Promise<{ token: string }> }

async function getAgent(token: string, portalEmail: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, timezone')
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
  const agent = await getAgent(token, session.portalEmail);
  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('outbound_campaigns')
    .select('*')
    .eq('agent_id', agent.id)
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
  } = body;

  if (!nombre?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (!schedule_type) return NextResponse.json({ error: 'El tipo de programación es requerido' }, { status: 400 });
  if (!run_at_time)   return NextResponse.json({ error: 'La hora de ejecución es requerida' }, { status: 400 });

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
      status:         'active',
      next_run_at:    next?.toISOString() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
