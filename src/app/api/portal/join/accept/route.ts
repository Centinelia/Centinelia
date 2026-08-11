/**
 * D-L2: acepta invite + crea portal_users + set session. Sub-user llega aquí
 * desde /portal/join/{token} tras invite del owner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword, createSubUserSession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { getOrgToken } from '@/lib/portal/org-token';

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { invite_token, password } = await req.json() as { invite_token?: string; password?: string };
  if (!invite_token || !password) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: invite } = await supabase
    .from('portal_user_invites')
    .select('token, account_id, email, name, modules, expires_at, used_at')
    .eq('token', invite_token)
    .maybeSingle() as { data: {
      token: string; account_id: string; email: string; name: string | null;
      modules: string[]; expires_at: string; used_at: string | null;
    } | null };

  if (!invite) return NextResponse.json({ error: 'Invitación inválida o expirada.' }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: 'Esta invitación ya se usó.' }, { status: 409 });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Invitación expirada. Pide una nueva al dueño.' }, { status: 410 });
  }

  // Verificar de nuevo que no exista sub-user (race con owner que también
  // creó el sub-user por el flow legacy /users POST).
  const { data: existing } = await supabase
    .from('portal_users')
    .select('id')
    .eq('account_id', invite.account_id)
    .eq('email', invite.email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Ya existe una cuenta con este correo. Usa "Iniciar sesión".' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const { data: created, error: insErr } = await supabase.from('portal_users').insert({
    account_id:    invite.account_id,
    email:         invite.email,
    name:          invite.name,
    password_hash: passwordHash,
    modules:       invite.modules,
    is_owner:      false,
  }).select('id, email, name, modules').single();

  if (insErr || !created) {
    if (insErr?.code === '23505') return NextResponse.json({ error: 'Ya existe una cuenta con este correo.' }, { status: 409 });
    return NextResponse.json({ error: insErr?.message ?? 'No se pudo crear la cuenta.' }, { status: 500 });
  }

  await supabase
    .from('portal_user_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token', invite_token);

  // Sync a directorio interno de la org (mismo patrón que POST /users).
  const { upsertPortalUserInDirectory } = await import('@/lib/portal/directory');
  await upsertPortalUserInDirectory(invite.account_id, created.id as string, (created.name as string | null) ?? null, supabase);

  const sessionValue = await createSubUserSession(invite.account_id, created.id as string, (created.modules as string[]) ?? []);
  const orgToken     = await getOrgToken(invite.account_id, supabase);

  const res = NextResponse.json({ ok: true, token: orgToken, user: created });
  res.cookies.set(PORTAL_COOKIE, sessionValue, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60,
  });
  return res;
}
