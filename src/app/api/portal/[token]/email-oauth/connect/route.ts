export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { gmailAuthUrl }   from '@/lib/email/gmail';
import { outlookAuthUrl } from '@/lib/email/outlook';

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

  // scope=agent → per-agent connect from configurar page; encodes in state so callback knows
  const scope  = req.nextUrl.searchParams.get('scope');
  const state  = scope === 'agent' ? `${token}__agent` : token;

  const url = provider === 'gmail'
    ? gmailAuthUrl(state)
    : outlookAuthUrl(state);

  return NextResponse.redirect(url);
}
