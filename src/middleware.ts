import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

const ADMIN_COOKIE = 'Centinelia_admin';

// Constant-time comparison for Edge runtime (no Node.js crypto available)
function adminTokenValid(token: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET ?? '';
  const a = token ?? '';
  const len = Math.max(a.length, secret.length);
  let diff = a.length ^ secret.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (secret.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin API routes (return JSON, no redirect) ───────────────────────────
  if (pathname.startsWith('/api/admin')) {
    if (pathname === '/api/admin/auth') return NextResponse.next();
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!adminTokenValid(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Admin UI routes ────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!adminTokenValid(token)) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Portal routes ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/portal')) {
    if (pathname === '/portal/login') return NextResponse.next();
    if (/^\/portal\/[^/]+\/setup$/.test(pathname)) return NextResponse.next();

    // Dev bypass: skip auth checks in local development
    if (process.env.NODE_ENV === 'development') return NextResponse.next();

    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = cookie ? await verifySession(cookie) : null;

    if (!session) {
      const urlToken = pathname.split('/')[2];
      if (urlToken && urlToken !== 'login') {
        const url = req.nextUrl.clone();
        url.pathname = `/portal/${urlToken}/setup`;
        return NextResponse.redirect(url);
      }
      const url = req.nextUrl.clone();
      url.pathname = '/portal/login';
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/portal/:path*'],
};
