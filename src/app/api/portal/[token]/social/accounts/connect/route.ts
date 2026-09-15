export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { requireSocialFeature } from '@/lib/feature-flags/social-publishing';
import { issueOAuthState } from '@/lib/oauth/state';

interface Params { params: Promise<{ token: string }> }

// Inicia OAuth social per-agent para Canva o Meta.
// Requiere ?provider=canva|meta&agentId=<uuid>.
// Codifica agentId + provider en el state (formato `${token}::navi-${provider}::${agentId}`)
// para que el callback sepa a qué meerkat asignar los tokens.
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const provider = req.nextUrl.searchParams.get('provider');
  const agentId  = req.nextUrl.searchParams.get('agentId');

  if (provider !== 'canva' && provider !== 'meta') {
    return NextResponse.json({ error: 'Proveedor no válido' }, { status: 400 });
  }
  if (!agentId) {
    return NextResponse.json({ error: 'agentId requerido' }, { status: 400 });
  }

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // Gate de sesión — el usuario autenticado debe pertenecer a este portal
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Feature flag gate — la org debe tener social_publishing habilitado
  const feat = await requireSocialFeature(resolved.portalEmail);
  if (!feat.enabled) {
    return NextResponse.json({ error: 'Publicación social no habilitada para esta organización' }, { status: 403 });
  }

  // Gate IDOR — el agentId debe pertenecer al org del token
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('id', agentId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();
  if (!agent) {
    return NextResponse.json({ error: 'Empleado no válido para este portal' }, { status: 403 });
  }

  const oauthProvider = provider === 'canva' ? 'navi-canva' : 'navi-meta';
  const portalTokenPayload = `${token}::navi-${provider}::${agentId}`;
  const oauth = issueOAuthState(oauthProvider, portalTokenPayload);

  const redirectUri = `${appUrl}/api/auth/${provider}-callback`;

  let providerAuthUrl: string;
  if (provider === 'canva') {
    const scopes = 'design:content:read design:content:write asset:read asset:write brandtemplate:content:read brandtemplate:meta:read profile:read';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     process.env.CANVA_CLIENT_ID ?? '',
      redirect_uri:  redirectUri,
      scope:         scopes,
      state:         oauth.state,
    });
    providerAuthUrl = `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
  } else {
    // Meta / Facebook OAuth
    const scopes = 'instagram_content_publish,instagram_manage_comments,instagram_manage_insights,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata,business_management';
    const params = new URLSearchParams({
      client_id:     process.env.META_APP_ID ?? '',
      redirect_uri:  redirectUri,
      scope:         scopes,
      state:         oauth.state,
      response_type: 'code',
    });
    providerAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  const response = NextResponse.redirect(providerAuthUrl);
  response.cookies.set(oauth.cookieName, oauth.cookieValue, oauth.cookieOptions);
  return response;
}
