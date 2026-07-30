import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

export type EventType =
  | 'llamada' | 'lead' | 'cita' | 'pedido'
  | 'ticket'  | 'incidente' | 'reporte' | 'encuesta'
  | 'delegacion' | 'correo';

export interface ActivityEvent {
  id:         string;
  type:       EventType;
  title:      string;
  subtitle:   string;
  agent_name: string;
  created_at: string;
  meta:       Record<string, unknown>;
}

const OUTCOME_LABEL: Record<string, string> = {
  lead_created:       'Lead capturado',
  appointment_booked: 'Cita agendada',
  order_taken:        'Pedido tomado',
  transferred:        'Transferida',
  info_provided:      'Informativa',
  unanswered:         'Sin respuesta',
  missed:             'Perdida',
  other:              'Completada',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const sp    = req.nextUrl.searchParams;
  const days  = Math.min(parseInt(sp.get('days') ?? '7'), 90);
  const type  = sp.get('type') ?? 'all';
  const limit = Math.min(parseInt(sp.get('limit') ?? '60'), 200);

  const cutoff  = new Date(Date.now() - days * 86400_000).toISOString();
  const ids     = access.ids;
  const supabase = createAdminClient();

  // Agent name lookup
  const { data: agentRows } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role')
    .in('id', ids);
  const agentMap: Record<string, string> = {};
  for (const a of agentRows ?? []) {
    agentMap[a.id] = (a.agent_name?.trim() || a.role || 'Agente');
  }
  const agentLabel = (id: string) => agentMap[id] ?? 'Agente';

  const wantAll  = type === 'all';
  const want     = (t: EventType) => wantAll || type === t;

  const events: ActivityEvent[] = [];

  await Promise.all([
    // ── Llamadas ──────────────────────────────────────────────────────────
    want('llamada') && (async () => {
      const { data } = await supabase
        .from('voice_calls')
        .select('id, agent_id, outcome, summary, caller_number, created_at, duration_seconds')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        const dur  = r.duration_seconds ? `${Math.round((r.duration_seconds as number) / 60)}m` : null;
        events.push({
          id:         `llamada-${r.id}`,
          type:       'llamada',
          title:      OUTCOME_LABEL[r.outcome as string] ?? 'Llamada',
          subtitle:   (r.summary as string | null)?.slice(0, 120) ?? (r.caller_number as string | null) ?? '',
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { outcome: r.outcome, caller_number: r.caller_number, duration: dur },
        });
      }
    })(),

    // ── Leads ─────────────────────────────────────────────────────────────
    want('lead') && (async () => {
      const { data } = await supabase
        .from('leads_voice')
        .select('id, agent_id, nombre, servicio, negocio, created_at')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        events.push({
          id:         `lead-${r.id}`,
          type:       'lead',
          title:      (r.nombre as string | null) ?? 'Lead sin nombre',
          subtitle:   [r.servicio, r.negocio].filter(Boolean).join(' · ') || 'Sin detalle',
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { nombre: r.nombre, servicio: r.servicio, negocio: r.negocio },
        });
      }
    })(),

    // ── Citas ─────────────────────────────────────────────────────────────
    want('cita') && (async () => {
      const { data } = await supabase
        .from('appointments_voice')
        .select('id, agent_id, nombre, servicio, fecha, hora, created_at')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        const when = [r.fecha, r.hora].filter(Boolean).join(' ');
        events.push({
          id:         `cita-${r.id}`,
          type:       'cita',
          title:      (r.nombre as string | null) ?? 'Cita agendada',
          subtitle:   [r.servicio, when].filter(Boolean).join(' · ') || 'Sin detalle',
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { fecha: r.fecha, hora: r.hora, servicio: r.servicio },
        });
      }
    })(),

    // ── Pedidos ───────────────────────────────────────────────────────────
    want('pedido') && (async () => {
      const { data } = await supabase
        .from('orders_voice')
        .select('id, agent_id, nombre, items, tipo_entrega, created_at')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        events.push({
          id:         `pedido-${r.id}`,
          type:       'pedido',
          title:      (r.nombre as string | null) ?? 'Pedido',
          subtitle:   (r.items as string | null) ?? (r.tipo_entrega as string | null) ?? '',
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { items: r.items, tipo_entrega: r.tipo_entrega },
        });
      }
    })(),

    // ── Tickets IT ────────────────────────────────────────────────────────
    want('ticket') && (async () => {
      const { data } = await supabase
        .from('helpdesk_tickets')
        .select('id, agent_id, folio, titulo, prioridad, status, categoria, created_at')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        events.push({
          id:         `ticket-${r.id}`,
          type:       'ticket',
          title:      `${r.folio} · ${r.titulo}`,
          subtitle:   [r.categoria, r.prioridad, r.status].filter(Boolean).join(' · '),
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { folio: r.folio, prioridad: r.prioridad, status: r.status },
        });
      }
    })(),

    // ── Incidentes IT ─────────────────────────────────────────────────────
    want('incidente') && (async () => {
      const { data } = await supabase
        .from('it_incidents')
        .select('id, agent_id, titulo, descripcion, activo, created_at')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        events.push({
          id:         `incidente-${r.id}`,
          type:       'incidente',
          title:      r.titulo as string,
          subtitle:   (r.activo ? 'Activo' : 'Resuelto') + ((r.descripcion as string | null) ? ` · ${(r.descripcion as string).slice(0, 80)}` : ''),
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { activo: r.activo },
        });
      }
    })(),

    // ── Reportes ciudadanos ───────────────────────────────────────────────
    want('reporte') && (async () => {
      const { data } = await supabase
        .from('civic_reports')
        .select('id, agent_id, folio, description, category, status, caller_name, created_at')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        events.push({
          id:         `reporte-${r.id}`,
          type:       'reporte',
          title:      `${r.folio ?? 'Reporte'} · ${r.caller_name ?? 'Ciudadano'}`,
          subtitle:   [r.category, r.status, (r.description as string | null)?.slice(0, 80)].filter(Boolean).join(' · '),
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { folio: r.folio, category: r.category, status: r.status },
        });
      }
    })(),

    // ── Encuestas ─────────────────────────────────────────────────────────
    want('encuesta') && (async () => {
      const { data } = await supabase
        .from('survey_responses')
        .select('id, agent_id, survey_id, caller_number, created_at, surveys(nombre)')
        .in('agent_id', ids)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        const surveyName = ((r as Record<string, unknown>).surveys as { nombre?: string } | null)?.nombre ?? 'Encuesta';
        events.push({
          id:         `encuesta-${r.id}`,
          type:       'encuesta',
          title:      surveyName,
          subtitle:   (r.caller_number as string | null) ?? 'Llamante anónimo',
          agent_name: agentLabel(r.agent_id as string),
          created_at: r.created_at as string,
          meta:       { caller_number: r.caller_number, survey_id: r.survey_id },
        });
      }
    })(),

    // ── Delegaciones entre agentes ────────────────────────────────────────
    want('delegacion') && (async () => {
      const { data } = await supabase
        .from('agent_tasks')
        .select('id, created_by, assigned_to, title, status, created_at')
        .or(`created_by.in.(${ids.join(',')}),assigned_to.in.(${ids.join(',')})`)
        .eq('trigger_type', 'delegation')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        const from = agentLabel(r.created_by as string);
        const to   = agentLabel(r.assigned_to as string);
        events.push({
          id:         `delegacion-${r.id}`,
          type:       'delegacion',
          title:      r.title as string,
          subtitle:   `${from} → ${to}`,
          agent_name: to,
          created_at: r.created_at as string,
          meta:       { status: r.status, created_by: r.created_by, assigned_to: r.assigned_to },
        });
      }
    })(),

    // ── Correos recibidos por agentes ─────────────────────────────────────
    want('correo') && (async () => {
      const { data } = await supabase
        .from('agent_tasks')
        .select('id, assigned_to, title, description, created_at')
        .in('assigned_to', ids)
        .eq('trigger_type', 'email_reply')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const r of data ?? []) {
        events.push({
          id:         `correo-${r.id}`,
          type:       'correo',
          title:      r.title as string,
          subtitle:   (r.description as string | null) ?? '',
          agent_name: agentLabel(r.assigned_to as string),
          created_at: r.created_at as string,
          meta:       { assigned_to: r.assigned_to },
        });
      }
    })(),
  ].filter(Boolean));

  // Sort by date desc and apply limit
  events.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const page = events.slice(0, limit);

  return NextResponse.json({ events: page, total: events.length });
}
