/**
 * Fixtures y helpers para tests de webhooks.
 *
 * Cada provider tiene builder + signature generator para poder simular un
 * webhook entrante REAL (con firma HMAC correcta) en tests sin depender de
 * los servidores de Stripe/Vapi/Twilio.
 */

import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// ─── Stripe ─────────────────────────────────────────────────────────────────

const STRIPE_SECRET_FIXTURE = 'whsec_test_secret_for_fixtures';

/**
 * Firma un payload Stripe con el mismo formato que Stripe usa
 * (`t=<timestamp>,v1=<hmac>`). Requiere que `STRIPE_WEBHOOK_SECRET` esté
 * seteado a `STRIPE_SECRET_FIXTURE` en el test.
 */
export function stripeSignature(body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signedPayload = `${timestamp}.${body}`;
  const sig = createHmac('sha256', STRIPE_SECRET_FIXTURE).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

export function stripeCheckoutSessionCompleted(overrides: Record<string, unknown> = {}) {
  return {
    id:       'evt_test_' + Math.random().toString(36).slice(2),
    type:     'checkout.session.completed',
    api_version: '2026-05-27.dahlia',
    created:  Math.floor(Date.now() / 1000),
    livemode: false,
    object:   'event',
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id:            'cs_test_xyz',
        object:        'checkout.session',
        payment_status: 'paid',
        subscription:   'sub_test_abc',
        metadata:       { portal_email: 'test-org@centinelia.mx' },
        ...overrides,
      },
    },
  };
}

export function makeStripeRequest(payload: object): NextRequest {
  const body = JSON.stringify(payload);
  const sig  = stripeSignature(body);
  return new NextRequest('http://localhost/api/billing/webhook', {
    method:  'POST',
    headers: {
      'content-type':     'application/json',
      'stripe-signature': sig,
    },
    body,
  });
}

// Setter para env var — llamar en beforeEach.
export function setStripeSecretFixture() {
  return STRIPE_SECRET_FIXTURE;
}

// ─── Vapi ───────────────────────────────────────────────────────────────────

const VAPI_SECRET_FIXTURE = 'vapi_test_secret_fixture';

export function vapiCallEndedEvent(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      type: 'end-of-call-report',
      call: {
        id:          'call_' + Math.random().toString(36).slice(2),
        endedReason: 'customer-ended-call',
        ...overrides,
      },
    },
  };
}

export function makeVapiRequest(payload: object, secret = VAPI_SECRET_FIXTURE): NextRequest {
  return new NextRequest('http://localhost/api/voice/webhook', {
    method:  'POST',
    headers: {
      'content-type':   'application/json',
      'x-vapi-secret':  secret,
    },
    body: JSON.stringify(payload),
  });
}

export function setVapiSecretFixture() {
  return VAPI_SECRET_FIXTURE;
}

// ─── Twilio (WhatsApp/SMS) ──────────────────────────────────────────────────

const TWILIO_TOKEN_FIXTURE = 'twilio_auth_token_fixture';
const APP_URL_FIXTURE      = 'http://localhost';

export function twilioIncomingMessage(overrides: Record<string, string> = {}): URLSearchParams {
  const params = new URLSearchParams({
    MessageSid:    'SM' + Math.random().toString(36).slice(2),
    AccountSid:    'AC_test',
    From:          'whatsapp:+528118000000',
    To:            'whatsapp:+528118111111',
    Body:          'Hola',
    MessageStatus: 'received',
    ...overrides,
  });
  return params;
}

/** Genera la firma X-Twilio-Signature correcta para el body y URL dados. */
export function twilioSignature(url: string, params: URLSearchParams): string {
  const sorted = [...params.keys()].sort();
  const paramStr = sorted.map(k => `${k}${params.get(k)}`).join('');
  return createHmac('sha1', TWILIO_TOKEN_FIXTURE)
    .update(url + paramStr)
    .digest('base64');
}

export function makeTwilioRequest(params: URLSearchParams, pathname = '/api/whatsapp/webhook'): NextRequest {
  const url  = `${APP_URL_FIXTURE}${pathname}`;
  const sig  = twilioSignature(url, params);
  const body = params.toString();
  return new NextRequest(url, {
    method:  'POST',
    headers: {
      'content-type':       'application/x-www-form-urlencoded',
      'x-twilio-signature': sig,
    },
    body,
  });
}

export function setTwilioFixtures() {
  return { token: TWILIO_TOKEN_FIXTURE, appUrl: APP_URL_FIXTURE };
}
