import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPassword, createSession, createSubUserSession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { rateLimit, limiters } from '@/lib/ratelimit';

const COOKIE_OPTS = (res: NextResponse, value: string) =>
  res.cookies.set(PORTAL_COOKIE, value, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7,
    domain:   process.env.NODE_ENV === 'production' ? '.centinelia.mx' : undefined,
  });

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { email, password } = await req.json() as { email?: string; password?: string };
  if (!email || !password) return NextResponse.json({ error: 'Credenciales requeridas' }, { status: 400 });

  const supabase        = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  // ── 1. Check portal_users (sub-users + owner mirrors) ───────────────────
  const { data: subUser } = await supabase
    .from('portal_users')
    .select('id, account_id, password_hash, modules, is_owner, agent_ids')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (subUser?.password_hash) {
    const ok = await verifyPassword(password, subUser.password_hash);
    if (!ok) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });

    // Route al portal — devolvemos el org token corto (canonical URL post-migración).
    const { data: org } = await supabase
      .from('organizations').select('portal_token').eq('portal_email', subUser.account_id).maybeSingle();
    if (!org?.portal_token)
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

    const sessionToken = subUser.is_owner
      ? await createSession(subUser.account_id)
      : await createSubUserSession(subUser.account_id, subUser.id, subUser.modules ?? []);

    const res = NextResponse.json({ token: org.portal_token });
    COOKIE_OPTS(res, sessionToken);
    return res;
  }

  // ── 2. Fall back to organizations owner login ────────────────────────────
  // Fuente de verdad ahora es organizations.portal_password_hash (org-level).
  // Fallback a voice_agents.portal_password_hash por retrocompat con orgs
  // creados antes del backfill.
  const { data: org } = await supabase
    .from('organizations')
    .select('portal_token, portal_password_hash')
    .eq('portal_email', normalizedEmail)
    .maybeSingle();

  let passwordHash: string | null = (org as { portal_password_hash?: string | null } | null)?.portal_password_hash ?? null;
  if (!passwordHash) {
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('portal_password_hash')
      .eq('portal_email', normalizedEmail)
      .not('portal_password_hash', 'is', null)
      .limit(1);
    passwordHash = agents?.[0]?.portal_password_hash ?? null;
  }
  if (!passwordHash)
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });

  const ok = await verifyPassword(password, passwordHash);
  if (!ok) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });

  if (!org?.portal_token)
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

  const sessionToken = await createSession(normalizedEmail);
  const res = NextResponse.json({ token: org.portal_token });
  COOKIE_OPTS(res, sessionToken);
  return res;
}
