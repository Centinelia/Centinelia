import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createVapiAssistant, updateVapiAssistant, assignAssistantToPhone, resyncPeerAgents } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { PLAN_CONCURRENT_CALLS } from '@/types/agent';
import { isAdmin } from '@/lib/admin/auth';
import { timingSafeCompareStrings } from '@/lib/auth/cron-auth';

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

// Fields that live in `organizations`, not `voice_agents`
const ORG_FIELDS = new Set([
  'knowledge_base', 'business_description', 'business_hours',
  'business_website', 'website_knowledge', 'google_review_url',
]);

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  // Split body into agent-level fields and org-level fields
  const agentPatch: Record<string, unknown> = {};
  const orgPatch:   Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ORG_FIELDS.has(k)) orgPatch[k] = v;
    else                   agentPatch[k] = v;
  }

  const { data, error } = await supabase
    .from('voice_agents')
    .update(agentPatch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Persist org-level fields to organizations table (if portal_email is known)
  const portalEmail = (data as any).portal_email ?? body.portal_email;
  if (portalEmail && Object.keys(orgPatch).length > 0) {
    await supabase
      .from('organizations')
      .upsert({ portal_email: portalEmail, ...orgPatch }, { onConflict: 'portal_email' });
  }

  // Propagate account-scoped settings to all sibling agents on the same portal_email
  if (portalEmail && 'daily_minutes_cap' in agentPatch) {
    await supabase
      .from('voice_agents')
      .update({ daily_minutes_cap: agentPatch.daily_minutes_cap })
      .eq('portal_email', portalEmail);
  }

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
      try {
        await updateVapiAssistant(agent.vapi_agent_id, agent);
        if (agent.phone_number) {
          await assignAssistantToPhone(agent.phone_number, agent.vapi_agent_id, PLAN_CONCURRENT_CALLS[agent.plan]);
        }
      } catch (err) {
        console.error('Vapi sync failed (DB saved):', err);
        return NextResponse.json({ ...data, vapi_sync_error: String(err) });
      }
    } else {
      try {
        const vapiAssistantId = await createVapiAssistant(agent);
        if (vapiAssistantId) {
          await supabase
            .from('voice_agents')
            .update({ vapi_agent_id: vapiAssistantId })
            .eq('id', id);

          if (agent.phone_number) {
            await assignAssistantToPhone(agent.phone_number, vapiAssistantId, PLAN_CONCURRENT_CALLS[agent.plan]);
          }

          resyncPeerAgents(agent.portal_email, agent.id).catch(console.error);
        }
      } catch (err) {
        console.error('Vapi create failed (DB saved):', err);
        return NextResponse.json({ ...data, vapi_sync_error: String(err) });
      }
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body: { password?: string } = {};
  try { body = await req.json(); } catch { /* body opcional */ }

  const expected = process.env.ADMIN_DELETE_PASSWORD;
  if (!expected) {
    return NextResponse.json({
      error: 'ADMIN_DELETE_PASSWORD no está configurado. Agrega la variable en Vercel para permitir eliminaciones.',
    }, { status: 500 });
  }

  // Trim de ambos lados para tolerar espacios accidentales del env o del user.
  const provided = (body.password ?? '').trim();
  const expect   = expected.trim();
  if (!provided || provided.length !== expect.length || !timingSafeCompareStrings(provided, expect)) {
    console.warn('[admin/delete-agent] password mismatch. provided len=%d, expected len=%d', provided.length, expect.length);
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Best-effort: limpiar dependencias que pueden bloquear el DELETE por FK.
  // Cada tabla tiene su propia FK (algunas cascade, otras no). Borramos
  // manualmente las que sabemos que existen y son sensibles a FK restrict.
  const dependencies = [
    'voice_calls',
    'leads',
    'appointments',
    'orders',
    'agent_tasks',
    'ops_inbox',
    'ai_ops_log',
    'minutes_ledger',
    'meerkat_handoff_log',
    'tool_call_log',
    'external_tramite_requests',
  ];
  for (const table of dependencies) {
    const { error: depErr } = await supabase.from(table).delete().eq('agent_id', id);
    if (depErr) {
      // La tabla puede no existir en esta instancia; loggeamos y seguimos.
      console.warn(`[admin/delete-agent] cleanup ${table} failed:`, depErr.message);
    }
  }

  const { error } = await supabase.from('voice_agents').delete().eq('id', id);
  if (error) {
    console.error('[admin/delete-agent] final delete failed:', error);
    // FK constraint típica de Postgres
    if (error.code === '23503' || /foreign key/i.test(error.message)) {
      return NextResponse.json({
        error: `No se pudo eliminar: hay datos relacionados que aún referencian al empleado (${error.message}). Contacta a soporte para hacer una purga completa.`,
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
