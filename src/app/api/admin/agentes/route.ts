import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { PLAN_MINUTES, PLAN_CONCURRENT_CALLS } from '@/types/agent';
import { createVapiAssistant, assignAssistantToPhone, resyncPeerAgents } from '@/lib/vapi/sync';
import { scrapeWebsite } from '@/lib/scrape/website';
import type { Plan, VoiceAgent } from '@/types/agent';

// Sensitive columns that must never leak to a client, even under admin auth.
// Add here anything that's a credential, OAuth token, or hash.
const AGENT_SENSITIVE_FIELDS = [
  'notion_access_token',
  'calendar_api_key',
  'owner_passphrase',
  'portal_password_hash',
] as const;

function stripSensitive<T extends Record<string, unknown>>(row: T): Omit<T, typeof AGENT_SENSITIVE_FIELDS[number]> {
  const cleaned = { ...row } as Record<string, unknown>;
  for (const k of AGENT_SENSITIVE_FIELDS) delete cleaned[k];
  return cleaned as Omit<T, typeof AGENT_SENSITIVE_FIELDS[number]>;
}

export async function GET() {
  // Fix U1 audit 2026-08-10: sin este gate CUALQUIERA listaba todos los agentes
  // + PII de clientes (business_name, phone, knowledge_base). Route expuesto públicamente.
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('voice_agents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const sanitized = (data ?? []).map(row => stripSensitive(row as Record<string, unknown>));
  return NextResponse.json(sanitized);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const {
    client_name, client_email, business_name, business_description,
    business_address, business_phone_display, transfer_whatsapp,
    calendar_url, timezone, phone_number, transfer_number, knowledge_base, agent_name, plan, features,
    portal_email: rawPortalEmail, business_website: rawWebsite,
  } = body;

  if (!client_name?.trim() || !business_name?.trim()) {
    return NextResponse.json({ error: 'Nombre de cliente y negocio son requeridos' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If linking to an existing client account, inherit their portal credentials.
  // Password vive org-level (organizations.portal_password_hash); leemos de ahí
  // primero, fallback a voice_agents legacy.
  let inheritedPortalEmail: string | null = null;
  let inheritedPasswordHash: string | null = null;
  if (rawPortalEmail) {
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('portal_email, portal_password_hash')
      .eq('portal_email', rawPortalEmail)
      .maybeSingle() as { data: { portal_email: string; portal_password_hash: string | null } | null };
    inheritedPortalEmail  = existingOrg?.portal_email ?? rawPortalEmail;
    inheritedPasswordHash = existingOrg?.portal_password_hash ?? null;

    if (!inheritedPasswordHash) {
      const { data: existingAgent } = await supabase
        .from('voice_agents')
        .select('portal_password_hash')
        .eq('portal_email', rawPortalEmail)
        .not('portal_password_hash', 'is', null)
        .limit(1)
        .maybeSingle();
      inheritedPasswordHash = existingAgent?.portal_password_hash ?? null;
    }
  }

  // Scrape website before insert so the Vapi assistant has it from the start
  const businessWebsite = rawWebsite?.trim() ?? null;
  const websiteKnowledge = businessWebsite ? await scrapeWebsite(businessWebsite) : null;

  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1);
  resetDate.setDate(1);

  // 1. Save agent to Supabase (org-level fields go to organizations, not voice_agents)
  const { data, error } = await supabase
    .from('voice_agents')
    .insert({
      client_name:            client_name.trim(),
      client_email:           client_email?.trim() ?? null,
      portal_email:           inheritedPortalEmail,
      portal_password_hash:   inheritedPasswordHash,
      business_name:          business_name.trim(),
      business_address:       business_address?.trim() ?? null,
      business_phone_display: business_phone_display?.trim() ?? '',
      transfer_whatsapp:      transfer_whatsapp?.trim() ?? null,
      transfer_number:        transfer_number?.trim() ?? null,
      calendar_url:           calendar_url?.trim() ?? null,
      timezone:               timezone?.trim() ?? 'America/Monterrey',
      phone_number:           phone_number?.trim() ?? '',
      agent_name:             plan === 'pro' ? (agent_name?.trim() ?? null) : null,
      giro_template:          body.giro_template ?? null,
      plan:                   plan ?? 'pro',
      features,
      minutes_included:       PLAN_MINUTES[(plan ?? 'pro') as Plan],
      minutes_reset_date:     resetDate.toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agent = data as VoiceAgent;

  // 1b. Upsert org-level fields to organizations (single source of truth)
  if (inheritedPortalEmail) {
    const orgPatch: Record<string, string | null> = {};
    if (businessWebsite)                   orgPatch.business_website  = businessWebsite;
    if (websiteKnowledge)                  orgPatch.website_knowledge = websiteKnowledge;
    if (business_description?.trim())      orgPatch.business_description = business_description.trim();
    if (knowledge_base?.trim())            orgPatch.knowledge_base    = knowledge_base.trim();
    if (Object.keys(orgPatch).length > 0) {
      await supabase
        .from('organizations')
        .upsert({ portal_email: inheritedPortalEmail, ...orgPatch }, { onConflict: 'portal_email' });
    }

    // 1c. Contrato de servicios: si el cliente ya firmo (organizations.contract_accepted_at),
    // heredarlo al nuevo empleado para que el codigo legacy que aun lee de
    // voice_agents.contract_accepted_at no muestre "pendiente" incorrectamente.
    // Ver [[contract-at-organization-level]].
    const { data: orgContract } = await supabase
      .from('organizations')
      .select('contract_accepted_at, contract_ip')
      .eq('portal_email', inheritedPortalEmail)
      .maybeSingle();
    if (orgContract?.contract_accepted_at) {
      await supabase
        .from('voice_agents')
        .update({
          contract_accepted_at: orgContract.contract_accepted_at,
          contract_ip:          orgContract.contract_ip ?? null,
        })
        .eq('id', agent.id);
    }
  }

  // 2. Create Vapi assistant — enrichWithOrgData in sync.ts will pull from organizations
  const vapiAssistantId = await createVapiAssistant(agent);

  if (vapiAssistantId) {
    // 3. Save vapi_agent_id back to Supabase
    await supabase
      .from('voice_agents')
      .update({ vapi_agent_id: vapiAssistantId })
      .eq('id', agent.id);

    // 4. Assign assistant to the phone number in Vapi
    if (agent.phone_number) {
      await assignAssistantToPhone(agent.phone_number, vapiAssistantId, PLAN_CONCURRENT_CALLS[agent.plan]);
    }

    // 5. Push transfer tools to all sibling agents now that this one is in DB
    resyncPeerAgents(agent.portal_email, agent.id).catch(console.error);
  }

  return NextResponse.json({ ...agent, vapi_agent_id: vapiAssistantId }, { status: 201 });
}
