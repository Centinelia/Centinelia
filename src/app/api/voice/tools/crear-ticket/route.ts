import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNextTicketFolio, getCurrentOnCall } from '@/lib/helpdesk/folio';
import type { GuardiaSchedule, DirectorioContacto } from '@/lib/helpdesk/folio';
import { sendEmail } from '@/lib/email/send';
import { ticketEmailHtml } from '@/lib/ops/approval-email';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

const WA_URL = 'https://api.twilio.com/2010-04-01/Accounts';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json();
  const args    = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const toolId  = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.id ?? 'tool';
  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'crear_ticket', agentId, sessionId, input: args, result, ok, startedAt,
  });

  const { titulo, categoria = 'otro', prioridad = 'normal', descripcion, caller_number } = args as {
    titulo?: string; categoria?: string; prioridad?: string; descripcion?: string; caller_number?: string;
  };

  if (!titulo) {
    trace({ error: 'missing_titulo' }, false);
    return NextResponse.json({ results: [{ toolCallId: toolId, result: 'Título del ticket requerido.' }] });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('transfer_whatsapp, wa_phone_number, timezone, guardia_schedule, directorio_interno, client_email, portal_token, agent_name')
    .eq('id', agentId)
    .single();

  // Auto-assign: check directorio first, then guardia
  let asignadoA:   string | null = null;
  let asignadoTel: string | null = null;

  const directorio = (agent?.directorio_interno ?? []) as DirectorioContacto[];
  if (directorio.length > 0) {
    const q = `${categoria} ${titulo} ${descripcion ?? ''}`.toLowerCase();
    const match = directorio.find(c => c.atiende.toLowerCase().split(/[\s,]+/).some(kw => kw.length > 3 && q.includes(kw)));
    if (match) { asignadoA = match.nombre; asignadoTel = match.telefono || null; }
  }

  // On-call overrides directorio for alta/critica
  if (prioridad === 'alta' || prioridad === 'critica') {
    const guardia = (agent?.guardia_schedule as GuardiaSchedule | null)?.areas ?? [];
    const q = `${categoria} ${titulo}`.toLowerCase();
    const area = guardia.find(a => q.includes(a.nombre.toLowerCase().split(' ')[0].toLowerCase())) ?? guardia[0];
    if (area) {
      const tz     = (agent?.timezone as string | null) ?? 'America/Monterrey';
      const oncall = getCurrentOnCall(area, tz);
      if (oncall) { asignadoA = oncall.tecnico; asignadoTel = oncall.telefono; }
    }
  }

  const folio = await getNextTicketFolio(agentId, supabase);

  await supabase.from('helpdesk_tickets').insert({
    agent_id:     agentId,
    folio,
    caller_number: caller_number ?? null,
    categoria,
    prioridad,
    titulo,
    descripcion:  descripcion ?? null,
    asignado_a:   asignadoA,
    asignado_tel: asignadoTel,
    status:       'abierto',
  });

  // WhatsApp notification to assigned tech (if critica/alta) or transfer_whatsapp
  const waTo = (prioridad === 'critica' || prioridad === 'alta') && asignadoTel
    ? asignadoTel
    : (agent?.transfer_whatsapp as string | null);
  const waFrom = agent?.wa_phone_number as string | null;

  if (waTo && waFrom && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const lines = [
      `🎫 *Nuevo ticket ${folio}*`,
      `Prioridad: ${prioridad.toUpperCase()}`,
      `Área: ${categoria}`,
      `Asunto: ${titulo}`,
      asignadoA ? `Asignado: ${asignadoA}` : '',
    ].filter(Boolean).join('\n');

    fetch(`${WA_URL}/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method:  'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: `whatsapp:${waFrom}`, To: `whatsapp:${waTo}`, Body: lines }),
    }).catch(console.error);
  }

  // Email notification to owner
  const ownerEmail  = agent?.client_email as string | null;
  const portalToken = agent?.portal_token  as string | null;
  if (ownerEmail && portalToken) {
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/portal/${portalToken}/oficina/helpdesk`;
    sendEmail({
      to:      ownerEmail,
      subject: `[Ticket ${folio}] ${titulo} — ${prioridad.toUpperCase()}`,
      html:    ticketEmailHtml({ folio, titulo, categoria, prioridad, descripcion: descripcion ?? null, asignadoA, source: 'voz', portalUrl }),
    }).catch(console.error);
  }

  const assignMsg = asignadoA ? ` Lo asigné a ${asignadoA}.` : '';
  const finalMsg = `Ticket creado con folio ${folio}.${assignMsg} El equipo de soporte lo atenderá pronto.`;
  trace({ ok: true, folio, titulo, categoria, prioridad, asignado_a: asignadoA });
  return NextResponse.json({
    results: [{ toolCallId: toolId, result: finalMsg }],
  });
}
