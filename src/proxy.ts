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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Dev bypass: skip auth checks in local development
  if (process.env.NODE_ENV === 'development') return NextResponse.next();

  const host = req.headers.get('host') ?? '';

  // ── Subdomain routing ─────────────────────────────────────────────────────
  if (host === 'api.centinelia.mx') {
    // Only API routes are served from this subdomain
    if (!pathname.startsWith('/api/')) return new NextResponse('Not found', { status: 404 });
    return NextResponse.next();
  }

  if (host === 'app.centinelia.mx') {
    // Root → portal login
    if (pathname === '/') return NextResponse.redirect(new URL('/portal/login', req.url));
    // Landing pages visited from app subdomain → redirect to main domain
    if (!pathname.startsWith('/portal') && !pathname.startsWith('/admin') && !pathname.startsWith('/api')) {
      const url = new URL(req.url);
      url.host = 'centinelia.mx';
      return NextResponse.redirect(url, { status: 301 });
    }
  }

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
  matcher: [
    // Skip Next.js internals and static assets; run on everything else
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)',
  ],
};
