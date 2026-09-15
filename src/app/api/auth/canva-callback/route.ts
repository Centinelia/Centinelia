export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';
import { encrypt } from '@/lib/crypto';
import { CanvaProvider } from '@/lib/social/canva';

// Callback OAuth de Canva Connect para Navi.
// State esperado: `${token}::navi-canva::${agentId}[.nonce]`
// Persiste tokens en integration_accounts (provider='canva', capability='design').
export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const code     = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';
  const oauthErr = req.nextUrl.searchParams.get('error');

  // Redirección de error genérico si faltan parámetros obligatorios
  const genericError = `${appUrl}/portal/?navi=error`;
  if (oauthErr || !code || !rawState) {
    return NextResponse.redirect(genericError);
  }

  // Verificar nonce CSRF (cookie httpOnly vs state URL)
  const stateCheck = verifyOAuthState(req, 'navi-canva', rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[canva-callback] nonce mismatch:', stateCheck.reason);
    return NextResponse.redirect(`${appUrl}/portal/?navi=csrf_nonce`);
  }

  // Descomponer portalToken en sus partes: token::navi-canva::agentId
  const [token, marker, agentId] = stateCheck.portalToken.split('::');
  if (!token || marker !== 'navi-canva' || !agentId) {
    console.warn('[canva-callback] state malformado:', stateCheck.portalToken);
    return NextResponse.redirect(genericError);
  }

  const backTo = `${appUrl}/portal/${token}/configurar/${agentId}?navi=error`;

  try {
    const resolved = await resolveOrgFromToken(token);
    if (!resolved) return NextResponse.redirect(backTo);

    // Gate de sesión — el usuario autenticado debe pertenecer a este portal
    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);
    if (!session || session.portalEmail !== resolved.portalEmail) {
      return NextResponse.redirect(
        `${appUrl}/portal/${token}/configurar/${agentId}?navi=csrf`,
      );
    }

    const supabase = createAdminClient();

    // Gate IDOR — el agente debe pertenecer al org del token
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('id', agentId)
      .eq('portal_email', resolved.portalEmail)
      .maybeSingle();
    if (!agent) return NextResponse.redirect(backTo);

    // Intercambiar code por tokens con la API de Canva
    const redirectUri = `${appUrl}/api/auth/canva-callback`;
    const { accessToken, refreshToken, expiresIn } =
      await CanvaProvider.exchangeCodeForToken(code, redirectUri);

    const expiresAt      = new Date(Date.now() + expiresIn * 1000).toISOString();
    const encryptedRefresh = encrypt(refreshToken);

    // Persistir en integration_accounts (provider='canva', capability='design')
    await supabase.from('integration_accounts').upsert(
      {
        agent_id:      agentId,
        portal_email:  resolved.portalEmail,
        provider:      'canva',
        capability:    'design',
        access_token:  accessToken,
        refresh_token: encryptedRefresh,
        expires_at:    expiresAt,
        status:        'active',
        metadata:      {},
      },
      { onConflict: 'agent_id,provider,capability' },
    );

    const successRes = NextResponse.redirect(
      `${appUrl}/portal/${token}/configurar/${agentId}?navi=connected&provider=canva`,
    );
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    console.error('[canva-callback] error:', err);
    return NextResponse.redirect(backTo);
  }
}
