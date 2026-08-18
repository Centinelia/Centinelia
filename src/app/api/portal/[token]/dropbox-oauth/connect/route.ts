export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { dropboxAuthUrl } from '@/lib/dropbox/oauth';
import { issueOAuthState } from '@/lib/oauth/state';

interface Params { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // IDOR check
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { resolveOrgFromToken } = await import('@/lib/portal/org-token');
  const _supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (session.portalEmail && resolved?.portalEmail && session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const oauth = issueOAuthState('dropbox', token);
  const url = dropboxAuthUrl(oauth.state);
  const final = NextResponse.redirect(url);
  final.cookies.set(oauth.cookieName, oauth.cookieValue, oauth.cookieOptions);
  return final;
}
