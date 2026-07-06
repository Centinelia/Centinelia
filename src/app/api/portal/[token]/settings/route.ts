import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, vapi_agent_id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const allowed = ['business_hours', 'knowledge_base', 'outbound_knowledge_base', 'notify_whatsapp', 'notify_email', 'first_message', 'transfer_rules', 'missed_call_recovery', 'agent_name', 'speech_style'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  // Handle outbound_calls feature flag toggle (only this flag is client-controllable)
  if (typeof body.outbound_calls === 'boolean') {
    const { data: current } = await supabase.from('voice_agents').select('features').eq('id', agent.id).single();
    update.features = { ...(current?.features ?? {}), outbound_calls: body.outbound_calls };
  }

  const { data, error } = await supabase
    .from('voice_agents').update(update).eq('id', agent.id).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync to Vapi so the agent picks up the new content immediately
  if (agent.vapi_agent_id) {
    updateVapiAssistant(agent.vapi_agent_id, data as VoiceAgent).catch(console.error);
  }

  // Business-level fields (knowledge_base) propagate to all agents of the same account
  const businessFields = ['knowledge_base', 'business_hours'];
  const businessUpdate = Object.fromEntries(Object.entries(update).filter(([k]) => businessFields.includes(k)));
  if (Object.keys(businessUpdate).length > 0 && agent.portal_email) {
    const { data: siblings } = await supabase
      .from('voice_agents')
      .select('id, vapi_agent_id')
      .eq('portal_email', agent.portal_email)
      .neq('id', agent.id);

    if (siblings?.length) {
      await supabase
        .from('voice_agents')
        .update(businessUpdate)
        .eq('portal_email', agent.portal_email)
        .neq('id', agent.id);

      for (const s of siblings) {
        if (s.vapi_agent_id) {
          const { data: full } = await supabase.from('voice_agents').select('*').eq('id', s.id).single();
          if (full) updateVapiAssistant(s.vapi_agent_id, full as VoiceAgent).catch(console.error);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
