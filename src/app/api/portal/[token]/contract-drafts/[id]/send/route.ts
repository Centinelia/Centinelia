import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { sendEmail, contractToClientHtml, type EmailBranding } from '@/lib/email/send';
import { transitionContract } from '@/lib/state-machines/contract-draft';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase       = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, logo_url, brand_color, business_address, business_website, email_from_address, agent_name')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Resolve all agent_ids for this account to scope the draft lookup
  const { data: accountAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const accountIds = (accountAgents ?? []).map(a => a.id as string);

  const { data: draft } = await supabase
    .from('contract_drafts').select('*').eq('id', id).in('agent_id', accountIds).single();
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (!draft.client_email) return NextResponse.json({ error: 'El borrador no tiene email del cliente' }, { status: 400 });

  const branding: EmailBranding = {
    logoUrl:    (agent.logo_url as string | null) ?? null,
    brandColor: (agent.brand_color as string | null) ?? '#6C3BFF',
    footerText: null,
    senderName: agent.business_name as string,
    website:    (agent.business_website as string | null) ?? null,
    address:    (agent.business_address as string | null) ?? null,
  };

  const from = (agent.email_from_address as string | null)
    ? `${agent.business_name} <${agent.email_from_address}>`
    : undefined;

  const clauses = (draft.clauses as { id: string; title: string; body: string; enabled: boolean }[])
    .filter(c => c.enabled);

  const html = contractToClientHtml({
    branding,
    clientName:  draft.client_name  ?? null,
    businessName: agent.business_name as string,
    clauses,
  });

  const ok = await sendEmail({
    to:      draft.client_email as string,
    subject: `Contrato de servicios — ${agent.business_name}`,
    html,
    from,
  });

  if (!ok) return NextResponse.json({ error: 'Error al enviar el correo' }, { status: 500 });

  await transitionContract({
    supabase, contractId: id,
    toStatus: 'enviado',
    actor:    'user',
    reason:   'contract_sent_to_client',
    metadata: { sent_to: draft.client_email },
    extraFields: { sent_at: new Date().toISOString() },
  });
  const { recordHumanDecision } = await import('@/lib/human-gates/record');
  recordHumanDecision({
    supabase, gateType: 'contract_send', resourceId: id,
    decision: 'send', channel: 'portal_ui',
    reason: 'contract_sent_to_client',
    metadata: { sent_to: draft.client_email, client_name: draft.client_name },
  });

  return NextResponse.json({ ok: true });
}
