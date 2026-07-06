import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLAN_MINUTES } from '@/types/agent';
import { createVapiAssistant, assignAssistantToPhone } from '@/lib/vapi/sync';
import { scrapeWebsite } from '@/lib/scrape/website';
import type { Plan, VoiceAgent } from '@/types/agent';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('voice_agents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
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

  // If linking to an existing client account, inherit their portal credentials
  let inheritedPortalEmail: string | null = null;
  let inheritedPasswordHash: string | null = null;
  if (rawPortalEmail) {
    const { data: existing } = await supabase
      .from('voice_agents')
      .select('portal_email, portal_password_hash')
      .eq('portal_email', rawPortalEmail)
      .limit(1)
      .single();
    inheritedPortalEmail  = existing?.portal_email ?? rawPortalEmail;
    inheritedPasswordHash = existing?.portal_password_hash ?? null;
  }

  // Scrape website before insert so the Vapi assistant has it from the start
  const businessWebsite = rawWebsite?.trim() ?? null;
  const websiteKnowledge = businessWebsite ? await scrapeWebsite(businessWebsite) : null;

  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1);
  resetDate.setDate(1);

  // 1. Save agent to Supabase
  const { data, error } = await supabase
    .from('voice_agents')
    .insert({
      client_name:            client_name.trim(),
      client_email:           client_email?.trim() ?? null,
      portal_email:           inheritedPortalEmail,
      portal_password_hash:   inheritedPasswordHash,
      business_website:       businessWebsite,
      website_knowledge:      websiteKnowledge,
      business_name:          business_name.trim(),
      business_description:   business_description?.trim() ?? '',
      business_address:       business_address?.trim() ?? null,
      business_phone_display: business_phone_display?.trim() ?? '',
      transfer_whatsapp:      transfer_whatsapp?.trim() ?? null,
      transfer_number:        transfer_number?.trim() ?? null,
      calendar_url:           calendar_url?.trim() ?? null,
      timezone:               timezone?.trim() ?? 'America/Monterrey',
      phone_number:           phone_number?.trim() ?? '',
      knowledge_base:         knowledge_base?.trim() ?? null,
      agent_name:             plan === 'pro' ? (agent_name?.trim() ?? null) : null,
      giro_template:          body.giro_template ?? null,
      plan:                   plan ?? 'comercial',
      features,
      minutes_included:       PLAN_MINUTES[(plan ?? 'comercial') as Plan],
      minutes_reset_date:     resetDate.toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agent = data as VoiceAgent;

  // 2. Create Vapi assistant with full system prompt
  const vapiAssistantId = await createVapiAssistant(agent);

  if (vapiAssistantId) {
    // 3. Save vapi_agent_id back to Supabase
    await supabase
      .from('voice_agents')
      .update({ vapi_agent_id: vapiAssistantId })
      .eq('id', agent.id);

    // 4. Assign assistant to the phone number in Vapi
    if (agent.phone_number) {
      await assignAssistantToPhone(agent.phone_number, vapiAssistantId);
    }
  }

  return NextResponse.json({ ...agent, vapi_agent_id: vapiAssistantId }, { status: 201 });
}
