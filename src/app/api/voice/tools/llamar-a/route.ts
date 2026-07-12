import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { numero, nombre, mensaje } = args as { numero: string; nombre?: string; mensaje: string };

  if (!numero || !mensaje) {
    return NextResponse.json({ result: 'Necesito el número de teléfono y el motivo de la llamada.' });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agent_id)
    .single();
  if (!agent) return NextResponse.json({ result: 'Error: agente no encontrado' });

  if (!(agent.features as any)?.outbound_calls) {
    return NextResponse.json({ result: 'Este agente no tiene llamadas salientes habilitadas.' });
  }
  if (!agent.vapi_agent_id) {
    return NextResponse.json({ result: 'El agente no está configurado para llamadas salientes. Resincroniza desde el portal.' });
  }

  const opsResult = await consumeAiOp(agent_id, 1);
  if (!opsResult.ok) {
    return NextResponse.json({ result: 'No tienes operaciones IA disponibles este mes para realizar llamadas.' });
  }

  const callResult = await triggerOutboundCall({
    agent:          agent as any,
    customerNumber: numero,
    customerName:   nombre,
    motivo:         mensaje,
  });

  if (!callResult.ok) {
    return NextResponse.json({ result: `No pude iniciar la llamada: ${callResult.error}` });
  }

  return NextResponse.json({
    result: `Llamada iniciada a ${numero}${nombre ? ` (${nombre})` : ''}. Te notificaré cuando esté completa.`,
  });
}
