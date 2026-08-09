import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { scrapeWebsite } from '@/lib/scrape/website';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import { rateLimit, limiters } from '@/lib/ratelimit';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const limited = await rateLimit(req, limiters.scrape, `scrape:${token}`);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, vapi_agent_id, portal_email, business_website')
    .eq('portal_token', token)
    .eq('portal_email', session.portalEmail)
    .single();

  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const newUrl: string | null = body.url?.trim() || agent.business_website || null;
  if (!newUrl) return NextResponse.json({ error: 'No hay URL configurada' }, { status: 400 });

  const scraped = await scrapeWebsite(newUrl);
  if (!scraped) return NextResponse.json({ error: 'No se pudo acceder al sitio web. Verifica la URL.' }, { status: 422 });

  // Write to organizations — single source of truth for org-level data.
  // brand_website se mantiene sincronizado para que Identidad Visual y Sitio web
  // se sientan como un único campo del negocio.
  await supabase
    .from('organizations')
    .upsert(
      { portal_email: agent.portal_email, business_website: newUrl, brand_website: newUrl, website_knowledge: scraped },
      { onConflict: 'portal_email' }
    );

  // Sync all agents — syncAgentToVapi enriches from organizations internally
  const { data: allAgents } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_email', agent.portal_email);

  for (const a of allAgents ?? []) {
    if (a.vapi_agent_id) {
      updateVapiAssistant(a.vapi_agent_id, a as VoiceAgent).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true, chars: scraped.length, url: newUrl });
}
