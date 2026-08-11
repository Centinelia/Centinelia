// Forgot-password: confirma OTP + escribe nuevo password_hash. Análogo a
// /auth/setup pero acepta reset sobre una cuenta ya registrada (mientras
// /setup rechaza con 409 already_registered).
// Ver Scope D2 HIGH-4.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword, createSession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { verifySetupCode }     from '@/lib/portal/setup-otp';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { token, code, password } = await req.json() as {
    token?: string; code?: string; password?: string;
  };

  if (!token || !code || !password)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Link inválido' }, { status: 404 });

  const check = await verifySetupCode(resolved.portalEmail, code);
  if (!check.ok) {
    const msg = {
      no_code:           'Solicita un código primero',
      expired:           'El código expiró. Solicita uno nuevo',
      too_many_attempts: 'Demasiados intentos. Solicita un código nuevo',
      invalid:           'Código incorrecto',
    }[check.reason];
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hash     = await hashPassword(password);

  // Single source of truth: organizations. Legacy voice_agents.portal_password_hash
  // se limpia (SET NULL) para prevenir el bug de dual-write (ver setup/page.tsx).
  const { error: orgErr } = await supabase
    .from('organizations')
    .update({ portal_password_hash: hash })
    .eq('portal_email', resolved.portalEmail);
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  await supabase
    .from('voice_agents')
    .update({ portal_password_hash: null })
    .eq('portal_email', resolved.portalEmail);

  const sessionValue = await createSession(resolved.portalEmail);
  const res = NextResponse.json({ ok: true, token: resolved.orgToken });
  res.cookies.set(PORTAL_COOKIE, sessionValue, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60,
  });
  return res;
}
