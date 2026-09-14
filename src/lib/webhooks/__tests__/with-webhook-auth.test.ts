/**
 * Tests para withWebhookAuth — helper de webhooks entrantes.
 *
 * Cubre las invariantes cross-provider:
 *  - Firma inválida → 400/401
 *  - Env no seteado → 503
 *  - Rate limit 429
 *  - Idempotencia: duplicate → 200 { deduped: true }, handler NO se ejecuta
 *  - Handler que crashea → 500, NO se marca processed_at (permite retry)
 *  - 2-phase commit (Stripe): markProcessed llamado tras handler ok
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

import {
  stripeCheckoutSessionCompleted,
  makeStripeRequest,
  setStripeSecretFixture,
  vapiCallEndedEvent,
  makeVapiRequest,
  setVapiSecretFixture,
} from './fixtures';

const {
  mockCreateAdminClient,
  mockRateLimit,
  mockCheckAndClaimEvent,
  mockStripeIdempotency,
  mockMarkProcessed,
  mockStripeConstructEvent,
} = vi.hoisted(() => ({
  mockCreateAdminClient:   vi.fn(),
  mockRateLimit:           vi.fn(),
  mockCheckAndClaimEvent:  vi.fn(),
  mockStripeIdempotency:   vi.fn(),
  mockMarkProcessed:       vi.fn(),
  mockStripeConstructEvent: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: mockRateLimit,
  limiters:  { auth: {} },
}));

vi.mock('../idempotency', () => ({
  checkAndClaimEvent: mockCheckAndClaimEvent,
  stripeIdempotency:  mockStripeIdempotency,
}));

// Mock del cliente Stripe para que constructEvent verifique nuestro secret fixture.
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockStripeConstructEvent,
    },
  },
}));

import { withWebhookAuth } from '../with-webhook-auth';

const echoHandler = vi.fn(async (_req, ctx: { eventId: string; eventType?: string }) =>
  NextResponse.json({ ok: true, eventId: ctx.eventId, eventType: ctx.eventType }),
);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAdminClient.mockReturnValue({});
  mockRateLimit.mockResolvedValue(null);
  mockCheckAndClaimEvent.mockResolvedValue({ isDuplicate: false });
  mockStripeIdempotency.mockResolvedValue({
    isDuplicate: false,
    markProcessed: mockMarkProcessed,
  });
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', setStripeSecretFixture());
  vi.stubEnv('VAPI_SERVER_SECRET',    setVapiSecretFixture());
});

// ─── Rate limit + env misconfig ─────────────────────────────────────────────

describe('withWebhookAuth — rate limit y env', () => {
  it('rate limit dispara 429 antes de leer el body', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'rl' }, { status: 429 }),
    );
    const handler = withWebhookAuth('vapi', echoHandler);
    const res = await handler(makeVapiRequest(vapiCallEndedEvent()));
    expect(res.status).toBe(429);
    expect(echoHandler).not.toHaveBeenCalled();
  });

  it('vapi: env no seteado → 503', async () => {
    vi.stubEnv('VAPI_SERVER_SECRET', '');
    const handler = withWebhookAuth('vapi', echoHandler);
    const res = await handler(makeVapiRequest(vapiCallEndedEvent()));
    expect(res.status).toBe(503);
  });

  it('stripe: env no seteado → 503', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const handler = withWebhookAuth('stripe', echoHandler);
    const res = await handler(makeStripeRequest(stripeCheckoutSessionCompleted()));
    expect(res.status).toBe(503);
  });
});

// ─── Signature verification ─────────────────────────────────────────────────

describe('withWebhookAuth — signature verification', () => {
  it('vapi: header x-vapi-secret incorrecto → 401', async () => {
    const handler = withWebhookAuth('vapi', echoHandler);
    const res = await handler(makeVapiRequest(vapiCallEndedEvent(), 'wrong-secret'));
    expect(res.status).toBe(401);
    expect(echoHandler).not.toHaveBeenCalled();
  });

  it('vapi: signature correcta → handler recibe event tipado', async () => {
    const event = vapiCallEndedEvent({ id: 'call_specific' });
    const handler = withWebhookAuth('vapi', echoHandler);
    const res = await handler(makeVapiRequest(event));
    expect(res.status).toBe(200);
    expect(echoHandler).toHaveBeenCalled();
    const body = await res.json();
    expect(body.eventId).toContain('call_specific');
    expect(body.eventType).toBe('end-of-call-report');
  });

  it('stripe: constructEvent falla → 400', async () => {
    mockStripeConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature');
    });
    const handler = withWebhookAuth('stripe', echoHandler);
    const res = await handler(makeStripeRequest(stripeCheckoutSessionCompleted()));
    expect(res.status).toBe(400);
  });

  it('stripe: constructEvent OK → handler recibe event', async () => {
    const event = stripeCheckoutSessionCompleted();
    mockStripeConstructEvent.mockReturnValueOnce(event);
    const handler = withWebhookAuth('stripe', echoHandler);
    const res = await handler(makeStripeRequest(event));
    expect(res.status).toBe(200);
    expect(mockStripeConstructEvent).toHaveBeenCalled();
  });
});

// ─── Idempotency ────────────────────────────────────────────────────────────

describe('withWebhookAuth — idempotency', () => {
  it('vapi: evento duplicado → 200 { deduped: true }, handler NO ejecutado', async () => {
    mockCheckAndClaimEvent.mockResolvedValueOnce({ isDuplicate: true });
    const handler = withWebhookAuth('vapi', echoHandler);
    const res = await handler(makeVapiRequest(vapiCallEndedEvent()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(echoHandler).not.toHaveBeenCalled();
  });

  it('vapi: opts.idempotency=off → skip checkAndClaim', async () => {
    const handler = withWebhookAuth('vapi', echoHandler, { idempotency: 'off' });
    await handler(makeVapiRequest(vapiCallEndedEvent()));
    expect(mockCheckAndClaimEvent).not.toHaveBeenCalled();
    expect(echoHandler).toHaveBeenCalled();
  });

  it('stripe: handler success → markProcessed llamado (2-phase commit)', async () => {
    mockStripeConstructEvent.mockReturnValueOnce(stripeCheckoutSessionCompleted());
    const handler = withWebhookAuth('stripe', echoHandler);
    await handler(makeStripeRequest(stripeCheckoutSessionCompleted()));
    expect(mockMarkProcessed).toHaveBeenCalledTimes(1);
  });

  it('stripe: handler throw → markProcessed NO llamado (permite retry)', async () => {
    mockStripeConstructEvent.mockReturnValueOnce(stripeCheckoutSessionCompleted());
    const badHandler = vi.fn(async () => { throw new Error('boom'); });
    const handler = withWebhookAuth('stripe', badHandler);
    const res = await handler(makeStripeRequest(stripeCheckoutSessionCompleted()));
    expect(res.status).toBe(500);
    expect(mockMarkProcessed).not.toHaveBeenCalled();
  });
});

// ─── Error handling ─────────────────────────────────────────────────────────

describe('withWebhookAuth — errores del handler', () => {
  it('vapi: handler throw → 500 con error genérico (no leak)', async () => {
    const badHandler = vi.fn(async () => { throw new Error('internal: db down at 172.17.0.3'); });
    const handler = withWebhookAuth('vapi', badHandler);
    const res = await handler(makeVapiRequest(vapiCallEndedEvent()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('172.17.0.3');
    expect(JSON.stringify(body)).not.toContain('db down');
  });

  it('vapi: markProcessed no aplica cuando no es Stripe', async () => {
    const handler = withWebhookAuth('vapi', echoHandler);
    await handler(makeVapiRequest(vapiCallEndedEvent()));
    // vapi usa checkAndClaimEvent que no retorna markProcessed
    expect(mockMarkProcessed).not.toHaveBeenCalled();
  });
});
