import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getCabildoTemplate, fillTemplate, getNextDocNumber } from '@/lib/civic/cabildo';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
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
    return NextResponse.json({ result: 'Se requiere la proposición y los resolutivos para generar el Punto de Acuerdo.' });
  }

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('business_name, transfer_whatsapp').eq('id', agent_id).single();

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

  return NextResponse.json({
    result: `Punto de Acuerdo generado con número ${numero}. Votación: ${votos_favor} a favor, ${votos_contra} en contra, ${abstenciones} abstenciones. Puede consultarlo y descargarlo en el portal de Cabildo.`,
  });
}
