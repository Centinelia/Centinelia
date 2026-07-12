import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { numero_cliente, motivo } = args;

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });
  if (!numero_cliente) return NextResponse.json({ result: 'Necesito el número del cliente para enviar el WhatsApp.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp')
    .eq('id', agent_id)
    .single();

  if (!agent) return NextResponse.json({ result: 'Error de configuración.' });

  const digits = numero_cliente.replace(/\D/g, '');
  const waNumber = digits.startsWith('52') ? `+${digits}` : `+52${digits}`;

  const msg = `Hola, te escribo de parte de *${agent.business_name}*. Notamos que intentaste comunicarte con nosotros${motivo ? ` (${motivo})` : ''}. Estamos aquí para ayudarte, escríbenos con gusto. 😊`;

  await sendWhatsApp(waNumber, msg);

  return NextResponse.json({
    result: `WhatsApp enviado al cliente en ${waNumber}. Puedes cerrar la llamada cordialmente.`,
    numero: waNumber,
  });
}
