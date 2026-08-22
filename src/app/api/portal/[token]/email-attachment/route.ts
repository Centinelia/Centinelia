import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getConnector, type IntegrationRow } from '@/lib/connectors';

// Proxy para descargar attachments de Gmail/Outlook desde el portal. Sin esto,
// los `<a href="gmail:MSG/ATT">` renderizados en la bandeja abren un URL
// interno de Gmail que solo funciona dentro de gmail.com — desde el portal
// resulta en link muerto.
//
// Auth: verifica session + que el agent_id pedido pertenezca al org del token.
// Fallback: intenta email_integrations per-agent, luego integration_accounts
// org-level (misma estrategia que email-sync.ts).

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const url     = new URL(req.url);
  const agentId = url.searchParams.get('agent') ?? '';
  const msgId   = url.searchParams.get('msg')   ?? '';
  const attId   = url.searchParams.get('att')   ?? '';
  const name    = url.searchParams.get('name')  ?? 'attachment';
  const mime    = url.searchParams.get('mime')  ?? 'application/octet-stream';

  if (!agentId || !msgId || !attId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
    token,
    'id, portal_email',
    supabase,
  );
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Verifica que el agent pedido esté en el org del token — evita que un usuario
  // enumere attachments de otras orgs pasando agent_ids ajenos.
  const { data: orgAgents } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', acct.portal_email)
    .eq('active', true);
  const orgAgentIds = (orgAgents ?? []).map(a => a.id as string);
  if (!orgAgentIds.includes(agentId)) {
    return NextResponse.json({ error: 'Agent no accesible' }, { status: 403 });
  }

  const integration = await resolveIntegration(supabase, agentId, acct.portal_email);
  if (!integration) {
    return NextResponse.json({ error: 'Sin integración de correo activa' }, { status: 404 });
  }

  const conn = await getConnector(integration, supabase);
  if (!conn.email.fetchAttachment) {
    return NextResponse.json({ error: `Attachments no soportados para ${integration.provider}` }, { status: 501 });
  }

  const buf = await conn.email.fetchAttachment(msgId, attId);
  if (!buf) return NextResponse.json({ error: 'Attachment no encontrado o expirado' }, { status: 404 });

  const safeName = name.replace(/[\r\n"]/g, '').slice(0, 200);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':        mime,
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control':       'private, max-age=3600',
    },
  });
}

async function resolveIntegration(
  supabase: ReturnType<typeof createAdminClient>,
  agentId:  string,
  portalEmail: string | null,
): Promise<IntegrationRow | null> {
  const { data: perAgent } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();
  if (perAgent) return perAgent as unknown as IntegrationRow;

  if (!portalEmail) return null;
  const { data: orgAcct } = await supabase
    .from('integration_accounts')
    .select('*')
    .eq('portal_email', portalEmail)
    .in('provider', ['gmail', 'outlook'])
    .maybeSingle();
  if (!orgAcct) return null;

  return {
    id:                 `org:${portalEmail}:${orgAcct.provider}`,
    agent_id:           agentId,
    provider:           orgAcct.provider as 'gmail' | 'outlook',
    email:              (orgAcct.account_label as string) ?? '',
    access_token:       (orgAcct.access_token as string) ?? '',
    refresh_token:      (orgAcct.refresh_token as string) ?? null,
    token_expires_at:   (orgAcct.expires_at as string) ?? null,
    last_sync_at:       null,
    needs_reauth:       orgAcct.status === 'needs_reauth',
    reauth_notified_at: null,
  };
}
