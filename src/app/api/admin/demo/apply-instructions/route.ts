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

  const { error: updateError } = await supabase
    .from('voice_agents')
    .update({
      knowledge_base: DEMO_INSTRUCTIONS,
      first_message: 'Hola, mucho gusto. Soy Nia. Esta llamada puede ser grabada.\n\nCuéntame, ¿qué tipo de negocio quieres que simulemos hoy?',
    })
    .eq('id', agentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agent?.vapi_agent_id) {
    try {
      await updateVapiAssistant(agent.vapi_agent_id, agent as VoiceAgent);
    } catch (e) {
      return NextResponse.json({ error: 'DB actualizada pero falló el sync con Vapi', detail: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
