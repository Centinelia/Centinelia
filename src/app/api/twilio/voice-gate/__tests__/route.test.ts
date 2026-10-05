/**
 * Tests para /api/twilio/voice-gate — intercepta llamadas antes de que
 * lleguen a Vapi. Si el caller está bloqueado, Reject TwiML. Si no,
 * Redirect al webhook de Vapi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';

import {
  createSupabaseMock,
  TEST_PORTAL_EMAIL,
} from '@/lib/portal/__tests__/test-utils';

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { POST } from '../route';

let supabase: ReturnType<typeof createSupabaseMock>;

const TWILIO_TO   = '+528121887969';
const BLOCKED_FROM = '+524691269029';
const LEGIT_FROM   = '+525513288200';
const VAPI_URL = 'https://api.vapi.ai/twilio/inbound_call';

function makeTwilioRequest(params: Record<string, string>, opts: { withValidSignature?: boolean } = {}): NextRequest {
  const body = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'x-forwarded-proto': 'https',
    'x-forwarded-host':  'www.centinelia.mx',
  };

  if (opts.withValidSignature && process.env.TWILIO_AUTH_TOKEN) {
    // Build signature exactly like Twilio does
    const url = 'https://www.centinelia.mx/api/twilio/voice-gate';
    const sortedKeys = Object.keys(params).sort();
    const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
    const sig = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(data).digest('base64');
    headers['x-twilio-signature'] = sig;
  }

  return new NextRequest('https://www.centinelia.mx/api/twilio/voice-gate', {
    method: 'POST',
    headers,
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  // Default: skip signature check for most tests
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
});

describe('voice-gate: bloqueo', () => {
  it('Reject si el From está en blocked_numbers del org', async () => {
    supabase.setNextResult({ data: { portal_email: TEST_PORTAL_EMAIL }, error: null });
    supabase.setNextResult({ data: { id: 'blk-1', reason: 'bot' }, error: null });

    const res = await POST(makeTwilioRequest({ From: BLOCKED_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<Reject reason="busy"/>');
    expect(text).not.toContain('<Redirect');
  });

  it('Redirect a Vapi si From NO está bloqueado', async () => {
    supabase.setNextResult({ data: { portal_email: TEST_PORTAL_EMAIL }, error: null });
    supabase.setNextResult({ data: null, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<Redirect');
    expect(text).toContain(VAPI_URL);
    expect(text).not.toContain('<Reject');
  });

  it('Redirect a Vapi si no hay agent asociado al To (fallback no romper)', async () => {
    supabase.setNextResult({ data: null, error: null });

    const res = await POST(makeTwilioRequest({ From: BLOCKED_FROM, To: '+9999999999', CallSid: 'CAtest' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });

  it('Redirect a Vapi si falta From/To (payload raro, no romper legítimos)', async () => {
    const res = await POST(makeTwilioRequest({ CallSid: 'CAtest' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });
});

describe('voice-gate: lookups', () => {
  it('resuelve portal_email por voice_agents.phone_number = To', async () => {
    supabase.setNextResult({ data: { portal_email: TEST_PORTAL_EMAIL }, error: null });
    supabase.setNextResult({ data: null, error: null });

    await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const lookupCall = supabase.history[0];
    expect(lookupCall.table).toBe('voice_agents');
    expect(lookupCall.eq).toContainEqual(['phone_number', TWILIO_TO]);
  });

  it('consulta blocked_numbers con (portal_email, caller normalizado)', async () => {
    supabase.setNextResult({ data: { portal_email: TEST_PORTAL_EMAIL }, error: null });
    supabase.setNextResult({ data: null, error: null });

    await POST(makeTwilioRequest({ From: BLOCKED_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const blocklistCall = supabase.history[1];
    expect(blocklistCall.table).toBe('blocked_numbers');
    expect(blocklistCall.eq).toContainEqual(['portal_email', TEST_PORTAL_EMAIL]);
    expect(blocklistCall.eq).toContainEqual(['phone_e164', BLOCKED_FROM]);
  });

  it('normaliza From sin + a E.164 MX antes de consultar', async () => {
    supabase.setNextResult({ data: { portal_email: TEST_PORTAL_EMAIL }, error: null });
    supabase.setNextResult({ data: null, error: null });

    await POST(makeTwilioRequest({ From: '8112345678', To: TWILIO_TO, CallSid: 'CAtest' }));
    const blocklistCall = supabase.history[1];
    expect(blocklistCall.eq).toContainEqual(['phone_e164', '+528112345678']);
  });
});

describe('voice-gate: signature verification', () => {
  it('con TWILIO_AUTH_TOKEN y signature válida → procesa normal', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token-123');
    supabase.setNextResult({ data: { portal_email: TEST_PORTAL_EMAIL }, error: null });
    supabase.setNextResult({ data: null, error: null });

    const res = await POST(makeTwilioRequest(
      { From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' },
      { withValidSignature: true },
    ));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });

  it('con TWILIO_AUTH_TOKEN y signature inválida → Reject', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token-123');

    const req = makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' });
    req.headers.set('x-twilio-signature', 'invalid-sig');

    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<Reject');
  });
});
