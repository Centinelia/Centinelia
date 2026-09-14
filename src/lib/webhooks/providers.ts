/**
 * Provider verifiers para withWebhookAuth.
 *
 * Cada provider expone `verify(req, rawBody)` que retorna:
 *   { ok: true, event, eventId, eventType? }  — payload validado + id para dedupe
 *   { ok: false, error, status }              — rechazo con status HTTP apropiado
 *
 * Los verifiers son puros: no tocan DB, no loggean, no mutan estado. El
 * wrapper (withWebhookAuth) se encarga de idempotencia, rate limit y logging.
 */

import { NextRequest } from 'next/server';
import { timingSafeEqual, createHmac } from 'crypto';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export type VerifyResult<E> =
  | { ok: true;  event: E; eventId: string; eventType?: string }
  | { ok: false; error: string; status: number };

export interface ProviderVerifier<E> {
  name:    string;
  /** Lee el body como texto crudo (para HMAC). El wrapper le pasa el rawBody. */
  verify(req: NextRequest, rawBody: string): Promise<VerifyResult<E>>;
  /** Nombre de la tabla de dedupe (`webhook_events` genérica o custom). */
  dedupeTable?: string;
}

// ─── Stripe ─────────────────────────────────────────────────────────────────

export const stripeVerifier: ProviderVerifier<Stripe.Event> = {
  name: 'stripe',
  dedupeTable: 'stripe_webhook_events',
  async verify(req, rawBody) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook:stripe] STRIPE_WEBHOOK_SECRET not set');
      return { ok: false, error: 'server_misconfigured', status: 503 };
    }
    const sig = req.headers.get('stripe-signature');
    if (!sig) return { ok: false, error: 'missing_signature', status: 400 };

    try {
      const event = stripe.webhooks.constructEvent(rawBody, sig, secret);
      return { ok: true, event, eventId: event.id, eventType: event.type };
    } catch {
      return { ok: false, error: 'invalid_signature', status: 400 };
    }
  },
};

// ─── Vapi ───────────────────────────────────────────────────────────────────

export interface VapiEvent {
  message?: {
    type?:  string;
    call?:  { id?: string; endedReason?: string };
  };
  type?: string;
  call?: { id?: string };
}

export const vapiVerifier: ProviderVerifier<VapiEvent> = {
  name: 'vapi',
  dedupeTable: 'webhook_events',
  async verify(req, rawBody) {
    const vapiSecret = process.env.VAPI_SERVER_SECRET;
    if (!vapiSecret) {
      console.error('[webhook:vapi] VAPI_SERVER_SECRET not set');
      return { ok: false, error: 'server_misconfigured', status: 503 };
    }

    const headerSecret = req.headers.get('x-vapi-secret') ?? '';
    const querySecret  = req.nextUrl.searchParams.get('secret') ?? '';

    const secretBuf = Buffer.from(vapiSecret);
    const headerMatch =
      headerSecret.length === vapiSecret.length &&
      timingSafeEqual(Buffer.from(headerSecret), secretBuf);
    const queryMatch =
      querySecret.length === vapiSecret.length &&
      timingSafeEqual(Buffer.from(querySecret), secretBuf);

    if (!headerMatch && !queryMatch) {
      return { ok: false, error: 'unauthorized', status: 401 };
    }

    let event: VapiEvent;
    try {
      event = JSON.parse(rawBody) as VapiEvent;
    } catch {
      return { ok: false, error: 'invalid_json', status: 400 };
    }

    // Vapi eventId: preferimos call.id (único por llamada) + type para
    // eventos multi-tipo por la misma call.
    const callId    = event.message?.call?.id ?? event.call?.id ?? '';
    const eventType = event.message?.type ?? event.type ?? '';
    const eventId   = callId ? `${callId}:${eventType || 'unknown'}` : '';

    if (!eventId) {
      // Sin id → no podemos dedupar. Aceptamos pero marcamos.
      return { ok: true, event, eventId: `nonce:${Date.now()}:${Math.random()}`, eventType };
    }

    return { ok: true, event, eventId, eventType };
  },
};

// ─── Twilio (WhatsApp + SMS + voice) ────────────────────────────────────────

export type TwilioEvent = Record<string, string>;

export const twilioVerifier: ProviderVerifier<TwilioEvent> = {
  name: 'twilio',
  dedupeTable: 'webhook_events',
  async verify(req, rawBody) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL;
    if (!authToken || !appUrl) {
      console.error('[webhook:twilio] TWILIO_AUTH_TOKEN or NEXT_PUBLIC_APP_URL not set');
      return { ok: false, error: 'server_misconfigured', status: 503 };
    }

    const signature = req.headers.get('x-twilio-signature') ?? '';
    if (!signature) return { ok: false, error: 'missing_signature', status: 400 };

    // Twilio firma: HMAC-SHA1(url + sortedParamsConcat, authToken) base64.
    const url = `${appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
    const params = new URLSearchParams(rawBody);
    const sorted = [...params.keys()].sort();
    const paramStr = sorted.map(k => `${k}${params.get(k)}`).join('');

    const expected = createHmac('sha1', authToken)
      .update(url + paramStr)
      .digest('base64');

    let matches = false;
    try {
      matches =
        signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      matches = false;
    }
    if (!matches) return { ok: false, error: 'invalid_signature', status: 401 };

    // Reconstruir event como objeto plano
    const event: TwilioEvent = {};
    for (const [k, v] of params) event[k] = v;

    // Twilio eventId: MessageSid | CallSid | SmsMessageSid según tipo.
    const eventId = event.MessageSid ?? event.CallSid ?? event.SmsMessageSid ?? '';
    const eventType = event.MessageStatus ?? event.CallStatus ?? 'unknown';

    if (!eventId) {
      return { ok: true, event, eventId: `nonce:${Date.now()}:${Math.random()}`, eventType };
    }

    return { ok: true, event, eventId, eventType };
  },
};

// ─── Registry de providers ──────────────────────────────────────────────────

export const PROVIDERS = {
  stripe: stripeVerifier,
  vapi:   vapiVerifier,
  twilio: twilioVerifier,
} as const;

export type ProviderName = keyof typeof PROVIDERS;
