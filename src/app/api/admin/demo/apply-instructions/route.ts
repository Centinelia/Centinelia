import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import { DEMO_INSTRUCTIONS } from '@/lib/demo/instructions';
import type { VoiceAgent } from '@/types/agent';

export async function POST() {
  const agentId = process.env.DEMO_AGENT_ID;
  if (!agentId) {
    return NextResponse.json({ error: 'DEMO_AGENT_ID no configurado' }, { status: 500 });
  }

  const supabase = createAdminClient();

  // Fetch agent first to get portal_email (knowledge_base lives in organizations)
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (!agent) return NextResponse.json({ error: 'Demo agent not found' }, { status: 404 });

  // Update first_message on voice_agents
  const { error: agentError } = await supabase
    .from('voice_agents')
    .update({ first_message: 'Hola, mucho gusto. Soy Nia. Esta llamada puede ser grabada.\n\nCuéntame, ¿qué tipo de negocio quieres que simulemos hoy?' })
    .eq('id', agentId);

  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });

  // Update knowledge_base on organizations (single source of truth)
  if (agent.portal_email) {
    const { error: orgError } = await supabase
      .from('organizations')
      .update({ knowledge_base: DEMO_INSTRUCTIONS })
      .eq('portal_email', agent.portal_email);

    if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  // Re-fetch full agent (enrichWithOrgData will pick up knowledge_base from organizations)
  const { data: refreshed } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (refreshed?.vapi_agent_id) {
    try {
      // syncPeers=false: cambio de instrucciones del demo solo afecta al agente.
      await updateVapiAssistant(refreshed.vapi_agent_id, refreshed as VoiceAgent, { syncPeers: false });
    } catch (e) {
      return NextResponse.json({ error: 'DB actualizada pero falló el sync con Vapi', detail: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
