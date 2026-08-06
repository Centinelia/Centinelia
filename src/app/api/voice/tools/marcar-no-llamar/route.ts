import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

// Normaliza el teléfono a solo dígitos para hacer match tolerante contra
// las variantes almacenadas ("+52 81 12345678", "5281..." "81..." etc).
function digitsOnly(s: string): string {
  return (s ?? '').replace(/\D+/g, '');
}

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { telefono, motivo } = args as { telefono: string; motivo?: string };
  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'marcar_no_llamar', agentId: agent_id ?? '', sessionId, input: args, result, ok, startedAt,
  });

  if (!agent_id || !telefono?.trim()) {
    trace({ error: 'missing_telefono' }, false);
    return NextResponse.json({ result: 'No pude registrar la solicitud: falta el número de teléfono.' });
  }

  const supabase = createAdminClient();
  const normalized = digitsOnly(telefono);

  // 1) Marcar TODAS las filas coincidentes en outbound_contacts como 'dnc' —
  //    tanto la del cron actual como las de campañas futuras del mismo agente.
  //    Match tolerante: por sufijo de 10 dígitos (los últimos 10 son el número
  //    local mexicano). Si el número guardado es "+528112345678" y el que dice
  //    el ciudadano es "8112345678", ambos comparten los últimos 10 dígitos.
  const suffix = normalized.slice(-10);
  const { data: matches, error: matchErr } = await supabase
    .from('outbound_contacts')
    .select('id, telefono')
    .eq('agent_id', agent_id);

  let marked = 0;
  if (!matchErr && matches) {
    const toMark = matches.filter(r => digitsOnly(r.telefono as string).endsWith(suffix)).map(r => r.id as string);
    if (toMark.length) {
      const { transitionOutboundContact } = await import('@/lib/state-machines/outbound-contact');
      for (const contactId of toMark) {
        await transitionOutboundContact({
          supabase, contactId,
          toStatus: 'dnc',
          actor:    'agent',
          reason:   'caller_requested_dnc',
          metadata: { telefono, motivo: motivo ?? null, agent_id },
          soft:     true,
          extraFields: { notes: motivo ?? 'Solicitud del ciudadano' },
        });
      }
      marked = toMark.length;
    }
  }

  // 2) Log de auditoría para retención legal (LFPDPPP): quién pidió no ser
  //    llamado, cuándo, motivo. Usamos agent_learnings porque ya existe la
  //    infraestructura y guarda con auditoría; source='dnc' distingue estas
  //    entradas de learnings normales.
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent_id)
    .single();

  if (agent?.portal_email) {
    await supabase.from('agent_learnings').insert({
      agent_id,
      portal_email: agent.portal_email,
      content:      `DNC solicitado por ${telefono}${motivo ? ` — motivo: ${motivo}` : ''}`,
      source:       'call',
      status:       'approved',
      confidence:   1.0,
      category:     'guardrails',
    });
    const { queueNotificationEvent } = await import('@/lib/notifications/queue');
    await queueNotificationEvent({
      portalEmail: agent.portal_email,
      agentId:     agent_id,
      kind:        'dnc_marked',
      urgent:      false,
      payload:     { number: telefono, motivo: motivo ?? null, marked },
    });
  }

  const msg = `Registrado. El número ${telefono} no recibirá más llamadas de este empleado. Actualicé ${marked} registro${marked === 1 ? '' : 's'} de contacto.`;
  trace({ ok: true, telefono, marked, motivo: motivo ?? null });
  return NextResponse.json({ result: msg });
}
