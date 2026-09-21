import { NextResponse } from 'next/server';
import { checkThrottle } from '@/lib/landing/callback-throttle';
import { createRequest } from '@/lib/landing/callback-store';
import { sendOtp } from '@/lib/landing/otp-sms';
import { notifyOwnerNewLead } from '@/lib/landing/notify-owner';

// Telefono mexicano de 10 digitos (sin cero inicial, sin codigo de pais).
const MX_PHONE_RE = /^[1-9]\d{9}$/;

const INDUSTRIES = [
  'tortilleria_abarrotes',
  'construccion',
  'despacho_contable',
  'servicios_profesionales',
  'otro',
] as const;

function extractIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
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
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  if (typeof b.industry !== 'string' || !(INDUSTRIES as readonly string[]).includes(b.industry)) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const ip = extractIp(req);
  const throttle = await checkThrottle({ ip, phone: b.phone });
  if (!throttle.allowed) {
    return NextResponse.json({ ok: false, error: throttle.reason }, { status: 429 });
  }

  const { id: requestId } = await createRequest({
    phone:     b.phone,
    industry:  b.industry as string,
    ip,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  await sendOtp(requestId, b.phone);
  await notifyOwnerNewLead({ requestId, phone: b.phone, industry: b.industry as string });

  return NextResponse.json({ ok: true, requestId });
}
