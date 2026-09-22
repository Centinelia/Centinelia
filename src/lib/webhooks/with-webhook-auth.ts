/**
 * withWebhookAuth — helper único para webhooks entrantes.
 *
 * Encapsula el patrón repetido en ~10 rutas de /api/**\/webhook y callbacks:
 *  1. Lee el body como RAW text (necesario para HMAC verification).
 *  2. Verifica firma / secret / HMAC del provider.
 *  3. Rechaza con status HTTP apropiado (401, 400, 503).
 *  4. Chequea idempotencia via webhook_events / stripe_webhook_events.
 *  5. Rate limit inbound (protege contra replay flood).
 *  6. Delega al handler con event ya tipado.
 *  7. Para Stripe: marca processed_at al final (2-phase commit).
 *  8. Logging estructurado (provider, eventType, eventId, duration).
 *
 * Uso:
 *
 *   export const POST = withWebhookAuth('stripe', async (req, { event, supabase }) => {
 *     // event: Stripe.Event, ya validado
 *     if (event.type === 'checkout.session.completed') { ... }
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * Para Vapi / Twilio: el event es Record-like sin tipos fuertes por design
 * (Vapi cambia shape entre versiones; Twilio depende del tipo de mensaje).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { limiters, rateLimit } from '@/lib/ratelimit';
import { PROVIDERS, type ProviderName } from './providers';
import { checkAndClaimEvent, stripeIdempotency, type IdempotencyResult } from './idempotency';
import type Stripe from 'stripe';
import type { VapiEvent, TwilioEvent, MetaWaEvent } from './providers';

// Type mapping provider name → event type.
// Keys DEBEN cubrir exactamente ProviderName (keyof typeof PROVIDERS en ./providers).
// Si agregas un provider nuevo, agrega su tipo aquí O el generic P falla al indexar.
export type EventByProvider = {
  stripe:  Stripe.Event;
  vapi:    VapiEvent;
  twilio:  TwilioEvent;
  meta_wa: MetaWaEvent;
};

export interface WebhookContext<P extends ProviderName> {
  event:    EventByProvider[P];
  eventId:  string;
  eventType?: string;
  supabase: SupabaseClient;
  rawBody:  string;
}

export interface WithWebhookAuthOptions {
  /** 'strict' = usa idempotencia (default). 'off' = skip (raro; endpoints no-op). */
  idempotency?: 'strict' | 'off';
  /** true = aplica limiters.auth con key por provider (default true). */
  rateLimit?:   boolean;
}

type Handler<P extends ProviderName> = (
  req: NextRequest,
  ctx: WebhookContext<P>,
) => Promise<NextResponse> | NextResponse;

export function withWebhookAuth<P extends ProviderName>(
  provider: P,
  handler:  Handler<P>,
  opts:     WithWebhookAuthOptions = {},
) {
  const {
    idempotency = 'strict',
    rateLimit: doRateLimit = true,
  } = opts;

  return async function wrapped(req: NextRequest): Promise<NextResponse> {
    const started = Date.now();

    // 1. Rate limit (por IP; webhooks generalmente vienen de IPs conocidas
    // pero un flood podría venir de attacker que descubrió el URL).
    if (doRateLimit) {
      const rl = await rateLimit(req, limiters.auth, `webhook:${provider}`);
      if (rl) return rl;
    }

    // 2. Body raw (NECESARIO para HMAC verification — no lo consumas antes).
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch (err) {
      console.error(`[webhook:${provider}] failed to read body:`, err);
      return NextResponse.json({ error: 'body_read_failed' }, { status: 400 });
    }

    // 3. Provider-specific verify
    const verifier = PROVIDERS[provider];
    const verifyResult = await verifier.verify(req, rawBody);
    if (!verifyResult.ok) {
      console.warn(`[webhook:${provider}] verify failed: ${verifyResult.error} (${verifyResult.status})`);
      return NextResponse.json({ error: verifyResult.error }, { status: verifyResult.status });
    }

    const { event, eventId, eventType } = verifyResult;
    const supabase = createAdminClient();

    // 4. Idempotency
    let idem: IdempotencyResult = { isDuplicate: false };
    if (idempotency === 'strict') {
      if (provider === 'stripe') {
        const stripeEvent = event as Stripe.Event;
        const eventObj = stripeEvent.data.object as unknown as Record<string, unknown>;
        idem = await stripeIdempotency(supabase, {
          eventId,
          eventType: eventType ?? stripeEvent.type,
          sessionId:      stripeEvent.type.startsWith('checkout.session.')
            ? (eventObj.id as string | undefined) ?? null : null,
          subscriptionId: (eventObj.subscription as string | undefined)
            ?? (stripeEvent.type.startsWith('customer.subscription.')
              ? (eventObj.id as string | undefined) : undefined) ?? null,
          portalEmail: (eventObj.metadata as { portal_email?: string } | undefined)?.portal_email ?? null,
        });
      } else {
        idem = await checkAndClaimEvent(supabase, {
          source:    provider,
          eventId,
          eventType,
        });
      }

      if (idem.isDuplicate) {
        console.info(`[webhook:${provider}] duplicate event ${eventId} — skip`);
        return NextResponse.json({ ok: true, deduped: true });
      }
    }

    // 5. Delegar al handler
    let response: NextResponse;
    try {
      response = await handler(req, {
        event:    event as EventByProvider[P],
        eventId,
        eventType,
        supabase,
        rawBody,
      });
    } catch (err) {
      console.error(`[webhook:${provider}] handler threw:`, err);
      // NO llamamos markProcessed → Stripe reintentará → 2-phase commit
      // permite re-procesar tras el crash window.
      return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
    }

    // 6. 2-phase commit (Stripe only)
    if (idem.markProcessed) {
      try {
        await idem.markProcessed();
      } catch (err) {
        console.error(`[webhook:${provider}] mark processed failed:`, err);
        // No rechazamos la response — el evento SÍ se procesó, solo falló el flag.
      }
    }

    // 7. Log estructurado
    const durationMs = Date.now() - started;
    console.info(`[webhook:${provider}] ${eventType ?? 'unknown'} ${eventId} → ${response.status} in ${durationMs}ms`);

    return response;
  };
}
