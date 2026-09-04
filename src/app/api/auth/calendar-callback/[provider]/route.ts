export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { googleExchangeCode } from '@/lib/email/gmail';
import { microsoftExchangeCode, MICROSOFT_SCOPES } from '@/lib/email/outlook';
import { encrypt } from '@/lib/crypto';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';

interface Params { params: Promise<{ provider: string }> }

// Callback OAuth per-agent para Google Calendar / Outlook Calendar.
// State esperado: `${token}::agent-cal::${agentId}[.nonce]`
export async function GET(req: NextRequest, { params }: Params) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const { provider: providerParam } = await params;
  const provider = providerParam === 'google' || providerParam === 'microsoft' ? providerParam : null;
  const code     = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';
  const oauthErr = req.nextUrl.searchParams.get('error');

  const genericError = `${appUrl}/portal/?tab=organizacion&cal=error#integraciones`;
  if (!provider || oauthErr || !code || !rawState) {
    return NextResponse.redirect(genericError);
  }

  const nonceProvider = provider === 'google' ? 'google-cal' : 'microsoft-cal';
  const stateCheck = verifyOAuthState(req, nonceProvider, rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[calendar-callback] nonce mismatch:', stateCheck.reason);
    return NextResponse.redirect(`${appUrl}/portal/?tab=organizacion&cal=csrf_nonce#integraciones`);
  }

  const [token, marker, agentId] = stateCheck.portalToken.split('::');
  if (!token || marker !== 'agent-cal' || !agentId) {
    console.warn('[calendar-callback] state malformed:', stateCheck.portalToken);
    return NextResponse.redirect(genericError);
  }

  const backTo = `${appUrl}/portal/${token}/configurar/${agentId}?cal=error`;

  try {
    const resolved = await resolveOrgFromToken(token);
    if (!resolved) return NextResponse.redirect(backTo);

    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);
    if (!session || session.portalEmail !== resolved.portalEmail) {
      return NextResponse.redirect(`${appUrl}/portal/${token}/configurar/${agentId}?cal=csrf`);
    }

    const supabase = createAdminClient();
    // IDOR: el agent debe pertenecer al org del token
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('id', agentId)
      .eq('portal_email', resolved.portalEmail)
      .maybeSingle();
    if (!agent) return NextResponse.redirect(backTo);

    const tokens = provider === 'google'
      ? await googleExchangeCode(code, 'calendar-callback/google')
      : await microsoftExchangeCode(code, MICROSOFT_SCOPES.calendar, 'calendar-callback/microsoft');

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const capability = `calendar_${provider}`;

    await supabase.from('integration_accounts').upsert({
      agent_id:      agentId,
      portal_email:  resolved.portalEmail,
      provider,
      capability,
      account_label: tokens.email,
      access_token:  tokens.access_token,
      refresh_token: encryptedRefresh,
      expires_at:    expiresAt,
      status:        'active',
      metadata:      {},
    }, { onConflict: 'agent_id,provider,capability' });

    const successRes = NextResponse.redirect(
      `${appUrl}/portal/${token}/configurar/${agentId}?cal=connected&provider=${provider}`
    );
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    console.error('[calendar-callback] error:', err);
    return NextResponse.redirect(backTo);
  }
}
