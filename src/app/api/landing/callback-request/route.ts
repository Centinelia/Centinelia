import { NextResponse } from 'next/server';
import { checkThrottle } from '@/lib/landing/callback-throttle';
import { createRequest } from '@/lib/landing/callback-store';
import { sendOtp } from '@/lib/landing/otp-sms';
import { notifyOwnerNewLead } from '@/lib/landing/notify-owner';

// Teléfono mexicano de 10 dígitos (sin cero inicial, sin código de país).
const MX_PHONE_RE = /^[1-9]\d{9}$/;

// Longitudes mín/máx de los campos de contexto del demo.
// El máx se aplica también en el wrapper Vapi (sanitizeUserField) por defensa
// en profundidad. Aquí sirve para rechazar payloads obviamente inválidos temprano.
const MIN_ORG_NAME_LEN = 2;
const MAX_ORG_NAME_LEN = 200;
const MIN_TEXT_LEN     = 3;
const MAX_TEXT_LEN     = 400;

function extractIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

function validText(v: unknown, min: number, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const b = body as Record<string, unknown> | null;
  if (!b || b.consent !== true) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (typeof b.phone !== 'string' || !MX_PHONE_RE.test(b.phone)) {
    return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 });
  }

  const orgName        = validText(b.org_name,        MIN_ORG_NAME_LEN, MAX_ORG_NAME_LEN);
  const orgDescription = validText(b.org_description, MIN_TEXT_LEN,     MAX_TEXT_LEN);
  const expectation    = validText(b.expectation,     MIN_TEXT_LEN,     MAX_TEXT_LEN);

  if (!orgName || !orgDescription || !expectation) {
    return NextResponse.json({ ok: false, error: 'invalid_context' }, { status: 400 });
  }

  const ip = extractIp(req);
  const throttle = await checkThrottle({ ip, phone: b.phone });
  if (!throttle.allowed) {
    return NextResponse.json({ ok: false, error: throttle.reason }, { status: 429 });
  }

  const { id: requestId } = await createRequest({
    phone:          b.phone,
    orgName,
    orgDescription,
    expectation,
    ip,
    userAgent:      req.headers.get('user-agent') ?? null,
  });

  // sendOtp + notifyOwnerNewLead en try/catch permissive: si Twilio o SMTP
  // fallan, el lead queda registrado y el frontend puede avanzar con warning.
  let otpDeliveryFailed = false;
  try {
    await sendOtp(requestId, b.phone);
  } catch (err) {
    console.error('[callback-request] sendOtp fallo:', err);
    otpDeliveryFailed = true;
  }
  try {
    await notifyOwnerNewLead({ requestId, phone: b.phone, orgName, orgDescription, expectation });
  } catch (err) {
    console.error('[callback-request] notifyOwnerNewLead fallo:', err);
  }

  return NextResponse.json({
    ok:        true,
    requestId,
    warning:   otpDeliveryFailed ? 'otp_delivery_delayed' : undefined,
  });
}
