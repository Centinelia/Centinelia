import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortalAccess } from '@/lib/portal/access';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import { KB_LIMITS, FIELD_TO_LIMIT } from '@/lib/portal/kb-limits';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string }> }

// Fields that live in organizations (account-level source of truth)
const ORG_FIELDS = new Set(['knowledge_base', 'business_hours', 'business_description', 'business_email', 'owner_passphrase', 'owner_profile', 'guardia_schedule']);

export async function PATCH(req: NextRequest, { params }: Params) {
  // Gate: sub-user necesita módulo 'agentes' (config voz/prompts/trust_stage).
  // ORG_FIELDS (knowledge_base, owner_passphrase, guardia_schedule) requiere
  // también 'negocio' — se enforce después de leer el body. Ver Scope D3 CRIT-2 + HIGH-1.
  const gate = await requirePortalAccess(req, { module: 'agentes' });
  if (!gate.ok) return gate.response;
  const auth = gate.session;

  const { token } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  // Body puede especificar agentId para editar settings de un meerkat concreto.
  // Default primaryId por retrocompat — bug histórico: settings siempre iba al
  // primary sin importar qué meerkat estabas editando en el frontend. Los
  // ORG_FIELDS y organizations.features siguen siendo org-scoped.
  // Ver [[handoff-peer-discrimination-fix]] B1 #4.
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && access.portalEmail !== auth.portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const targetId = (body.agentId as string | undefined) ?? access.primaryId;
  if (!access.ids.includes(targetId)) {
    return NextResponse.json({ error: 'Empleado no válido para este portal' }, { status: 403 });
  }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, vapi_agent_id, portal_email, features')
    .eq('id', targetId)
    .single<{ id: string; vapi_agent_id: string | null; portal_email: string | null; features: Record<string, unknown> | null }>();
  if (!agent) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  // Second gate: si el body toca ORG_FIELDS (knowledge_base, owner_passphrase,
  // guardia_schedule, etc.) sub-user también necesita 'negocio'. Sin este
  // gate, sub-user con solo 'agentes' podía sobrescribir owner_passphrase y
  // bloquear al owner. Ver Scope D3 HIGH-1.
  const touchesOrg = Object.keys(body).some(k => ORG_FIELDS.has(k));
  if (touchesOrg && auth.isSubUser && !(auth.modules ?? []).includes('negocio')) {
    return NextResponse.json({ error: 'Editar datos de la organización (conocimiento, contraseña, guardia, horarios) requiere permiso "negocio".' }, { status: 403 });
  }

  // Keys stored inside the features JSONB column — merge instead of flat update
  const featureJsonKeys = ['outbound_calls', 'outbound_role', 'role_color', 'avatar', 'check_spam_folder', 'invoicing_email'];
  const featureJsonUpdate = Object.fromEntries(Object.entries(body).filter(([k]) => featureJsonKeys.includes(k)));
  if (Object.keys(featureJsonUpdate).length > 0) {
    const merged = { ...(agent.features as Record<string, unknown> ?? {}), ...featureJsonUpdate };
    await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);
  }

  const allowed = ['business_hours', 'knowledge_base', 'business_description', 'business_email', 'role_knowledge_base', 'role_learnings', 'guardrails_learnings', 'role', 'outbound_knowledge_base', 'notify_whatsapp', 'notify_email', 'first_message', 'transfer_rules', 'missed_call_recovery', 'agent_name', 'speech_style', 'folio_config', 'tramite_docs', 'cabildo_template', 'comms_routing', 'guardia_schedule', 'owner_passphrase', 'definition_of_done', 'owner_profile', 'agent_guardrails', 'heartbeat_config', 'trust_stage', 'approval_email'];
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
