import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { issueOAuthState } from '@/lib/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { token } = await params;
    const supabase  = createAdminClient();

    const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
    if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (session.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const clientId = process.env.INTUIT_CLIENT_ID;
    if (!clientId) {
      console.error('QB connect: INTUIT_CLIENT_ID not set');
      return NextResponse.json({ error: 'QB not configured' }, { status: 500 });
    }

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const redirectUri = `${appUrl}/api/qb-oauth/callback`;

    // D-Q4: nonce en state URL + cookie httpOnly. Callback verifica match
    // para prevenir OAuth CSRF donde attacker fabrica un callback con state
    // legítimo pero code propio (para sobrescribir credentials del user).
    const redirect = NextResponse.redirect(''); // placeholder for cookie setter
    const stateWithNonce = issueOAuthState(redirect, 'qb', token);
    const authParams = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'com.intuit.quickbooks.accounting',
      state:         stateWithNonce,
    });

    const final = NextResponse.redirect(
      `https://appcenter.intuit.com/connect/oauth2?${authParams.toString()}`
    );
    // Copiar cookies del redirect placeholder al final
    for (const c of redirect.cookies.getAll()) {
      final.cookies.set(c.name, c.value, { path: '/', maxAge: 15 * 60, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    }
    return final;
  } catch (err) {
    console.error('QB connect: unexpected error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
