export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { mlExchangeCode }    from '@/lib/mercadolibre/auth';
import { encrypt }           from '@/lib/crypto';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const code     = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';
  const error    = req.nextUrl.searchParams.get('error');

  if (error || !code || !rawState) {
    return NextResponse.redirect(`${appUrl}/portal/?tab=integraciones&ml=error`);
  }

  // A-D3: verify nonce cookie
  const stateCheck = verifyOAuthState(req, 'ml', rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[ml-callback] OAuth state nonce mismatch:', stateCheck.reason);
    return NextResponse.redirect(`${appUrl}/portal/?tab=integraciones&ml=csrf_nonce`);
  }
  const state = stateCheck.portalToken;

  try {
    const tokens = await mlExchangeCode(code);

    const supabase = createAdminClient();
    const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
      state, 'id, portal_email', supabase,
    );

    if (!agent) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&ml=error`);
    }

    // CSRF gate — sesión activa matchea state.portalEmail. Ver Scope C3 MEDIUM.
    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);
    if (!session || (agent.portal_email && session.portalEmail !== agent.portal_email)) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&ml=csrf`);
    }

    const expiresAt        = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = encrypt(tokens.refresh_token);

    if (agent.portal_email) {
      await supabase.from('integration_accounts').upsert({
        portal_email:  agent.portal_email,
        provider:      'mercadolibre',
        capability:    'marketplace',
        account_label: tokens.nickname,
        access_token:  tokens.access_token,
        refresh_token: encryptedRefresh,
        expires_at:    expiresAt,
        status:        'active',
        metadata:      { user_id: String(tokens.user_id), nickname: tokens.nickname },
      }, { onConflict: 'portal_email,provider' });
    }

    const successRes = NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&ml=connected`);
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    console.error('[ml-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&ml=error`);
  }
}
