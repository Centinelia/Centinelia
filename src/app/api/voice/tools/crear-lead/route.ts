import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { nombre, negocio, giro, servicio, presupuesto, timeline, email, whatsapp } =
    (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp')
    .eq('id', agent_id)
    .single();

  await supabase.from('leads_voice').insert({
    agent_id, nombre, negocio, giro, servicio, presupuesto, timeline, email, whatsapp, source: 'llamada',
  });

  if (agent?.transfer_whatsapp) {
    const msg = [
      `🎯 *Nuevo lead, ${agent.business_name}*`,
      nombre      ? `👤 ${nombre}`            : null,
      negocio     ? `🏢 ${negocio}${giro ? ` (${giro})` : ''}` : null,
      servicio    ? `📋 ${servicio}`           : null,
      presupuesto ? `💰 ${presupuesto}`        : null,
      timeline    ? `📅 ${timeline}`           : null,
      whatsapp    ? `📱 ${whatsapp}`           : null,
      email       ? `📧 ${email}`              : null,
    ].filter(Boolean).join('\n');

    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  return NextResponse.json({ result: 'Lead registrado correctamente. Le haremos llegar información pronto.' });
}
