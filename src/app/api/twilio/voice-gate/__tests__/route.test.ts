/**
 * Tests para /api/twilio/voice-gate — gate real de llamadas entrantes.
 * Cubre todos los gates migrados desde inbound/route.ts (que estaba muerto).
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

const TWILIO_TO    = '+528121887969';
const BLOCKED_FROM = '+524691269029';
const LEGIT_FROM   = '+525513288200';
const OWNER_FROM   = '+528112803360';
const VAPI_URL     = 'https://api.vapi.ai/twilio/inbound_call';

function makeTwilioRequest(params: Record<string, string>, opts: { withValidSignature?: boolean } = {}): NextRequest {
  const body = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'x-forwarded-proto': 'https',
    'x-forwarded-host':  'www.centinelia.mx',
  };

  if (opts.withValidSignature && process.env.TWILIO_AUTH_TOKEN) {
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

/** Base agent fixture — active, business hours 24/7 por default. */
function agentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id:                 'ag-1',
    portal_email:       TEST_PORTAL_EMAIL,
    business_name:      'Mi Negocio',
    business_hours:     null,              // null → siempre open
    timezone:           'America/Mexico_City',
    active:             true,
    billing_status:     'active',
    transfer_number:    OWNER_FROM,
    transfer_whatsapp:  null,
    daily_minutes_cap:  null,
    minutes_used:       0,
    minutes_included:   0,
    ...overrides,
  };
}

/** Setea los lookups del flow "legítimo" (agent + blocklist miss + org OK + account_minutes OK). */
function setupLegitFlow(agentOverrides: Record<string, unknown> = {}) {
  supabase.setNextResult({ data: agentFixture(agentOverrides), error: null }); // agent
  supabase.setNextResult({ data: null, error: null });                          // blocked_numbers miss
  supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null }); // org
  supabase.setNextResult({ data: { minutes_used: 0, minutes_included: 0 }, error: null }); // account_minutes
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
});

describe('voice-gate: blocklist', () => {
  it('Reject si From en blocked_numbers del org', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: { id: 'blk-1', reason: 'bot' }, error: null });

    const res = await POST(makeTwilioRequest({ From: BLOCKED_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Reject reason="busy"/>');
    expect(text).not.toContain('<Redirect');
  });

  it('Owner bypass: aunque esté en blocklist, no reject (owner llama a su propio #)', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    // blocked_numbers NOT queried for owner → saltamos directo a org
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 0, minutes_included: 0 }, error: null });

    const res = await POST(makeTwilioRequest({ From: OWNER_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
    expect(text).not.toContain('<Reject');
  });
});

describe('voice-gate: agent paused (active=false)', () => {
  it('Say + Hangup con mensaje de pausa', async () => {
    supabase.setNextResult({ data: agentFixture({ active: false }), error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Say');
    expect(text).toContain('<Hangup/>');
    expect(text).toMatch(/no podemos atenderte/i);
    expect(text).not.toContain('<Redirect');
  });

  it('billing_status=pago_fallido → mensaje administrativo', async () => {
    supabase.setNextResult({ data: agentFixture({ active: false, billing_status: 'pago_fallido' }), error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toMatch(/administrativa/i);
  });
});

describe('voice-gate: account suspended/terminated', () => {
  it('Reject si account_status=suspended con suspended_until futuro', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null }); // blocklist miss
    const futuro = new Date(Date.now() + 86400000).toISOString();
    supabase.setNextResult({ data: { account_status: 'suspended', suspended_until: futuro, fallback_phone_number: null }, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Reject reason="rejected"/>');
  });

  it('Reject si account_status=terminated', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'terminated', suspended_until: null, fallback_phone_number: null }, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Reject reason="rejected"/>');
  });

  it('suspended expiró (suspended_until pasado) → NO reject', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    const pasado = new Date(Date.now() - 86400000).toISOString();
    supabase.setNextResult({ data: { account_status: 'suspended', suspended_until: pasado, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 0, minutes_included: 0 }, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });
});

describe('voice-gate: business hours', () => {
  const CLOSED_HOURS = { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };

  it('cerrado → Say + Hangup', async () => {
    supabase.setNextResult({ data: agentFixture({ business_hours: CLOSED_HOURS }), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Say');
    expect(text).toContain('<Hangup/>');
    expect(text).toMatch(/cerrados|fuera de horario/i);
  });

  it('owner bypass: owner llama fuera de horario → Redirect', async () => {
    supabase.setNextResult({ data: agentFixture({ business_hours: CLOSED_HOURS }), error: null });
    // owner skips blocklist query → org directo
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 0, minutes_included: 0 }, error: null });

    const res = await POST(makeTwilioRequest({ From: OWNER_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });
});

describe('voice-gate: pool exhausted', () => {
  it('con fallback → Dial al fallback_phone_number', async () => {
    const fallback = '+528112345678';
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: fallback }, error: null });
    supabase.setNextResult({ data: { minutes_used: 500, minutes_included: 500 }, error: null }); // agotado

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain(`<Dial>${fallback}</Dial>`);
  });

  it('sin fallback → Say + Hangup "servicio pausado"', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 500, minutes_included: 500 }, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Say');
    expect(text).toMatch(/pausado|intente|contacte/i);
    expect(text).not.toContain('<Dial');
  });

  it('owner bypass: owner llama con pool agotado → Redirect', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 500, minutes_included: 500 }, error: null });

    const res = await POST(makeTwilioRequest({ From: OWNER_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });

  it('minutes_included=0 (unlimited) → no bloquear aunque used>0', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 1000, minutes_included: 0 }, error: null });

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });
});

