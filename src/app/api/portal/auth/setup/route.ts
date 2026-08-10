import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword, createSession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { rateLimit, limiters }   from '@/lib/ratelimit';
import { verifySetupCode }       from '@/lib/portal/setup-otp';
import { resolveOrgFromToken }   from '@/lib/portal/org-token';

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
  if (!resolved)
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 });

  const supabase = createAdminClient();

  // Verificar si ya hay password seteado (org-level primero, fallback voice_agents legacy).
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('portal_password_hash')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { portal_password_hash: string | null } | null };

  let alreadyRegistered = !!orgRow?.portal_password_hash;
  if (!alreadyRegistered) {
    const { data: legacyAgent } = await supabase
      .from('voice_agents')
      .select('portal_password_hash')
      .eq('portal_email', resolved.portalEmail)
      .not('portal_password_hash', 'is', null)
      .limit(1)
      .maybeSingle() as { data: { portal_password_hash: string | null } | null };
    alreadyRegistered = !!legacyAgent?.portal_password_hash;
  }

  if (alreadyRegistered)
    return NextResponse.json({ error: 'already_registered' }, { status: 409 });

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

  const hash = await hashPassword(password);

  // Fuente de verdad: organizations.portal_password_hash. Dual-write a
  // voice_agents.portal_password_hash del primer agente activo por retrocompat
  // con código legacy que aún lee de ahí.
  const { error: orgErr } = await supabase
    .from('organizations')
    .update({ portal_password_hash: hash })
    .eq('portal_email', resolved.portalEmail);
  if (orgErr)
    return NextResponse.json({ error: orgErr.message }, { status: 500 });

  const { data: firstAgent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstAgent?.id) {
    await supabase.from('voice_agents')
      .update({ portal_password_hash: hash })
      .eq('id', firstAgent.id);
  }

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
