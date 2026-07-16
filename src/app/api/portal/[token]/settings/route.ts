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
    .from('voice_agents').select('id, vapi_agent_id, portal_email, features').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // Keys stored inside the features JSONB column — merge instead of flat update
  const featureJsonKeys = ['outbound_calls', 'role_color', 'avatar'];
  const featureJsonUpdate = Object.fromEntries(Object.entries(body).filter(([k]) => featureJsonKeys.includes(k)));
  if (Object.keys(featureJsonUpdate).length > 0) {
    const merged = { ...(agent.features as Record<string, unknown> ?? {}), ...featureJsonUpdate };
    await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);
  }

  const allowed = ['business_hours', 'knowledge_base', 'business_description', 'role_knowledge_base', 'role_learnings', 'role', 'outbound_knowledge_base', 'outbound_role', 'notify_whatsapp', 'notify_email', 'first_message', 'transfer_rules', 'missed_call_recovery', 'agent_name', 'speech_style', 'folio_config', 'tramite_docs', 'cabildo_template', 'comms_routing', 'guardia_schedule', 'directorio_interno', 'owner_passphrase'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { data, error } = await supabase
    .from('voice_agents').update(update).eq('id', agent.id).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync to Vapi so the agent picks up the new content immediately
  if (agent.vapi_agent_id) {
    updateVapiAssistant(agent.vapi_agent_id, data as VoiceAgent).catch(console.error);
  }

  // Business-level fields (knowledge_base) propagate to all agents of the same account
  const businessFields = ['knowledge_base', 'business_hours', 'business_description', 'owner_passphrase'];
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
