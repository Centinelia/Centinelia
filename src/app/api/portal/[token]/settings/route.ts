import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string }> }

// Fields that live in organizations (account-level source of truth)
const ORG_FIELDS = new Set(['knowledge_base', 'business_hours', 'business_description', 'owner_passphrase', 'owner_profile']);

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

  const allowed = ['business_hours', 'knowledge_base', 'business_description', 'role_knowledge_base', 'role_learnings', 'guardrails_learnings', 'role', 'outbound_knowledge_base', 'outbound_role', 'notify_whatsapp', 'notify_email', 'first_message', 'transfer_rules', 'missed_call_recovery', 'agent_name', 'speech_style', 'folio_config', 'tramite_docs', 'cabildo_template', 'comms_routing', 'guardia_schedule', 'directorio_interno', 'owner_passphrase', 'allow_bug_reports', 'definition_of_done', 'owner_profile', 'agent_guardrails', 'heartbeat_config', 'trust_stage'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const agentUpdate = Object.fromEntries(Object.entries(update).filter(([k]) => !ORG_FIELDS.has(k)));
  const orgUpdate   = Object.fromEntries(Object.entries(update).filter(([k]) => ORG_FIELDS.has(k)));

  if (Object.keys(agentUpdate).length > 0) {
    const { error } = await supabase.from('voice_agents').update(agentUpdate).eq('id', agent.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Object.keys(orgUpdate).length > 0 && agent.portal_email) {
    await supabase
      .from('organizations')
      .upsert({ portal_email: agent.portal_email, ...orgUpdate }, { onConflict: 'portal_email' });
  }

  // Sync to Vapi — syncAgentToVapi enriches with latest org data internally
  if (agent.vapi_agent_id) {
    const { data: fullAgent } = await supabase.from('voice_agents').select('*').eq('id', agent.id).single();
    if (fullAgent) updateVapiAssistant(agent.vapi_agent_id, fullAgent as VoiceAgent).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
