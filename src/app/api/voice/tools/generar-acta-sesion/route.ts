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
    numero_sesion = '',
    tipo_sesion   = 'Ordinaria',
    lugar         = '',
    asistencia    = '',
    orden_del_dia = '',
    acuerdos      = '',
  } = args as Record<string, string>;

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('business_name, transfer_whatsapp').eq('id', agent_id).single();

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

  return NextResponse.json({
    result: `Acta de Sesión generada con número ${numero}. El borrador ha sido guardado en el portal de Cabildo y puede ser editado y completado por el equipo.`,
  });
}
