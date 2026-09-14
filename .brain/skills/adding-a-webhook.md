---
name: adding-a-webhook
description: Use when adding, modifying, or reviewing a webhook endpoint from Stripe, Vapi, Twilio, or any other external provider. Enforces signature verification, idempotency, rate limiting, and 2-phase commit for money-moving events.
type: skill
owner: nazre
last_verified: 2026-09-14
inputs:
  - provider (stripe | vapi | twilio | otro)
  - event types que va a manejar
  - side effects (money, state changes, notifications)
output: PR con withWebhookAuth aplicado + tests + entry en tabla webhook_events
---

# Adding a webhook

## Antes de escribir código

Los webhooks son la #1 fuente de bugs financieros invisibles en Centinelia:
- Retry sin idempotencia → double-charge / double-consume
- Signature no verificada → attacker envía payloads falsos
- Env var no seteada → endpoint acepta cualquier request
- Handler crashea después de side effect → estado inconsistente

Todos estos casos están cubiertos por `withWebhookAuth`. **NO reescribas la auth ni la idempotencia** — usa el helper.

---

## Pattern estándar (usa esto)

```ts
import { withWebhookAuth } from '@/lib/webhooks/with-webhook-auth';
import { NextResponse } from 'next/server';

export const POST = withWebhookAuth('vapi', async (_req, { event, supabase, eventId }) => {
  // event ya está tipado según provider y verificado.
  // eventId ya está dedupeado (retry vendría con { deduped: true } sin llamar aquí).
  // supabase es admin client listo.

  // Tu lógica de negocio pura:
  if (event.message?.type === 'end-of-call-report') {
    // ...
  }

  return NextResponse.json({ ok: true });
});
```

**Lo que withWebhookAuth cubre automáticamente:**

| Invariante | Cómo |
|---|---|
| Firma HMAC verificada | Provider verifier por-tipo |
| Env var faltante → 503 | Guard temprano |
| Rate limit inbound | `limiters.auth` por provider |
| Body raw preservado | Para HMAC |
| Idempotency vía `webhook_events` | Insert con unique conflict |
| Stripe: 2-phase commit | `stripe_webhook_events.processed_at` |
| Handler crash → 500 sin marcar processed | Permite retry de Stripe |
| Logging estructurado | provider, event_type, event_id, duration |

---

## Providers soportados hoy

- **`'stripe'`** — HMAC via `stripe.webhooks.constructEvent`. Idempotency 2-phase commit. Tabla `stripe_webhook_events`.
- **`'vapi'`** — Secret via `x-vapi-secret` header o query param. Timing-safe compare. Tabla `webhook_events`.
- **`'twilio'`** — HMAC-SHA1 URL+params, `x-twilio-signature`. Tabla `webhook_events`.

### Agregar un provider nuevo

En `src/lib/webhooks/providers.ts` agrega tu verifier:

```ts
export const nuevoVerifier: ProviderVerifier<TuEventType> = {
  name: 'nuevo',
  dedupeTable: 'webhook_events',
  async verify(req, rawBody) {
    // 1. Check env
    // 2. Validar firma con timing-safe compare
    // 3. Parse rawBody
    // 4. Extraer eventId único (para dedupe)
    return { ok: true, event, eventId, eventType };
  },
};
```

Luego registra en `PROVIDERS` + agrega el tipo en `EventByProvider`. Los tests van en `__tests__/with-webhook-auth.test.ts` con fixtures nuevas.

---

## Idempotencia: cuál usar

- **1-phase (default)** — `webhook_events` con unique constraint. Rápido, pero si el handler crashea mid-side-effect, el retry se marca `deduped` y pierdes el evento. **OK para**: notificaciones, tracking, logs.
- **2-phase (Stripe automático)** — `stripe_webhook_events` con `processed_at`. Insert = claim, UPDATE al final = commit. Si crashea, después de 5min el retry re-procesa. **OK para**: dinero, subscripciones, allocation de minutos/ops.

Si tu webhook mueve dinero pero NO es Stripe, considera pedir el 2-phase o hacer idempotencia manual dentro del handler.

---

## Tests

El harness `src/lib/webhooks/__tests__/fixtures.ts` te da todo:

```ts
import { makeStripeRequest, stripeCheckoutSessionCompleted } from '@/lib/webhooks/__tests__/fixtures';

it('cobra ops del cliente al pagar', async () => {
  const event = stripeCheckoutSessionCompleted({ metadata: { portal_email: 'x@y.com' } });
  const res = await POST(makeStripeRequest(event));
  expect(res.status).toBe(200);
  // asserts sobre side effects del handler
});
```

Los fixtures generan la firma HMAC correcta usando `STRIPE_SECRET_FIXTURE`. Solo asegúrate de setear el env var en `beforeEach`:

```ts
beforeEach(() => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', setStripeSecretFixture());
});
```

**Checklist mínimo de tests para cualquier webhook nuevo:**

- [ ] Firma inválida → 400/401
- [ ] Env no seteada → 503
- [ ] Duplicate event → 200 { deduped: true }, side effect NO ejecutado
- [ ] Happy path del event type principal
- [ ] Handler throw → 500 (para Stripe: markProcessed NO llamado)

---

## Migrar un webhook existente

Si un route.ts ya tiene auth + dedupe hardcodeados:

1. Import `withWebhookAuth` y borra el manual auth block
2. Envuelve el POST: `export const POST = withWebhookAuth('provider', async (_req, ctx) => { ... })`
3. Cambia `body = await req.json()` por `event` del ctx
4. Borra el bloque de dedupe (webhook_events insert manual)
5. Verifica tests + typecheck

Ver ejemplos ya migrados:
- `src/app/api/outbound/vapi-webhook/route.ts` (dropdown de 243 → ~180 líneas)
- `src/app/api/whatsapp/webhook/route.ts` (Twilio, con LLM downstream)

---

## Cuándo NO usar esta skill

- Callbacks OAuth (usan `verifyOAuthState` de `src/lib/oauth/state.ts`, ya limpio)
- Endpoints internos con `CRON_SECRET` (crons no son webhooks)
- Endpoints de cliente autenticados por sesión (usan `withPortalAuth`)

---

## Ver también

- `src/lib/webhooks/with-webhook-auth.ts` — implementación del wrapper
- `src/lib/webhooks/providers.ts` — verifiers por provider
- `src/lib/webhooks/idempotency.ts` — 1-phase y 2-phase commit helpers
- [[../decisions/2026-08-11-webhook-idempotency-2phase]] — por qué Stripe usa 2-phase (si existe)
