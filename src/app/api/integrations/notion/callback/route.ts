import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state'); // portal_token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=error`);
  }

  // Exchange code for access token
  const clientId     = process.env.NOTION_CLIENT_ID!;
  const clientSecret = process.env.NOTION_CLIENT_SECRET!;
  const redirectUri  = process.env.NOTION_REDIRECT_URI!;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res   = await fetch('https://api.notion.com/v1/oauth/token', {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=error`);
  }

  const data = await res.json();
  const { access_token, workspace_id, workspace_name } = data;

  // Store token for all agents in this account
  const supabase = createAdminClient();
  const { resolveOrgFromToken } = await import('@/lib/portal/org-token');
  const resolved = await resolveOrgFromToken(state);
  if (!resolved) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=error`);
  }

  // CSRF gate — sesión del portal debe matchear el state.portalEmail.
  // Ver Scope C3 MEDIUM.
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session || session.portalEmail !== resolved.portalEmail) {
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=csrf`);
  }

  const agent = { portal_email: resolved.portalEmail };

  // Notion es org-level: escribimos en organizations, no en voice_agents.
  // El campo notion_workspace_id se dejó en la tabla organizations legacy o
  // se ignora — usamos workspace_name como identificador visible.
  await supabase
    .from('organizations')
    .upsert({
      portal_email:          agent.portal_email,
      notion_access_token:   access_token,
      notion_workspace_name: workspace_name,
      notion_db_id:          null, // clear existing DB so user picks a new page
      notion_products_db_id: null,
    }, { onConflict: 'portal_email' });

  return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&notion=connected`);
}
