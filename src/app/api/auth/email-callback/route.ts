export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { gmailExchangeCode }   from '@/lib/email/gmail';
import { outlookExchangeCode } from '@/lib/email/outlook';
import { encrypt }             from '@/lib/crypto';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const provider  = req.nextUrl.searchParams.get('provider') as 'gmail' | 'outlook' | null;
  const code      = req.nextUrl.searchParams.get('code');
  const rawState  = req.nextUrl.searchParams.get('state') ?? '';

  if (!provider || !code || !rawState) {
    return NextResponse.redirect(`${appUrl}/portal/?tab=organizacion&email=error#integraciones`);
  }

  // A-D3: verify nonce cookie. verifyOAuthState devuelve portalToken (con
  // sufijo __agent si aplica). Legacy state (sin .nonce) se acepta con warning.
  const stateCheck = verifyOAuthState(req, provider, rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[email-callback] OAuth state nonce mismatch:', stateCheck.reason);
    return NextResponse.redirect(`${appUrl}/portal/?tab=organizacion&email=csrf_nonce#integraciones`);
  }
  if (stateCheck.legacy) {
    console.warn('[email-callback] OAuth state legacy format (rollout in progress)');
  }
  const portalTokenFromState = stateCheck.portalToken;
  const isAgentScope         = portalTokenFromState.endsWith('__agent');
  const state                = isAgentScope ? portalTokenFromState.replace(/__agent$/, '') : portalTokenFromState;

  try {
    const tokens = provider === 'gmail'
      ? await gmailExchangeCode(code)
      : await outlookExchangeCode(code);

    const supabase = createAdminClient();

    const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
      state, 'id, portal_email', supabase,
    );

    if (!agent) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=error#integraciones`);
    }

    // CSRF gate — sesión del portal matchea state.portalEmail. Ver Scope C3 MEDIUM.
    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);
    if (!session || (agent.portal_email && session.portalEmail !== agent.portal_email)) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=csrf#integraciones`);
    }

    const expiresAt       = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    // Solo per-agent (scope=agent) → email_integrations. Org-level fue deprecado
    // 2026-09-04 (ver [[org-level-email-deprecated]]) — se contraponía a los
    // correos que cada empleado ya tiene conectados individualmente. Si llega
    // un OAuth sin agent scope, se rechaza en vez de crear row org-level.
    if (!isAgentScope) {
      console.warn('[email-callback] rechazado: OAuth org-level ya no está soportado. Usa la config per-empleado.');
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=org_level_deprecated#integraciones`);
    }

    // Regla 2026-09-04: cada cuenta de correo pertenece a UN solo empleado
    // del org. Si otro meerkat del mismo portal_email ya tiene esta dirección
    // conectada, rechazamos el registro. Fundamento: bandeja compartida crea
    // colisiones (dos meerkats procesando el mismo hilo, marcando leído en
    // momentos distintos, contexto pisado). Ver deprecación email org-level.
    // Calendar y Storage sí permiten compartir cuenta (con warning en UI).
    if (agent.portal_email && tokens.email) {
      const { data: roster } = await supabase
        .from('voice_agents')
        .select('id')
        .eq('portal_email', agent.portal_email)
        .neq('id', agent.id);
      const otherIds = (roster ?? []).map((r: { id: string }) => r.id);
      if (otherIds.length > 0) {
        const { data: dup } = await supabase
          .from('email_integrations')
          .select('agent_id')
          .eq('email', tokens.email)
          .eq('provider', provider)
          .in('agent_id', otherIds)
          .maybeSingle();
        if (dup) {
          console.warn('[email-callback] rechazado: email ya usado por otro empleado del org', {
            email: tokens.email, provider, org: agent.portal_email,
          });
          return NextResponse.redirect(
            `${appUrl}/portal/${state}/configurar?email=already_used_by_teammate&provider=${provider}`
          );
        }
      }
    }

    await supabase.from('email_integrations').upsert({
      agent_id:           agent.id,
      provider,
      email:              tokens.email,
      access_token:       tokens.access_token,
      refresh_token:      encryptedRefresh,
      token_expires_at:   expiresAt,
      last_sync_at:       null,
      needs_reauth:       false,
      reauth_notified_at: null,
    }, { onConflict: 'agent_id,provider' });

    const successUrl = `${appUrl}/portal/${state}/configurar?email=connected&provider=${provider}`;

    const successRes = NextResponse.redirect(successUrl);
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    console.error('[email-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=error#integraciones`);
  }
}
