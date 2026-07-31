import { NextRequest, NextResponse } from 'next/server';
import { timingSafeCompareStrings } from '@/lib/auth/cron-auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_SECRET;

  if (!password || !expected || !timingSafeCompareStrings(String(password), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('Centinelia_admin', process.env.ADMIN_SECRET!, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,
    path:     '/',
    domain:   process.env.NODE_ENV === 'production' ? '.centinelia.mx' : undefined,
  });
  return res;
}
