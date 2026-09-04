export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { googleAuthUrl, GOOGLE_SCOPES } from '@/lib/email/gmail';
import { microsoftAuthUrl, MICROSOFT_SCOPES } from '@/lib/email/outlook';
import { issueOAuthState } from '@/lib/oauth/state';

interface Params { params: Promise<{ token: string }> }

// Inicia OAuth per-agent para Google Drive / OneDrive.
// Requiere ?provider=google|microsoft&agentId=<uuid>.
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = req.nextUrl.searchParams.get('provider') as 'google' | 'microsoft' | null;
  const agentId  = req.nextUrl.searchParams.get('agentId');
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (!agentId) {
    return NextResponse.json({ error: 'agentId requerido' }, { status: 400 });
  }

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

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

  const oauthProvider = provider === 'google' ? 'google-drive' : 'microsoft-drive';
  const oauth = issueOAuthState(oauthProvider, `${token}::agent-storage::${agentId}`);
  const url = provider === 'google'
    ? googleAuthUrl(oauth.state, GOOGLE_SCOPES.drive, 'storage-callback/google')
    : microsoftAuthUrl(oauth.state, MICROSOFT_SCOPES.drive, 'storage-callback/microsoft');

  const final = NextResponse.redirect(url);
  final.cookies.set(oauth.cookieName, oauth.cookieValue, oauth.cookieOptions);
  return final;
}
