export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';

// Callback OAuth de Meta / Facebook para Navi.
// State esperado: `${token}::navi-meta::${agentId}[.nonce]`
// Flujo:
//   1. Intercambiar code por token de corta duración.
//   2. Intercambiar short-lived por long-lived (60 días).
//   3. Listar páginas del usuario vía /me/accounts.
//   4. Para cada página con instagram_business_account:
//      obtener @handle y hacer upsert en social_accounts.
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
  const stateCheck = verifyOAuthState(req, 'navi-meta', rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[meta-callback] nonce mismatch:', stateCheck.reason);
    return NextResponse.redirect(`${appUrl}/portal/?navi=csrf_nonce`);
  }

  // Descomponer portalToken en sus partes: token::navi-meta::agentId
  const [token, marker, agentId] = stateCheck.portalToken.split('::');
  if (!token || marker !== 'navi-meta' || !agentId) {
    console.warn('[meta-callback] state malformado:', stateCheck.portalToken);
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

    const redirectUri = `${appUrl}/api/auth/meta-callback`;
    const metaAppId  = process.env.META_APP_ID ?? '';
    const metaSecret = process.env.META_APP_SECRET ?? '';

    // Paso 1: intercambiar code por short-lived user access token
    const shortRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${metaSecret}&code=${code}`,
    );
    const shortJson = await shortRes.json() as Record<string, unknown>;
    if (!shortRes.ok || !shortJson.access_token) {
      console.error('[meta-callback] short token falló:', shortJson);
      return NextResponse.redirect(backTo);
    }
    const shortToken = String(shortJson.access_token);

    // Paso 2: intercambiar short-lived por long-lived (60 días)
    const longRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaSecret}&fb_exchange_token=${shortToken}`,
    );
    const longJson = await longRes.json() as Record<string, unknown>;
    if (!longRes.ok || !longJson.access_token) {
      console.error('[meta-callback] long-lived token falló:', longJson);
      return NextResponse.redirect(backTo);
    }
    const longToken = String(longJson.access_token);

    // Paso 3: listar todas las páginas de Facebook que el usuario otorgó
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${longToken}&fields=id,name,access_token,instagram_business_account`,
    );
    const pagesJson = await pagesRes.json() as Record<string, unknown>;
    const pages     = Array.isArray(pagesJson.data)
      ? (pagesJson.data as Record<string, unknown>[])
      : [];

    // Paso 4: para cada página con cuenta IG Business, obtener handle y hacer upsert
    let connectedCount = 0;
    const expiresAt = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

    for (const page of pages) {
      const igBiz = page.instagram_business_account as Record<string, unknown> | undefined;
      if (!igBiz?.id) continue;

      const igUserId       = String(igBiz.id);
      const pageAccessToken = String(page.access_token ?? '');

      // Obtener @handle de Instagram para el usuario IG Business
      const igInfoRes = await fetch(
        `https://graph.facebook.com/v18.0/${igUserId}?fields=username&access_token=${pageAccessToken}`,
      );
      const igInfo = await igInfoRes.json() as Record<string, unknown>;
      const igUsername = igInfo.username ? String(igInfo.username) : undefined;

      await supabase.from('social_accounts').upsert(
        {
          portal_email:         resolved.portalEmail,
          agent_id:             agentId,
          provider:             'meta_instagram',
          external_account_id:  igUserId,
          external_username:    igUsername,
          page_id:              String(page.id ?? ''),
          // Se almacena el page access token (no el long-lived user token)
          // porque el page token es el que autoriza publicar en nombre de la página
          access_token:         pageAccessToken,
          expires_at:           expiresAt,
          status:               'active',
        },
        { onConflict: 'portal_email,provider,external_account_id' },
      );

      connectedCount++;
    }

    const successRes = NextResponse.redirect(
      `${appUrl}/portal/${token}/configurar/${agentId}?navi=connected&provider=meta&pages=${connectedCount}`,
    );
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    console.error('[meta-callback] error:', err);
    return NextResponse.redirect(backTo);
  }
}
