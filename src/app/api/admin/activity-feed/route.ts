import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE = 'Centinelia_admin';

export interface ActivityEvent {
  id:      string;
  ts:      string;
  kind:    'call' | 'email' | 'lead' | 'appointment' | 'order' | 'task' | 'learning';
  actor:   string;    // business_name o "sistema"
  message: string;
  agentId?: string;
  status?:  string;
}

/**
 * Agrega los eventos más recientes desde múltiples tablas y los devuelve
 * ordenados por timestamp descendente. La UI del cockpit poll-ea esto cada
 * 15s para el feed en vivo.
 */
export async function GET(req: NextRequest) {
  const admin = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!admin || admin !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const LIMIT_PER_TABLE = 12;

  const [
    { data: calls },
    { data: inbox },
    { data: leads },
    { data: appts },
    { data: orders },
    { data: tasks },
    { data: agents },
  ] = await Promise.all([
    supabase.from('voice_calls')
      .select('id, agent_id, created_at, outcome, duration_seconds, summary')
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase.from('ops_inbox')
      .select('id, agent_id, created_at, email_from, email_subject, category, status')
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase.from('leads_voice')
      .select('id, agent_id, created_at, nombre, servicio')
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase.from('appointments_voice')
      .select('id, agent_id, created_at, cliente_nombre, servicio, fecha, hora')
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase.from('orders_voice')
      .select('id, agent_id, created_at, nombre, total')
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase.from('agent_tasks')
      .select('id, assigned_to, created_at, title, status')
      .in('status', ['pending', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_TABLE),
    supabase.from('voice_agents').select('id, business_name'),
  ]);

  const nameOf = new Map((agents ?? []).map((a: { id: string; business_name: string }) => [a.id, a.business_name]));

  const events: ActivityEvent[] = [];

  for (const c of calls ?? []) {
    const outcome = (c.outcome as string) ?? 'desconocido';
    const secs    = c.duration_seconds ?? 0;
    const summary = (c.summary as string | null)?.trim().slice(0, 90);
    events.push({
      id:      `call_${c.id}`,
      ts:      c.created_at,
      kind:    'call',
      actor:   nameOf.get(c.agent_id) ?? 'agente',
      message: summary ?? `Llamada · ${outcome} · ${Math.round(secs)}s`,
      agentId: c.agent_id,
      status:  outcome,
    });
  }

  for (const i of inbox ?? []) {
    events.push({
      id:      `inbox_${i.id}`,
      ts:      i.created_at,
      kind:    'email',
      actor:   nameOf.get(i.agent_id) ?? 'agente',
      message: `${i.category ?? 'otro'} · ${i.status} · de ${i.email_from}: ${(i.email_subject ?? '(sin asunto)').slice(0, 60)}`,
      agentId: i.agent_id,
      status:  i.status,
    });
  }

  for (const l of leads ?? []) {
    events.push({
      id:      `lead_${l.id}`,
      ts:      l.created_at,
      kind:    'lead',
      actor:   nameOf.get(l.agent_id) ?? 'agente',
      message: `Lead: ${l.nombre ?? '(sin nombre)'} · ${l.servicio ?? '—'}`,
      agentId: l.agent_id,
    });
  }

  for (const a of appts ?? []) {
    events.push({
      id:      `appt_${a.id}`,
      ts:      a.created_at,
      kind:    'appointment',
      actor:   nameOf.get(a.agent_id) ?? 'agente',
      message: `Cita: ${a.cliente_nombre ?? '—'} · ${a.servicio ?? '—'} · ${a.fecha ?? ''} ${a.hora ?? ''}`,
      agentId: a.agent_id,
    });
  }

  for (const o of orders ?? []) {
    events.push({
      id:      `order_${o.id}`,
      ts:      o.created_at,
      kind:    'order',
      actor:   nameOf.get(o.agent_id) ?? 'agente',
      message: `Pedido: ${o.nombre ?? '—'} · $${o.total ?? 0}`,
      agentId: o.agent_id,
    });
  }

  for (const t of tasks ?? []) {
    events.push({
      id:      `task_${t.id}`,
      ts:      t.created_at,
      kind:    'task',
      actor:   nameOf.get(t.assigned_to as string) ?? 'agente',
      message: `Tarea (${t.status}): ${t.title}`,
      agentId: t.assigned_to as string,
      status:  t.status,
    });
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts));

  return NextResponse.json({ ok: true, events: events.slice(0, 25) });
}
