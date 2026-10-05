export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient }         from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken }  from '@/lib/portal/org-token';
import { outlookExchangeCode }       from '@/lib/email/outlook';
import { encrypt }                   from '@/lib/crypto';
import { verifyIntegrationUpsert }   from '@/lib/oauth/verify-integration';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const code     = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';

  // State format (A-D3 nonce): `${baseToken}.${nonce}` — donde baseToken puede
  // incluir sufijo `__agent` (scope=agent sin hint) o `__agent:<uuid>` (scope=agent
  // con agent_id explícito, bug fix 2026-09-11 en email-callback/route.ts).
  // El regex maneja ambos formatos. Sin él, `__agent:<uuid>` no se strippeaba y
  // getPrimaryAgentFromToken recibía el composite → not found → 404.
  const dotIdx      = rawState.indexOf('.');
  const tokenPart   = dotIdx >= 0 ? rawState.slice(0, dotIdx) : rawState;
  const agentScopeMatch = tokenPart.match(/^(.+?)__agent(?::([0-9a-f-]{36}))?$/i);
  const isAgentScope    = !!agentScopeMatch;
  const state           = agentScopeMatch ? agentScopeMatch[1] : tokenPart;
  const agentIdFromState = agentScopeMatch?.[2] ?? null;

  const errorUrl = state
    ? `${appUrl}/portal/${state}?tab=organizacion&email=error#integraciones`
    : `${appUrl}/portal/login`;

  if (!code || !state) return NextResponse.redirect(errorUrl);

  try {
    const tokens  = await outlookExchangeCode(code);
    const supabase = createAdminClient();

    // Si el state incluye agent_id explícito, usarlo directamente. Fallback a
    // getPrimaryAgentFromToken (legacy) si no viene o si el agente no existe.
    let agent: { id: string; portal_email: string | null } | null = null;
    if (agentIdFromState) {
      const { data } = await supabase
        .from('voice_agents')
        .select('id, portal_email')
        .eq('id', agentIdFromState)
        .maybeSingle();
      const candidate = data as { id: string; portal_email: string | null } | null;
      // Defensa contra manipulación de state: verificar que el agente pertenece
      // al org del token.
      if (candidate) {
        const { resolveOrgFromToken } = await import('@/lib/portal/org-token');
        const org = await resolveOrgFromToken(state);
        if (org && candidate.portal_email === org.portalEmail) {
          agent = candidate;
        } else {
          console.warn('[outlook-callback] agent_id en state no matchea el org del token', {
            agentId: agentIdFromState, orgFromToken: org?.portalEmail, agentPortal: candidate.portal_email,
          });
        }
      }
    }
    if (!agent) {
      agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
        state, 'id, portal_email', supabase,
      );
    }

    if (!agent) return NextResponse.redirect(errorUrl);

    const expiresAt        = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    const persistEmail = await verifyIntegrationUpsert({
      integrationLabel: 'Outlook',
      portalEmail:      agent.portal_email,
      table:            'email_integrations',
      action: () => supabase.from('email_integrations').upsert({
        agent_id:           agent.id,
        provider:           'outlook',
        email:              tokens.email,
        access_token:       tokens.access_token,
        refresh_token:      encryptedRefresh,
        token_expires_at:   expiresAt,
        last_sync_at:       null,
        needs_reauth:       false,
        reauth_notified_at: null,
      }, { onConflict: 'agent_id,provider' }),
    });
    if (!persistEmail.ok) return NextResponse.redirect(errorUrl);

    if (!isAgentScope && agent.portal_email) {
      const { data: existing } = await supabase
        .from('integration_accounts')
        .select('metadata')
        .eq('portal_email', agent.portal_email)
        .eq('provider', 'outlook')
        .maybeSingle();

      const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};

      const persistOrg = await verifyIntegrationUpsert({
        integrationLabel: 'Outlook (org-level)',
        portalEmail:      agent.portal_email,
        table:            'integration_accounts',
        action: () => supabase.from('integration_accounts').upsert({
          portal_email:  agent.portal_email,
          provider:      'outlook',
          capability:    'email',
          account_label: tokens.email,
          access_token:  tokens.access_token,
          refresh_token: encryptedRefresh,
          expires_at:    expiresAt,
          status:        'active',
          metadata:      { auto_reply: false, last_sync_at: null, ...existingMeta },
        }, { onConflict: 'portal_email,provider' }),
      });
      if (!persistOrg.ok) return NextResponse.redirect(errorUrl);
    }

    const successUrl = isAgentScope
      ? `${appUrl}/portal/${state}/configurar?email=connected&provider=outlook`
      : `${appUrl}/portal/${state}?tab=organizacion&email=connected&provider=outlook#integraciones`;

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('[outlook-callback] error:', err);
    return NextResponse.redirect(errorUrl);
  }
}
