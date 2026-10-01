import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getCabildoTemplate, fillTemplate, getNextDocNumber } from '@/lib/civic/cabildo';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { dedupLookup, dedupStore } from '@/lib/tools/dedup/with-dedup';
import { toolResponse } from '@/lib/voice/tool-response';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const call = (body.message?.toolCallList ?? body.toolCallList)?.[0];
  const args = call?.function?.arguments ?? body;
  const toolCallId: string = call?.id ?? '';
  if (!agent_id) return toolResponse(toolCallId, 'Error de configuración.');
  const {
    numero_sesion = '',
    tipo_sesion   = 'Ordinaria',
    lugar         = '',
    asistencia    = '',
    orden_del_dia = '',
    acuerdos      = '',
  } = args as Record<string, string>;

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('business_name, transfer_whatsapp, portal_email').eq('id', agent_id).single();

  const dedupCtx = {
    agentId:     agent_id,
    portalEmail: (agent as { portal_email?: string })?.portal_email ?? '',
    toolName:    'generar_acta_sesion',
    args:        args as Record<string, unknown>,
    channel:     'voice' as const,
    toolCallId,
  };
  const cached = await dedupLookup<{ result: string }>(dedupCtx);
  if (cached) return toolResponse(toolCallId, cached.result);

  const template = await getCabildoTemplate(agent_id, supabase);
  const numero   = await getNextDocNumber(agent_id, 'acta_sesion', supabase);
  const fecha    = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const contenido = fillTemplate(template.acta_sesion, {
    municipio: template.municipio,
    tipo_sesion,
    numero_sesion,
    fecha,
    lugar:         lugar     || 'Sala de Cabildo',
    asistencia:    asistencia || 'Pendiente de completar.',
    orden_del_dia: orden_del_dia || 'Pendiente de completar.',
    acuerdos:      acuerdos  || 'Pendiente de completar.',
  });

  await supabase.from('cabildo_documents').insert({
    agent_id,
    tipo:        'acta_sesion',
    titulo:      `Acta de Sesión ${tipo_sesion} No. ${numero_sesion}`,
    contenido,
    numero,
    sesion_info: numero_sesion ? `Sesión ${tipo_sesion} No. ${numero_sesion} — ${fecha}` : fecha,
  });

  if (agent?.transfer_whatsapp) {
    const msg = [
      `📋 *Nueva Acta de Sesión — ${agent.business_name}*`,
      `Número: *${numero}*`,
      numero_sesion ? `Sesión ${tipo_sesion} No. ${numero_sesion} — ${fecha}` : null,
      lugar ? `Lugar: ${lugar}` : null,
      'El borrador está listo para revisión en el portal de Cabildo.',
    ].filter(Boolean).join('\n');
    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  const payload = {
    result: `Acta de Sesión generada con número ${numero}. El borrador ha sido guardado en el portal de Cabildo y puede ser editado y completado por el equipo.`,
  };
  await dedupStore(dedupCtx, payload);
  return toolResponse(toolCallId, payload.result);
}
