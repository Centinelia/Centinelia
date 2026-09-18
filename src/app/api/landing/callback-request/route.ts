import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';

// Telefono mexicano de 10 digitos (sin cero inicial, sin codigo de pais).
// Acepta numeros locales (area 2-3 digitos + 7-8 digitos = 10 total).
const MX_PHONE_RE = /^[1-9]\d{9}$/;

const INDUSTRIES = [
  'tortilleria_abarrotes',
  'construccion',
  'despacho_contable',
  'servicios_profesionales',
  'otro',
] as const;
type Industry = (typeof INDUSTRIES)[number];

interface Payload {
  phone:    string;
  industry: Industry;
  consent:  true;
}

function validate(body: unknown): Payload | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.consent !== true) return null;
  if (typeof b.phone !== 'string' || !MX_PHONE_RE.test(b.phone)) return null;
  if (
    typeof b.industry !== 'string' ||
    !(INDUSTRIES as readonly string[]).includes(b.industry)
  ) return null;
  return { phone: b.phone, industry: b.industry as Industry, consent: true };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const payload = validate(body);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  // Phase 1: notificar al owner por correo con los datos del lead.
  // Phase 2 disparara OTP + Vapi outbound.
  await sendEmail({
    to:      'nazre20@gmail.com',
    subject: `Nuevo lead landing: ${payload.industry} (${payload.phone})`,
    html:    `<p>Telefono: ${payload.phone}</p><p>Industria: ${payload.industry}</p><p>Consentimiento: si</p>`,
  });

  return NextResponse.json({ ok: true });
}
