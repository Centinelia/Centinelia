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
    // No revelamos si el token existe o no — misma respuesta para todos.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { code, expiresAt } = await issueSetupCode(resolved.portalEmail);

  const html = shell(
    badge('Código de acceso', '#9B6DFF') +
    heading('Confirma que eres tú') +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">
      Usa este código para completar el registro de tu portal Centinelia.
      Vence en 15 minutos y solo puede usarse una vez.
    </p>` +
    infoCard(`
      ${sectionLabel('Tu código')}
      <p style="color:#F1EEFF;font-size:36px;font-weight:800;letter-spacing:0.25em;margin:0;text-align:center;font-family:Menlo,Monaco,Consolas,monospace">${code}</p>
    `, true) +
    `<p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:16px 0 0">
      Si no fuiste tú quien inició este registro, ignora este correo.
      Nadie puede completar el setup sin este código.
    </p>`
  );

  const ok = await sendEmail({
    to:      resolved.portalEmail,
    subject: `Tu código Centinelia: ${code}`,
    html,
  });

  if (!ok) {
    return NextResponse.json({ error: 'No se pudo enviar el código' }, { status: 500 });
  }

  return NextResponse.json({
    ok:            true,
    expiresAt:     expiresAt.toISOString(),
  });
}
