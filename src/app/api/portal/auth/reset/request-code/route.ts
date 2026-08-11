// Forgot-password: emite OTP para reset (misma mecánica que setup, distinto copy).
// ANTES: no había forgot-password. User olvidaba password → contacto hola@centinelia.mx.
// Ver Scope D2 HIGH-4.
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, limiters }        from '@/lib/ratelimit';
import { resolveOrgFromToken }        from '@/lib/portal/org-token';
import { issueSetupCode }             from '@/lib/portal/setup-otp';
import { sendEmail, shell, heading, badge, infoCard, sectionLabel } from '@/lib/email/send';

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, limiters.auth);
  if (limited) return limited;

  const { token } = await req.json() as { token?: string };
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) {
    // No revelamos si el token existe o no.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { code, expiresAt } = await issueSetupCode(resolved.portalEmail);

  const html = shell(
    badge('Restablecer contraseña', '#FF6B6B') +
    heading('Elige una nueva contraseña') +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">
      Alguien pidió restablecer la contraseña de tu portal Centinelia. Usa este
      código para elegir una nueva. Vence en 15 minutos y solo puede usarse una vez.
    </p>` +
    infoCard(`
      ${sectionLabel('Tu código')}
      <p style="color:#F1EEFF;font-size:36px;font-weight:800;letter-spacing:0.25em;margin:0;text-align:center;font-family:Menlo,Monaco,Consolas,monospace">${code}</p>
    `, true) +
    `<p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:16px 0 0">
      Si no fuiste tú, ignora este correo — nadie puede cambiar tu contraseña sin este código.
    </p>`
  );

  const ok = await sendEmail({
    to:      resolved.portalEmail,
    subject: `Restablecer contraseña Centinelia: ${code}`,
    html,
  });

  if (!ok) {
    return NextResponse.json({ error: 'No se pudo enviar el código' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
}
