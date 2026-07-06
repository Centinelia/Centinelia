import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createVapiAssistant, updateVapiAssistant, assignAssistantToPhone } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { PLAN_CONCURRENT_CALLS } from '@/types/agent';

import { scrapeWebsite } from '@/lib/scrape/website';
import { configureTwilioWhatsAppWebhook } from '@/lib/twilio/configure-webhook';

// Shared resync helper, updates website_knowledge and syncs Vapi
export async function resyncWebsite(agentId: string): Promise<{ ok: boolean; chars?: number; error?: string }> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, vapi_agent_id, business_website')
    .eq('id', agentId)
    .single();

  if (!agent?.business_website) return { ok: false, error: 'No hay URL configurada' };

  const scraped = await scrapeWebsite(agent.business_website);
  if (!scraped) return { ok: false, error: 'No se pudo acceder al sitio' };

  await supabase
    .from('voice_agents')
    .update({ website_knowledge: scraped })
    .eq('id', agentId);

  // Re-fetch full agent to rebuild system prompt with new website_knowledge
  const { data: updated } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
  if (updated?.vapi_agent_id) {
    await updateVapiAssistant(updated.vapi_agent_id, updated as VoiceAgent);
  }

  return { ok: true, chars: scraped.length };
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('voice_agents').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('voice_agents')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agent = data as VoiceAgent;
  const isFullUpdate = body.business_name !== undefined;

  // Auto-configure Twilio webhook when a WhatsApp number is set/changed
  if (body.wa_phone_number) {
    try {
      const result = await configureTwilioWhatsAppWebhook(body.wa_phone_number);
      if (!result.ok) console.warn(`Twilio webhook auto-config failed for ${body.wa_phone_number}:`, result.error);
    } catch (err) {
      console.warn('Twilio webhook auto-config threw:', err);
    }
  }

  if (isFullUpdate) {
    if (agent.vapi_agent_id) {
      // Update existing Vapi assistant
      await updateVapiAssistant(agent.vapi_agent_id, agent);

      // Re-assign if phone number changed
      if (agent.phone_number) {
        await assignAssistantToPhone(agent.phone_number, agent.vapi_agent_id, PLAN_CONCURRENT_CALLS[agent.plan]);
      }
    } else {
      // First time syncing, create assistant and assign
      const vapiAssistantId = await createVapiAssistant(agent);
      if (vapiAssistantId) {
        await supabase
          .from('voice_agents')
          .update({ vapi_agent_id: vapiAssistantId })
          .eq('id', id);

        if (agent.phone_number) {
          await assignAssistantToPhone(agent.phone_number, vapiAssistantId, PLAN_CONCURRENT_CALLS[agent.plan]);
        }
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('voice_agents').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
