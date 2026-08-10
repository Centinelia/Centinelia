import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { requiredModuleForPath } from '@/lib/portal/modules';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

const ADMIN_COOKIE = 'Centinelia_admin';

// CSRF protection: mutating requests to authenticated routes must originate
// from one of our own hosts. Third-party JS calling us from another origin
// will send its own Origin header and be rejected here. Webhooks, tools
// called by external systems (Vapi, Stripe, Twilio, OAuth providers) either
// live outside these paths or don't send an Origin header, so they pass.
const ALLOWED_ORIGINS = new Set([
  'https://centinelia.mx',
  'https://www.centinelia.mx',
  'https://app.centinelia.mx',
  'https://api.centinelia.mx',
]);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isCsrfViolation(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) return false;
  const path = req.nextUrl.pathname;
  // Only enforce for cookie-authenticated APIs
  if (!path.startsWith('/api/portal') && !path.startsWith('/api/admin')) return false;
  const origin = req.headers.get('origin');
  // No Origin header → not a browser request (curl / server-to-server). Skip.
  if (!origin) return false;
  return !ALLOWED_ORIGINS.has(origin);
}

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

  // CSRF: reject mutating requests coming from other origins.
  if (isCsrfViolation(req)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

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

    // Legacy token redirect: si el token en URL es un voice_agents.portal_token
    // legacy (UUID), redirect 301 al nuevo organizations.portal_token (12 chars).
    // También mapea segmentos de path legacy (agentes → empleados, usuarios → equipo)
    // para bookmarks/emails viejos.
    const m = pathname.match(/^\/portal\/([^/]+)(\/.*)?$/);
    if (m) {
      const urlToken = m[1];
      let   rest     = m[2] ?? '';
      const resolved = await resolveOrgFromToken(urlToken);
      // Rename de paths viejos (aplica también con org token puro)
      rest = rest.replace(/^\/agentes(\/|$)/,  '/empleados$1')
                 .replace(/^\/usuarios(\/|$)/, '/equipo$1');
      if (resolved?.legacy || rest !== (m[2] ?? '')) {
        const targetToken = resolved?.orgToken ?? urlToken;
        const url         = req.nextUrl.clone();
        url.pathname      = `/portal/${targetToken}${rest}`;
        if (url.pathname !== pathname) {
          return NextResponse.redirect(url, 301);
        }
      }
    }

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

    // Sub-user module gating: block direct URL navigation to routes they don't have access to.
    // Owners (isSubUser=false) bypass; owner-only routes (e.g. /usuarios) redirect sub-users out.
    if (session.isSubUser) {
      const required = requiredModuleForPath(pathname);
      if (required === '__owner_only__') {
        const token   = pathname.split('/')[2];
        const url     = req.nextUrl.clone();
        url.pathname  = `/portal/${token}`;
        url.search    = '?tab=inicio';
        return NextResponse.redirect(url);
      }
      if (required && required !== '__owner_only__') {
        const userModules = session.modules ?? [];
        // required puede ser string (uno requerido) o string[] (OR: cualquiera basta)
        const allowed = Array.isArray(required)
          ? required.some(m => userModules.includes(m))
          : userModules.includes(required);
        if (!allowed) {
          const token   = pathname.split('/')[2];
          const url     = req.nextUrl.clone();
          url.pathname  = `/portal/${token}`;
          url.search    = '?tab=inicio';
          return NextResponse.redirect(url);
        }
      }
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
