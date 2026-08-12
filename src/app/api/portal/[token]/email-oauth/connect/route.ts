export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { gmailAuthUrl }   from '@/lib/email/gmail';
import { outlookAuthUrl } from '@/lib/email/outlook';
import { issueOAuthState } from '@/lib/oauth/state';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const provider = req.nextUrl.searchParams.get('provider') as 'gmail' | 'outlook' | null;
  if (provider !== 'gmail' && provider !== 'outlook') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // IDOR check + mutual exclusion (Gmail xor Outlook, never both)
  {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { resolveOrgFromToken } = await import('@/lib/portal/org-token');
    const supabase = createAdminClient();
    const resolved = await resolveOrgFromToken(token);
    const ag = resolved ? { portal_email: resolved.portalEmail } : null;
    if (session.portalEmail && ag?.portal_email && session.portalEmail !== ag.portal_email)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const other = provider === 'gmail' ? 'outlook' : 'gmail';
    if (ag?.portal_email) {
      const { data: existing } = await supabase
        .from('integration_accounts')
        .select('id')
        .eq('portal_email', ag.portal_email)
        .eq('capability', 'email')
        .eq('provider', other)
        .neq('status', 'disconnected')
        .maybeSingle();
      if (existing) {
        return NextResponse.redirect(new URL(`/portal/${token}?oauth_error=email_provider_conflict`, req.url));
      }
    }
  }

  // scope=agent → per-agent connect from configurar page; encodes in state.
  // A-D3: nonce en cookie httpOnly. Formato: `${baseToken}${scopeSuffix}.${nonce}`
  const scope     = req.nextUrl.searchParams.get('scope');
  const baseToken = scope === 'agent' ? `${token}__agent` : token;
  const oauth     = issueOAuthState(provider, baseToken);
  const url = provider === 'gmail'
    ? gmailAuthUrl(oauth.state)
    : outlookAuthUrl(oauth.state);
  const final = NextResponse.redirect(url);
  final.cookies.set(oauth.cookieName, oauth.cookieValue, oauth.cookieOptions);
  return final;
}
