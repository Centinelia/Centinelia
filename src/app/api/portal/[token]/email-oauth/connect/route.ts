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
  // A-D3: además nonce en cookie httpOnly. Formato final:
  //   state = `${baseToken}${scopeSuffix}.${nonce}`
  // El callback extrae con verifyOAuthState (que hace split por '.') → deja
  // baseToken+__agent como portalToken retornado.
  const scope     = req.nextUrl.searchParams.get('scope');
  const baseToken = scope === 'agent' ? `${token}__agent` : token;
  const redirect  = NextResponse.redirect(''); // placeholder para cookie
  const stateWithNonce = issueOAuthState(redirect, provider, baseToken);
  const url = provider === 'gmail'
    ? gmailAuthUrl(stateWithNonce)
    : outlookAuthUrl(stateWithNonce);
  const final = NextResponse.redirect(url);
  for (const c of redirect.cookies.getAll()) {
    final.cookies.set(c.name, c.value, { path: '/', maxAge: 15 * 60, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  return final;
}
