import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

const ADMIN_COOKIE = 'Centinelia_admin';

function adminTokenValid(token: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!token || !secret) return false;
  const bufA = Buffer.from(token);
  const bufB = Buffer.from(secret);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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
