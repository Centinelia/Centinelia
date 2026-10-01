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
    proposicion,
    considerandos,
    resolutivos,
    votos_favor     = '0',
    votos_contra    = '0',
    abstenciones    = '0',
    numero_sesion   = '',
    tipo_sesion     = 'Ordinaria',
  } = args as Record<string, string>;

  if (!proposicion || !resolutivos) {
    return toolResponse(toolCallId, 'Se requiere la proposición y los resolutivos para generar el Punto de Acuerdo.');
  }

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('business_name, transfer_whatsapp, portal_email').eq('id', agent_id).single();

  const dedupCtx = {
    agentId:     agent_id,
    portalEmail: (agent as { portal_email?: string })?.portal_email ?? '',
    toolName:    'generar_punto_acuerdo',
    args:        args as Record<string, unknown>,
    channel:     'voice' as const,
    toolCallId,
  };
  const cached = await dedupLookup<{ result: string }>(dedupCtx);
  if (cached) return toolResponse(toolCallId, cached.result);

  const template = await getCabildoTemplate(agent_id, supabase);
  const numero   = await getNextDocNumber(agent_id, 'punto_acuerdo', supabase);
  const fecha    = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const contenido = fillTemplate(template.punto_acuerdo, {
    municipio:    template.municipio,
    tipo_sesion,
    numero_sesion,
    fecha,
    proposicion,
    considerandos: considerandos ?? 'Sin antecedentes adicionales.',
    resolutivos,
    votos_favor,
    votos_contra,
    abstenciones,
  });

  await supabase.from('cabildo_documents').insert({
    agent_id,
    tipo:        'punto_acuerdo',
    titulo:      proposicion.slice(0, 120),
    contenido,
    numero,
    sesion_info: numero_sesion ? `Sesión ${tipo_sesion} No. ${numero_sesion}` : null,
  });

  if (agent?.transfer_whatsapp) {
    const msg = [
      `📜 *Nuevo Punto de Acuerdo — ${agent.business_name}*`,
      `Número: *${numero}*`,
      numero_sesion ? `Sesión ${tipo_sesion} No. ${numero_sesion}` : null,
      `Asunto: ${proposicion.slice(0, 100)}`,
      `Votación: ${votos_favor} a favor · ${votos_contra} en contra · ${abstenciones} abstenciones`,
    ].filter(Boolean).join('\n');
    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  const payload = {
    result: `Punto de Acuerdo generado con número ${numero}. Votación: ${votos_favor} a favor, ${votos_contra} en contra, ${abstenciones} abstenciones. Puede consultarlo y descargarlo en el portal de Cabildo.`,
  };
  await dedupStore(dedupCtx, payload);
  return toolResponse(toolCallId, payload.result);
}
