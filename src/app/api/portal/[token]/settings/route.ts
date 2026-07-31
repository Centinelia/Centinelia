import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import { KB_LIMITS, FIELD_TO_LIMIT } from '@/lib/portal/kb-limits';
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
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // Keys stored inside the features JSONB column — merge instead of flat update
  const featureJsonKeys = ['outbound_calls', 'role_color', 'avatar', 'check_spam_folder'];
  const featureJsonUpdate = Object.fromEntries(Object.entries(body).filter(([k]) => featureJsonKeys.includes(k)));
  if (Object.keys(featureJsonUpdate).length > 0) {
    const merged = { ...(agent.features as Record<string, unknown> ?? {}), ...featureJsonUpdate };
    await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);
  }

  const allowed = ['business_hours', 'knowledge_base', 'business_description', 'role_knowledge_base', 'role_learnings', 'guardrails_learnings', 'role', 'outbound_knowledge_base', 'outbound_role', 'notify_whatsapp', 'notify_email', 'first_message', 'transfer_rules', 'missed_call_recovery', 'agent_name', 'speech_style', 'folio_config', 'tramite_docs', 'cabildo_template', 'comms_routing', 'guardia_schedule', 'directorio_interno', 'owner_passphrase', 'allow_bug_reports', 'definition_of_done', 'owner_profile', 'agent_guardrails', 'heartbeat_config', 'trust_stage', 'approval_email'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  // heartbeat_config.enabled is owned by /automations endpoint (D9). If the
  // client sends a heartbeat_config here (from HeartbeatEditor), strip the
  // enabled key and preserve whatever is currently in the DB. Prevents a
  // stale client state from clobbering an opt-in toggle set elsewhere.
  if (update.heartbeat_config && typeof update.heartbeat_config === 'object') {
    const incoming = update.heartbeat_config as Record<string, unknown>;
    const { enabled: _ignoredEnabled, ...rest } = incoming;
    const { data: fresh } = await supabase.from('voice_agents').select('heartbeat_config').eq('id', agent.id).single();
    const currentHc = (fresh?.heartbeat_config ?? {}) as Record<string, unknown>;
    update.heartbeat_config = { ...currentHc, ...rest, enabled: currentHc.enabled ?? false };
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  // Hard cap en KBs — rechaza guardados que excedan el límite. Los editores
  // en frontend ya bloquean visualmente, pero validamos aquí para requests
  // directos a la API (curl, integraciones, etc.).
  for (const [field, key] of Object.entries(FIELD_TO_LIMIT)) {
    const v = update[field];
    if (typeof v === 'string' && v.length > KB_LIMITS[key].hard) {
      return NextResponse.json({
        error: `El campo "${KB_LIMITS[key].label}" excede el límite de ${KB_LIMITS[key].hard.toLocaleString('es-MX')} caracteres. Recibido: ${v.length.toLocaleString('es-MX')}. Resume el contenido o usa el botón "Generar con IA".`,
      }, { status: 400 });
    }
  }

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
