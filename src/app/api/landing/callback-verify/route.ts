import { NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/landing/otp-sms';
import { getById } from '@/lib/landing/callback-store';
import { triggerLandingDemoCall } from '@/lib/vapi/landing-demo';
import { notifyOwnerFallback } from '@/lib/landing/notify-owner';
import type { IndustryKey } from '@/lib/landing/constants';

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

  // Horario laboral MX (9am-8pm America/Monterrey)
  const nowMx = new Date().toLocaleString('en-US', {
    timeZone: 'America/Monterrey',
    hour:     'numeric',
    hour12:   false,
  });
  const hourMx = parseInt(nowMx, 10);
  const inHours = hourMx >= 9 && hourMx < 20;

  if (!inHours) {
    await notifyOwnerFallback({
      requestId: b.requestId,
      phone:     request.phone,
      industry:  request.industry,
      reason:    'out_of_hours',
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'out_of_hours' });
  }

  const callResult = await triggerLandingDemoCall({
    phone:     request.phone,
    industry:  request.industry as IndustryKey,
    requestId: b.requestId,
  });

  if (!callResult.ok) {
    await notifyOwnerFallback({
      requestId: b.requestId,
      phone:     request.phone,
      industry:  request.industry,
      reason:    `vapi_fail: ${callResult.error ?? 'unknown'}`,
    });
    return NextResponse.json({ ok: true, callStatus: 'fallback_manual', reason: 'vapi_fail' });
  }

  return NextResponse.json({ ok: true, callStatus: 'dialing' });
}
