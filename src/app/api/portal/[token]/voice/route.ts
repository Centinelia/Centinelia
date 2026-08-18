import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { voice_id, agentId } = await req.json() as { voice_id?: string; agentId?: string };
  if (!voice_id || typeof voice_id !== 'string') {
    return NextResponse.json({ error: 'voice_id requerido' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // La voz es per-meerkat legítimo (cada meerkat es persona distinta). El
  // frontend debería pasar agentId para saber qué meerkat editar; si no lo
  // pasa, default al primary por retrocompat (bug: siempre editaba al primary).
  // Ver [[handoff-peer-discrimination-fix]] B1 #2 y #3.
  const access = await getAgentAccess(token, req);
  if (!access || access.portalEmail !== session.portalEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const targetId = agentId ?? access.primaryId;
  if (!access.ids.includes(targetId)) {
    return NextResponse.json({ error: 'Empleado no válido para este portal' }, { status: 403 });
  }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', targetId)
    .single();
  if (!agent) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  await supabase
    .from('voice_agents')
    .update({ elevenlabs_voice_id: voice_id })
    .eq('id', targetId);

  if (agent.vapi_agent_id) {
    // syncPeers=false: cambio de voz solo afecta al assistant del agente.
    await updateVapiAssistant(agent.vapi_agent_id, { ...agent, elevenlabs_voice_id: voice_id } as VoiceAgent, { syncPeers: false });
  }

  return NextResponse.json({ ok: true });
}
