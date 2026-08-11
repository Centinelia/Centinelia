export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { mlAuthUrl } from '@/lib/mercadolibre/auth';
import { issueOAuthState } from '@/lib/oauth/state';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;

  // IDOR check
  const { resolveOrgFromToken } = await import('@/lib/portal/org-token');
  const resolved = await resolveOrgFromToken(token);
  const ag = resolved ? { portal_email: resolved.portalEmail } : null;
  if (auth.portalEmail && ag?.portal_email && auth.portalEmail !== ag.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  // A-D3: nonce + cookie
  const redirect       = NextResponse.redirect('');
  const stateWithNonce = issueOAuthState(redirect, 'ml', token);
  const final          = NextResponse.redirect(mlAuthUrl(stateWithNonce));
  for (const c of redirect.cookies.getAll()) {
    final.cookies.set(c.name, c.value, { path: '/', maxAge: 15 * 60, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  return final;
}