describe('voice-gate: lookups', () => {
  it('resuelve agent por voice_agents.phone_number = To', async () => {
    setupLegitFlow();
    await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const lookup = supabase.history[0];
    expect(lookup.table).toBe('voice_agents');
    expect(lookup.eq).toContainEqual(['phone_number', TWILIO_TO]);
  });

  it('consulta blocked_numbers con (portal_email, caller normalizado)', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 0, minutes_included: 0 }, error: null });

    await POST(makeTwilioRequest({ From: BLOCKED_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const blocklistCall = supabase.history.find(c => c.table === 'blocked_numbers');
    expect(blocklistCall).toBeDefined();
    expect(blocklistCall!.eq).toContainEqual(['portal_email', TEST_PORTAL_EMAIL]);
    expect(blocklistCall!.eq).toContainEqual(['phone_e164', BLOCKED_FROM]);
  });

  it('normaliza From sin + a E.164 MX', async () => {
    supabase.setNextResult({ data: agentFixture(), error: null });
    supabase.setNextResult({ data: null, error: null });
    supabase.setNextResult({ data: { account_status: 'active', suspended_until: null, fallback_phone_number: null }, error: null });
    supabase.setNextResult({ data: { minutes_used: 0, minutes_included: 0 }, error: null });

    await POST(makeTwilioRequest({ From: '8112345678', To: TWILIO_TO, CallSid: 'CAtest' }));
    const blocklistCall = supabase.history.find(c => c.table === 'blocked_numbers');
    expect(blocklistCall!.eq).toContainEqual(['phone_e164', '+528112345678']);
  });
});

describe('voice-gate: fallbacks defensivos', () => {
  it('sin agent asociado al To → Redirect a Vapi', async () => {
    supabase.setNextResult({ data: null, error: null });

    const res = await POST(makeTwilioRequest({ From: BLOCKED_FROM, To: '+9999999999', CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });

  it('sin From/To → Redirect a Vapi', async () => {
    const res = await POST(makeTwilioRequest({ CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });
});

describe('voice-gate: signature verification', () => {
  it('con token + signature válida → procesa', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token-123');
    setupLegitFlow();
    const res = await POST(makeTwilioRequest(
      { From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' },
      { withValidSignature: true },
    ));
    const text = await res.text();
    expect(text).toContain('<Redirect');
  });

  it('con token + signature inválida → Reject', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token-123');
    const req = makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' });
    req.headers.set('x-twilio-signature', 'invalid-sig');

    const res = await POST(req);
    const text = await res.text();
    expect(text).toContain('<Reject');
  });
});

describe('voice-gate: happy path', () => {
  it('legit + activo + horario abierto + pool OK → Redirect a Vapi', async () => {
    setupLegitFlow();

    const res = await POST(makeTwilioRequest({ From: LEGIT_FROM, To: TWILIO_TO, CallSid: 'CAtest' }));
    const text = await res.text();
    expect(text).toContain('<Redirect');
    expect(text).toContain(VAPI_URL);
    expect(text).not.toContain('<Reject');
    expect(text).not.toContain('<Say');
  });
});
