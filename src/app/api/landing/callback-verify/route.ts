import { NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/landing/otp-sms';
import { getById } from '@/lib/landing/callback-store';
import { triggerLandingDemoCall } from '@/lib/vapi/landing-demo';
import { notifyOwnerFallback } from '@/lib/landing/notify-owner';

// Horario laboral MX (America/Monterrey). Fuera de rango → fallback manual.
const IN_HOURS_START = 9;
const IN_HOURS_END   = 20;

function currentHourMx(): number {
  const s = new Date().toLocaleString('en-US', {
    timeZone: 'America/Monterrey',
    hour:     'numeric',
    hour12:   false,
  });
  return parseInt(s, 10);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const b = body as Record<string, unknown> | null;
  if (!b || typeof b.requestId !== 'string' || typeof b.code !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  const verified = await verifyOtp(b.requestId, b.code);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 400 });
  }

  const request = await getById(b.requestId);
  if (!request) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // Los 3 campos son NOT NULL en filas del nuevo flow. Si están null, la
  // fila es legacy — no podemos hacer llamada dinámica, sale por fallback.
  const orgName        = request.org_name;
  const orgDescription = request.org_description;
  const expectation    = request.expectation;

  if (!orgName || !orgDescription || !expectation) {
    await notifyOwnerFallback({
      requestId:      b.requestId,
      phone:          request.phone,
      orgName:        orgName        ?? '(no capturado)',
      orgDescription: orgDescription ?? '(no capturado)',
      expectation:    expectation    ?? '(no capturado)',
      reason:         'legacy_row_missing_context',
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'legacy_row' });
  }

  const hourMx = currentHourMx();
  const inHours = hourMx >= IN_HOURS_START && hourMx < IN_HOURS_END;

  if (!inHours) {
    await notifyOwnerFallback({
      requestId:      b.requestId,
      phone:          request.phone,
      orgName,
      orgDescription,
      expectation,
      reason:         'out_of_hours',
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'out_of_hours' });
  }

  const callResult = await triggerLandingDemoCall({
    phone:          request.phone,
    orgName,
    orgDescription,
    expectation,
    requestId:      b.requestId,
  });

  if (!callResult.ok) {
    await notifyOwnerFallback({
      requestId:      b.requestId,
      phone:          request.phone,
      orgName,
      orgDescription,
      expectation,
      reason:         `vapi_fail: ${callResult.error ?? 'unknown'}`,
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'vapi_fail' });
  }

  return NextResponse.json({ ok: true, callStatus: 'dialing' });
}
