import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

// Notificaciones: Nazre / equipo Centinelia.
const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? 'hola@centinelia.mx';
const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP ?? '';

interface Body {
  business_name?:        string;
  contact_name?:         string;
  contact_email?:        string;
  contact_whatsapp?:     string | null;
  rol_imaginado?:        string;
  funciones_esperadas?:  string;
  tono_deseado?:         string | null;
  integraciones?:        string[];
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json() as Body; }
  catch { return NextResponse.json({ error: 'Body invalido.' }, { status: 400 }); }

  const business_name       = (body.business_name       ?? '').trim();
  const contact_name        = (body.contact_name        ?? '').trim();
  const contact_email       = (body.contact_email       ?? '').trim();
  const contact_whatsapp    = (body.contact_whatsapp    ?? '').trim() || null;
  const rol_imaginado       = (body.rol_imaginado       ?? '').trim();
  const funciones_esperadas = (body.funciones_esperadas ?? '').trim();
  const tono_deseado        = body.tono_deseado || null;
  const integraciones       = Array.isArray(body.integraciones) ? body.integraciones.filter(x => typeof x === 'string') : [];

  // Validaciones minimas
  if (!business_name)       return NextResponse.json({ error: 'Falta nombre del negocio.' },  { status: 400 });
  if (!contact_name)        return NextResponse.json({ error: 'Falta tu nombre.' },           { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(contact_email))
                            return NextResponse.json({ error: 'Correo no valido.' },          { status: 400 });
  if (!rol_imaginado)       return NextResponse.json({ error: 'Describe el rol imaginado.' }, { status: 400 });
  if (!funciones_esperadas) return NextResponse.json({ error: 'Describe qué haria el empleado.' }, { status: 400 });

  // Guardar en DB
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('role_requests').insert({
    business_name, contact_name, contact_email, contact_whatsapp,
    rol_imaginado, funciones_esperadas, tono_deseado, integraciones,
    fuente: 'pedir_rol_form',
  }).select('id').single();

  if (error) {
    console.error('role_requests insert error:', error);
    return NextResponse.json({ error: 'No pudimos guardar tu solicitud. Intenta de nuevo.' }, { status: 500 });
  }

  // Notificar al owner (fire-and-forget, no bloquea la respuesta al usuario)
  const requestId = data?.id ?? 'unknown';

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #FAFBFF; color: #1A0A3B;">
      <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid rgba(108,59,255,0.12);">
        <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6C3BFF; margin: 0 0 12px;">Solicitud de rol nuevo</p>
        <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 24px; line-height: 1.2;">${escapeHtml(rol_imaginado)}</h1>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr><td style="padding: 8px 0; font-size: 12px; color: rgba(26,10,59,0.55); width: 130px;">Negocio</td><td style="padding: 8px 0; font-size: 13px; color: #1A0A3B; font-weight: 600;">${escapeHtml(business_name)}</td></tr>
          <tr><td style="padding: 8px 0; font-size: 12px; color: rgba(26,10,59,0.55);">Contacto</td><td style="padding: 8px 0; font-size: 13px; color: #1A0A3B;">${escapeHtml(contact_name)} · <a href="mailto:${escapeHtml(contact_email)}" style="color: #6C3BFF; text-decoration: none;">${escapeHtml(contact_email)}</a></td></tr>
          ${contact_whatsapp ? `<tr><td style="padding: 8px 0; font-size: 12px; color: rgba(26,10,59,0.55);">WhatsApp</td><td style="padding: 8px 0; font-size: 13px; color: #1A0A3B;">${escapeHtml(contact_whatsapp)}</td></tr>` : ''}
          ${tono_deseado ? `<tr><td style="padding: 8px 0; font-size: 12px; color: rgba(26,10,59,0.55);">Tono</td><td style="padding: 8px 0; font-size: 13px; color: #1A0A3B;">${escapeHtml(tono_deseado)}</td></tr>` : ''}
          ${integraciones.length ? `<tr><td style="padding: 8px 0; font-size: 12px; color: rgba(26,10,59,0.55); vertical-align: top;">Integraciones</td><td style="padding: 8px 0; font-size: 13px; color: #1A0A3B;">${integraciones.map(escapeHtml).join(' · ')}</td></tr>` : ''}
        </table>

        <div style="border-top: 1px solid rgba(108,59,255,0.12); padding-top: 20px;">
          <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(26,10,59,0.55); margin: 0 0 10px;">Que haria dia a dia</p>
          <p style="font-size: 13px; line-height: 1.65; color: #1A0A3B; white-space: pre-wrap; margin: 0;">${escapeHtml(funciones_esperadas)}</p>
        </div>

        <p style="font-size: 11px; color: rgba(26,10,59,0.4); margin: 24px 0 0;">
          ID: <code>${requestId}</code>
        </p>
      </div>
    </div>
  `.trim();

  // Notificaciones (no await — no bloqueamos la respuesta al usuario)
  void sendEmail({
    to:      OWNER_EMAIL,
    subject: `Nuevo rol pedido: ${rol_imaginado} — ${business_name}`,
    html:    emailHtml,
    replyTo: contact_email,
  });

  if (OWNER_WHATSAPP) {
    const waBody = [
      'Nuevo rol pedido:',
      `> ${rol_imaginado}`,
      '',
      `De: ${contact_name} (${business_name})`,
      `Email: ${contact_email}`,
      contact_whatsapp ? `WA: ${contact_whatsapp}` : null,
      '',
      `Funciones: ${funciones_esperadas.slice(0, 220)}${funciones_esperadas.length > 220 ? '...' : ''}`,
    ].filter(Boolean).join('\n');
    void sendWhatsApp(OWNER_WHATSAPP, waBody);
  }

  return NextResponse.json({ ok: true, id: requestId });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
