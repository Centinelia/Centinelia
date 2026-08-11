/**
 * D-L2: crea invite + envía email al sub-user con link a /portal/join/{invite}.
 * Reemplaza (opt-in) el POST /users legacy que aceptaba password plaintext.
 * Ver Scope D3 R-3.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortalAccess } from '@/lib/portal/access';
import { resolveOrgFromToken, getOrgToken } from '@/lib/portal/org-token';
import { sendEmail, shell, heading, badge, btn, infoCard, sectionLabel } from '@/lib/email/send';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { randomBytes } from 'crypto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { token } = await params;
  // Owner-only (o sub-user con módulo usuarios). No permitir sub-user con
  // solo 'inicio' que invite y escale su propio nivel de acceso.
  const gate = await requirePortalAccess(req, { module: 'usuarios' });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const resolved = await resolveOrgFromToken(token);
  if (!resolved || resolved.portalEmail !== session.portalEmail) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const body = await req.json() as { email?: string; name?: string; modules?: string[] };
  const email = (body.email ?? '').toLowerCase().trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Correo con formato inválido.' }, { status: 400 });
  }
  if (email === resolved.portalEmail) {
    return NextResponse.json({ error: 'No puedes invitar al propietario.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verificar que no exista ya un sub-user activo con ese email.
  const { data: existing } = await supabase
    .from('portal_users')
    .select('id')
    .eq('account_id', resolved.portalEmail)
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese correo.' }, { status: 409 });
  }

  // Invalidar invites previos no usados del mismo email (evita link duplicado).
  await supabase
    .from('portal_user_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('account_id', resolved.portalEmail)
    .eq('email', email)
    .is('used_at', null);

  const inviteToken = randomBytes(24).toString('base64url');
  const expiresAt   = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error: insertErr } = await supabase.from('portal_user_invites').insert({
    token:      inviteToken,
    account_id: resolved.portalEmail,
    email,
    name:       body.name?.trim() || null,
    modules:    body.modules ?? [],
    expires_at: expiresAt,
    created_by: session.userId ?? null,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const orgToken = await getOrgToken(resolved.portalEmail, supabase) ?? token;
  const joinUrl  = `${appUrl}/portal/join/${inviteToken}`;

  const html = shell(
    badge('Invitación al equipo', '#9B6DFF') +
    heading('Te invitaron a Centinelia') +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">
      El equipo de <b>${resolved.portalEmail}</b> te invitó a colaborar en su portal Centinelia. Haz click abajo para elegir tu contraseña y entrar. El link expira en 7 días.
    </p>` +
    btn('Aceptar invitación →', joinUrl) +
    `<div style="height:16px"></div>` +
    infoCard(`
      ${sectionLabel('Cómo funciona')}
      <p style="color:#C8BEE8;font-size:13px;line-height:1.8;margin:0">
        1. Aceptas la invitación con este link<br>
        2. Eliges tu propia contraseña (nunca la sabrá el dueño)<br>
        3. Accedes al portal con los permisos que te asignaron
      </p>
    `, true) +
    `<p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:16px 0 0">
      Si no reconoces esta invitación, ignora este correo — el link no funciona sin tu email registrado.
    </p>`
  );

  const ok = await sendEmail({
    to:      email,
    subject: `Invitación a Centinelia (${resolved.portalEmail})`,
    html,
  });
  if (!ok) {
    return NextResponse.json({ error: 'No se pudo enviar la invitación por correo.' }, { status: 500 });
  }

  void orgToken;
  return NextResponse.json({ ok: true, email, expires_at: expiresAt });
}
