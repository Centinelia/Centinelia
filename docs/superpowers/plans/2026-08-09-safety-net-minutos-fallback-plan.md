# Safety Net — Fallback de llamadas cuando se agotan minutos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando `minutes_used >= minutes_included`, transferir llamadas entrantes al `fallback_phone_number` del owner en vez de colgar; notificar por WhatsApp una vez por ciclo; auto-restaurar al recargar.

**Architecture:** Cambiar la respuesta del webhook `/api/voice/inbound/route.ts` en el punto donde hoy se devuelve `PausedByLimit`. Devolver un assistant Vapi de un solo turno que hace `transferCall` inmediato al fallback. Cero reconfiguración de Vapi. Auto-restore implícito porque cada inbound recomputa el gate contra `account_minutes`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + RPCs), Vapi (voz), Twilio (WhatsApp), Vitest (tests).

Spec de referencia: `docs/superpowers/specs/2026-08-09-safety-net-minutos-fallback-design.md`.

## Global Constraints

- **DB migrations**: agregar SQL en `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`. Nombrar con timestamp UTC actual (`date -u +%Y%m%d%H%M%S`).
- **WhatsApp helper canónico**: `import { sendWhatsApp } from '@/lib/whatsapp/send'` — firma `(to: string, body: string, fromNumber?: string) => Promise<boolean>`.
- **Supabase admin client**: `import { createAdminClient } from '@/lib/supabase/admin'`.
- **Test framework**: Vitest, `environment: 'node'`. Correr con `npx vitest run <path>`.
- **Sin emojis en código o mensajes de commit.** Sí en la copy de UI de portal (banner "🔴") — usar tal cual está en el spec.
- **Copy en español** para todo lo que ve el owner (portal, WA). Sin em-dash. Sin "IA" visible.
- **Nunca bloquear la respuesta del webhook** por side effects — usar `after()` de `next/server` para logs/WA, patrón ya establecido en el proyecto.
- **Owner bypass ya existe** en `route.ts:162` (`isOwner`). El fallback path solo aplica cuando `!isOwner`. No modificar la lógica de owner.
- **Backwards compat**: sin `fallback_phone_number` configurado → mantener `PausedByLimit` actual textualmente idéntico.
- **Commits pequeños**: uno por task. Formato `feat(fallback): <descripción>` o `test(fallback): <descripción>`.

---

## File Structure

**Nuevos archivos:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/<ts>_fallback_routing.sql` | Columns en `organizations` + tabla `routing_transitions` |
| `src/lib/billing/fallback-validate.ts` | `isValidE164`, `maskPhoneNumber` (puros, testeables) |
| `src/lib/billing/routing-log.ts` | `logRoutingTransition` helper |
| `src/lib/billing/fallback-notify.ts` | `notifyFallbackActivated`, `notifyFallbackRestored` (WA + dedupe) |
| `src/lib/billing/fallback-restore.ts` | `resetFallbackIfActive` helper para llamar desde topups |
| `tests/integration/fallback-validate.test.ts` | Unit tests de validate/mask |
| `tests/integration/fallback-inbound.test.ts` | Integration test del webhook con y sin fallback |
| `src/app/portal/[token]/FallbackNumberSection.tsx` | Input UI en configurar |
| `src/app/portal/[token]/FallbackBanner.tsx` | Banner "Modo Respaldo Activo" en dashboard/billing |

**Modificados:**

| Archivo | Cambio |
|---|---|
| `src/app/api/voice/inbound/route.ts` | Cargar `fallback_phone_number, fallback_notified_at` en SELECT de `organizations` (línea ~53); insertar bloque fallback antes de `PausedByLimit` (línea ~211) |
| `src/lib/billing/auto-refill.ts` | Llamar `resetFallbackIfActive` tras `apply_ledger_entry` exitoso |
| `src/app/api/billing/webhook/route.ts` | Llamar `resetFallbackIfActive` en compras manuales de minutos (`checkout.session.completed` + `payment_intent.succeeded` cuando `metadata.type === 'minutes_purchase'` o equivalente — grep para confirmar) |
| `src/app/api/cron/reset-minutes/route.ts` | Al avanzar `minutes_reset_date`, `UPDATE organizations SET fallback_notified_at = NULL` para esa portal_email |
| `src/app/portal/[token]/configurar/page.tsx` | Renderizar `<FallbackNumberSection>` cerca de `<CallForwardingSection>` |
| `src/app/portal/[token]/BuyMinutesSection.tsx` | Renderizar `<FallbackBanner>` arriba del contenido |
| `src/app/registro/page.tsx` | Checkbox default-on "Usar este mismo número como respaldo si se agotan mis minutos" en el step del `transfer_whatsapp`; al submit, guardar en `organizations.fallback_phone_number` |
| API PATCH del portal para `organizations` (grep `from('organizations').update` en `src/app/api/portal/`) | Aceptar `fallback_phone_number` con validación E.164 |

**Sin tipo `Organization` central.** El código consulta `organizations` inline. Agregar los dos campos nuevos donde se seleccionan (route.ts) es suficiente; no crear tipo nuevo si no existe uno canónico.

---

## Task 0 — SQL migration

**Files:**
- Create: `supabase/migrations/<UTC_TS>_fallback_routing.sql` (reemplazar `<UTC_TS>` con `date -u +%Y%m%d%H%M%S`)

**Interfaces:**
- Produces: columnas `organizations.fallback_phone_number text`, `organizations.fallback_notified_at timestamptz`; tabla `routing_transitions` con columnas listadas abajo.

- [ ] **Step 1: Crear archivo de migración con el timestamp actual**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
touch "supabase/migrations/${TS}_fallback_routing.sql"
```

- [ ] **Step 2: Pegar el SQL**

```sql
-- Safety net: fallback de llamadas cuando se agotan minutos
-- Ver docs/superpowers/specs/2026-08-09-safety-net-minutos-fallback-design.md

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS fallback_phone_number text,
  ADD COLUMN IF NOT EXISTS fallback_notified_at  timestamptz;

CREATE TABLE IF NOT EXISTS routing_transitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      text NOT NULL,
  agent_id          uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  caller_number     text,
  transition        text NOT NULL CHECK (transition IN ('fallback_activated', 'fallback_restored', 'no_fallback_paused')),
  minutes_used      integer,
  minutes_included  integer,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_transitions_org_time_idx
  ON routing_transitions (portal_email, created_at DESC);
```

- [ ] **Step 3: Aplicar la migración en Supabase**

Pedirle a Nazre que corra el SQL manual en el editor de Supabase (patrón establecido en el proyecto), O si tiene MCP Supabase disponible, usar `mcp__supabase__apply_migration` con el contenido y nombre `fallback_routing`. Verificar con:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'organizations' AND column_name LIKE 'fallback%';
SELECT to_regclass('public.routing_transitions');
```

Esperado: dos filas (fallback_phone_number, fallback_notified_at) y `routing_transitions` no-null.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_fallback_routing.sql
git commit -m "feat(fallback): db migration for fallback routing"
```

---

## Task 1 — Helper `fallback-validate.ts` (puro, sin deps)

**Files:**
- Create: `src/lib/billing/fallback-validate.ts`
- Test: `tests/integration/fallback-validate.test.ts`

**Interfaces:**
- Produces:
  - `isValidE164(phone: string | null | undefined): boolean` — true si matches `/^\+[1-9]\d{7,14}$/`.
  - `maskPhoneNumber(phone: string): string` — enmascara media parte: `+528112345678 → +52 81 **** 5678`.

- [ ] **Step 1: Escribir el test failing**

```ts
// tests/integration/fallback-validate.test.ts
import { describe, it, expect } from 'vitest';
import { isValidE164, maskPhoneNumber } from '@/lib/billing/fallback-validate';

describe('isValidE164', () => {
  it('accepts a valid Mexican number', () => {
    expect(isValidE164('+528112345678')).toBe(true);
  });
  it('rejects missing plus', () => {
    expect(isValidE164('528112345678')).toBe(false);
  });
  it('rejects leading zero after plus', () => {
    expect(isValidE164('+0528112345678')).toBe(false);
  });
  it('rejects null / undefined / empty', () => {
    expect(isValidE164(null)).toBe(false);
    expect(isValidE164(undefined)).toBe(false);
    expect(isValidE164('')).toBe(false);
  });
  it('rejects letters', () => {
    expect(isValidE164('+52abc12345')).toBe(false);
  });
  it('rejects too short', () => {
    expect(isValidE164('+521234567')).toBe(false);
  });
});

describe('maskPhoneNumber', () => {
  it('masks a 13-char Mexican number', () => {
    expect(maskPhoneNumber('+528112345678')).toBe('+52 81 **** 5678');
  });
  it('returns raw if too short to mask', () => {
    expect(maskPhoneNumber('+5281')).toBe('+5281');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/fallback-validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar el helper**

```ts
// src/lib/billing/fallback-validate.ts
const E164_RE = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && E164_RE.test(phone);
}

export function maskPhoneNumber(phone: string): string {
  if (!isValidE164(phone) || phone.length < 10) return phone;
  const country = phone.slice(0, 3);
  const area    = phone.slice(3, 5);
  const last4   = phone.slice(-4);
  return `${country} ${area} **** ${last4}`;
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run tests/integration/fallback-validate.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/fallback-validate.ts tests/integration/fallback-validate.test.ts
git commit -m "feat(fallback): add E.164 validator and phone mask helpers"
```

---

## Task 2 — Helper `routing-log.ts`

**Files:**
- Create: `src/lib/billing/routing-log.ts`

**Interfaces:**
- Consumes: `SupabaseClient` de `@/lib/supabase/admin` (tipo `ReturnType<typeof createAdminClient>`).
- Produces:
  - `logRoutingTransition(supabase, params: { portal_email: string; agent_id?: string | null; caller_number?: string | null; transition: 'fallback_activated' | 'fallback_restored' | 'no_fallback_paused'; minutes_used?: number | null; minutes_included?: number | null; }): Promise<void>` — inserta fila en `routing_transitions`, silencioso ante errores (solo `console.warn`).

- [ ] **Step 1: Implementar el helper**

```ts
// src/lib/billing/routing-log.ts
import type { createAdminClient } from '@/lib/supabase/admin';

type SB = ReturnType<typeof createAdminClient>;

export type RoutingTransition =
  | 'fallback_activated'
  | 'fallback_restored'
  | 'no_fallback_paused';

export interface LogParams {
  portal_email:     string;
  agent_id?:        string | null;
  caller_number?:   string | null;
  transition:       RoutingTransition;
  minutes_used?:    number | null;
  minutes_included?: number | null;
}

export async function logRoutingTransition(supabase: SB, params: LogParams): Promise<void> {
  const { error } = await supabase.from('routing_transitions').insert({
    portal_email:     params.portal_email,
    agent_id:         params.agent_id ?? null,
    caller_number:    params.caller_number ?? null,
    transition:       params.transition,
    minutes_used:     params.minutes_used ?? null,
    minutes_included: params.minutes_included ?? null,
  });
  if (error) {
    console.warn('[routing-log] insert failed:', error.message);
  }
}
```

- [ ] **Step 2: Commit (sin test aparte — helper trivial, se cubre en el integration test de Task 4)**

```bash
git add src/lib/billing/routing-log.ts
git commit -m "feat(fallback): add logRoutingTransition helper"
```

---

## Task 3 — Helper `fallback-notify.ts` con dedupe

**Files:**
- Create: `src/lib/billing/fallback-notify.ts`

**Interfaces:**
- Consumes:
  - `sendWhatsApp(to, body)` de `@/lib/whatsapp/send`.
  - `maskPhoneNumber` de Task 1.
  - Supabase admin client.
- Produces:
  - `notifyFallbackActivated(supabase, org: { portal_email: string; fallback_phone_number: string; fallback_notified_at: string | null; minutes_reset_date?: string | null; transfer_whatsapp?: string | null; guardia_principal?: string | null; }, agentName: string, portalUrl: string): Promise<void>` — dedupe: no envía si `fallback_notified_at > minutes_reset_date` (o `> now() - 30d` si no hay reset date). Marca `fallback_notified_at = now()` tras enviar.
  - `notifyFallbackRestored(supabase, org, agentName): Promise<void>` — WA "Recargado. Las llamadas vuelven a {agentName}."

- [ ] **Step 1: Implementar el helper**

```ts
// src/lib/billing/fallback-notify.ts
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { maskPhoneNumber } from './fallback-validate';
import type { createAdminClient } from '@/lib/supabase/admin';

type SB = ReturnType<typeof createAdminClient>;

export interface FallbackOrg {
  portal_email:           string;
  fallback_phone_number:  string;
  fallback_notified_at:   string | null;
  minutes_reset_date?:    string | null;
  transfer_whatsapp?:     string | null;
  guardia_principal?:     string | null;
}

function shouldNotify(org: FallbackOrg): boolean {
  if (!org.fallback_notified_at) return true;
  const notifiedAt = new Date(org.fallback_notified_at).getTime();
  const cycleStart = org.minutes_reset_date
    ? new Date(org.minutes_reset_date).getTime() - 30 * 24 * 60 * 60 * 1000
    : Date.now() - 30 * 24 * 60 * 60 * 1000;
  return notifiedAt < cycleStart;
}

function resolveDestination(org: FallbackOrg): string | null {
  return org.guardia_principal || org.transfer_whatsapp || null;
}

export async function notifyFallbackActivated(
  supabase: SB,
  org: FallbackOrg,
  agentName: string,
  portalUrl: string,
): Promise<void> {
  if (!shouldNotify(org)) return;
  const to = resolveDestination(org);
  if (!to) return;

  const body =
    `Se agotaron tus minutos de ${agentName} este ciclo. ` +
    `Las llamadas entrantes van a ${maskPhoneNumber(org.fallback_phone_number)} hasta que recargues. ` +
    `Recarga aquí: ${portalUrl}/facturacion`;

  try {
    const ok = await sendWhatsApp(to, body);
    if (ok) {
      await supabase.from('organizations')
        .update({ fallback_notified_at: new Date().toISOString() })
        .eq('portal_email', org.portal_email);
    }
  } catch (err) {
    console.warn('[fallback-notify] activated failed:', (err as Error).message);
  }
}

export async function notifyFallbackRestored(
  supabase: SB,
  org: FallbackOrg,
  agentName: string,
): Promise<void> {
  const to = resolveDestination(org);
  if (!to) return;
  try {
    await sendWhatsApp(to, `Recargado. Las llamadas vuelven a ${agentName}.`);
  } catch (err) {
    console.warn('[fallback-notify] restored failed:', (err as Error).message);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/billing/fallback-notify.ts
git commit -m "feat(fallback): add WhatsApp notify helpers with per-cycle dedupe"
```

---

## Task 4 — Insertar fallback path en `/api/voice/inbound/route.ts`

**Files:**
- Modify: `src/app/api/voice/inbound/route.ts` (dos cambios: SELECT línea ~53, bloque nuevo antes de `PausedByLimit` línea ~211)
- Test: `tests/integration/fallback-inbound.test.ts`

**Interfaces:**
- Consumes: helpers de Tasks 1, 2, 3.
- Produces: nuevo assistant name `FallbackForward` cuando corresponde; el `PausedByLimit` actual queda intacto como fallback del fallback.

- [ ] **Step 1: Extender el SELECT de `organizations`**

En `src/app/api/voice/inbound/route.ts` alrededor de línea 53, cambiar:

```ts
const { data: org } = await supabase
  .from('organizations')
  .select('account_status, suspended_until, calendar_type, calendar_api_key, calendar_event_type_id, calendar_link')
  .eq('portal_email', typedAgent.portal_email)
  .single();
```

Por:

```ts
const { data: org } = await supabase
  .from('organizations')
  .select('account_status, suspended_until, calendar_type, calendar_api_key, calendar_event_type_id, calendar_link, fallback_phone_number, fallback_notified_at, minutes_reset_date, guardia_schedule')
  .eq('portal_email', typedAgent.portal_email)
  .single();
```

Y agregar variables después del bloque `orgCalendar`:

```ts
const orgFallback: {
  fallback_phone_number: string | null;
  fallback_notified_at:  string | null;
  minutes_reset_date:    string | null;
  guardia_principal:     string | null;
} = {
  fallback_phone_number: (org?.fallback_phone_number as string | null) ?? null,
  fallback_notified_at:  (org?.fallback_notified_at as string | null) ?? null,
  minutes_reset_date:    (org?.minutes_reset_date as string | null) ?? null,
  guardia_principal:     ((org as any)?.guardia_schedule?.principal as string | null) ?? null,
};
```

- [ ] **Step 2: Reemplazar el bloque `PausedByLimit`**

Localizar el bloque que empieza con `if (!isOwner && minutesIncluded > 0 && minutesUsedThisMonth >= minutesIncluded) {` (línea ~211). Reemplazar el bloque entero por:

```ts
if (!isOwner && minutesIncluded > 0 && minutesUsedThisMonth >= minutesIncluded) {
  const { isValidE164 } = await import('@/lib/billing/fallback-validate');
  const { logRoutingTransition } = await import('@/lib/billing/routing-log');
  const { after } = await import('next/server');

  const canFallback = typedAgent.portal_email && isValidE164(orgFallback.fallback_phone_number);

  if (canFallback) {
    const fallbackNum = orgFallback.fallback_phone_number as string;

    after(async () => {
      const { notifyFallbackActivated } = await import('@/lib/billing/fallback-notify');
      const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      await notifyFallbackActivated(supabase, {
        portal_email:          typedAgent.portal_email as string,
        fallback_phone_number: fallbackNum,
        fallback_notified_at:  orgFallback.fallback_notified_at,
        minutes_reset_date:    orgFallback.minutes_reset_date,
        transfer_whatsapp:     typedAgent.transfer_whatsapp ?? null,
        guardia_principal:     orgFallback.guardia_principal,
      }, agentName, portalUrl);

      await logRoutingTransition(supabase, {
        portal_email:     typedAgent.portal_email as string,
        agent_id:         typedAgent.id,
        caller_number:    phoneNumber,
        transition:       'fallback_activated',
        minutes_used:     minutesUsedThisMonth,
        minutes_included: minutesIncluded,
      });
    });

    return NextResponse.json({
      assistant: {
        name: 'FallbackForward',
        model: {
          provider: 'anthropic',
          model:    'claude-haiku-4-5-20251001',
          messages: [{
            role: 'system',
            content: 'Di exactamente la frase indicada, luego llama de inmediato a la herramienta transferir_a_dueno. No hagas preguntas ni escuches respuestas.',
          }],
        },
        voice: {
          provider: '11labs',
          voiceId:  typedAgent.elevenlabs_voice_id ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID,
          model:    'eleven_turbo_v2_5',
          stability:       0.45,
          similarityBoost: 0.75,
          style:           0.30,
          speed:           1.05,
          useSpeakerBoost: true,
          optimizeStreamingLatency: 4,
        },
        firstMessage: 'Un momento por favor, le comunicamos.',
        tools: [{
          type: 'transferCall',
          function: {
            name: 'transferir_a_dueno',
            description: 'Transfiere la llamada al número de respaldo del negocio.',
            parameters: { type: 'object', properties: {} },
          },
          destinations: [{
            type:    'number',
            number:  fallbackNum,
            message: 'Llamada entrante a tu negocio (Centinelia sin minutos este ciclo).',
          }],
          messages: [{ type: 'request-start', content: 'Le comunico.' }],
        }],
        endCallMessage:         'Gracias.',
        silenceTimeoutSeconds:  3,
        maxDurationSeconds:     30,
      },
    });
  }

  // Sin fallback configurado → PausedByLimit (comportamiento actual)
  after(async () => {
    await logRoutingTransition(supabase, {
      portal_email:     typedAgent.portal_email as string,
      agent_id:         typedAgent.id,
      caller_number:    phoneNumber,
      transition:       'no_fallback_paused',
      minutes_used:     minutesUsedThisMonth,
      minutes_included: minutesIncluded,
    });
  });

  const pausedMsg = `Gracias por llamar a ${typedAgent.business_name}. En este momento el servicio automatizado se encuentra temporalmente pausado. Por favor contacte al negocio directamente. Gracias.`;
  return NextResponse.json({
    assistant: {
      name: 'PausedByLimit',
      model: {
        provider: 'anthropic',
        model:    'claude-haiku-4-5-20251001',
        messages: [{ role: 'system', content: 'Solo di el mensaje que se te indica y despídete. No respondas ninguna pregunta.' }],
      },
      voice: {
        provider: '11labs',
        voiceId:  typedAgent.elevenlabs_voice_id ?? process.env.ELEVENLABS_DEFAULT_VOICE_ID,
        model:    'eleven_turbo_v2_5',
        stability:       0.45,
        similarityBoost: 0.75,
        style:           0.30,
        speed:           1.05,
        useSpeakerBoost: true,
        optimizeStreamingLatency: 4,
      },
      firstMessage: pausedMsg,
      endCallAfterSilenceSeconds: 5,
    },
  });
}
```

- [ ] **Step 3: Escribir integration test**

```ts
// tests/integration/fallback-inbound.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del admin client — la ruta lo importa desde '@/lib/supabase/admin'
const mockOrg = {
  account_status:         'active',
  suspended_until:        null,
  calendar_type:          null,
  fallback_phone_number:  null as string | null,
  fallback_notified_at:   null,
  minutes_reset_date:     null,
  guardia_schedule:       null,
};
const mockAgent = {
  id:                    'agent-uuid',
  agent_name:            'Nia',
  business_name:         'Negocio Piloto',
  active:                true,
  phone_number:          '+528000000000',
  portal_email:          'piloto@example.com',
  transfer_whatsapp:     '+528111111111',
  minutes_included:      100,
  minutes_used:          100,
  business_hours:        null,
  timezone:              'America/Monterrey',
  features:              {},
  plan:                  'pro',
  elevenlabs_voice_id:   'voice-xyz',
};
const mockAcctMins = { minutes_used: 100, minutes_included: 100 };

const from = vi.fn((table: string) => {
  const q: any = {
    select:  vi.fn(() => q),
    eq:      vi.fn(() => q),
    single:  vi.fn(async () => {
      if (table === 'voice_agents') return { data: mockAgent, error: null };
      if (table === 'organizations') return { data: mockOrg, error: null };
      if (table === 'account_minutes') return { data: mockAcctMins, error: null };
      if (table === 'qb_integrations') return { data: null, error: null };
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    ilike:   vi.fn(() => q),
    neq:     vi.fn(() => q),
    not:     vi.fn(() => q),
    order:   vi.fn(() => q),
    limit:   vi.fn(async () => ({ data: [], error: null })),
    contains: vi.fn(() => q),
    is:      vi.fn(() => q),
    insert:  vi.fn(async () => ({ error: null })),
    update:  vi.fn(async () => ({ error: null })),
  };
  return q;
});
const rpc = vi.fn(async () => ({ data: 0, error: null }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from, rpc }),
}));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (fn: any) => fn() };
});
vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsApp: vi.fn(async () => true) }));
vi.mock('@/lib/voice/prompt-builder', () => ({ buildSystemPrompt: async () => 'system' }));
vi.mock('@/lib/voice/business-hours', () => ({ isWithinBusinessHours: () => true, nextOpenTime: () => null }));

async function callInbound(vapiNumber = '+528000000000', callerNumber = '+528122223333') {
  process.env.VAPI_SERVER_SECRET = 'test';
  const { POST } = await import('@/app/api/voice/inbound/route');
  const req = new Request('http://localhost/api/voice/inbound?secret=test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        phoneNumber: { number: vapiNumber },
        customer:    { number: callerNumber },
      },
    }),
  }) as any;
  req.nextUrl = { searchParams: new URLSearchParams('secret=test') };
  const res = await POST(req);
  return await res.json();
}

beforeEach(() => {
  mockOrg.fallback_phone_number = null;
  mockOrg.fallback_notified_at  = null;
  from.mockClear();
});

describe('/api/voice/inbound — minutes exhausted', () => {
  it('returns PausedByLimit when no fallback configured', async () => {
    mockOrg.fallback_phone_number = null;
    const body = await callInbound();
    expect(body.assistant.name).toBe('PausedByLimit');
  });

  it('returns FallbackForward with transferCall when fallback set', async () => {
    mockOrg.fallback_phone_number = '+528155556666';
    const body = await callInbound();
    expect(body.assistant.name).toBe('FallbackForward');
    const tool = body.assistant.tools[0];
    expect(tool.type).toBe('transferCall');
    expect(tool.destinations[0].number).toBe('+528155556666');
  });

  it('returns PausedByLimit when fallback is malformed', async () => {
    mockOrg.fallback_phone_number = 'not-a-phone';
    const body = await callInbound();
    expect(body.assistant.name).toBe('PausedByLimit');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/integration/fallback-inbound.test.ts`
Expected: 3 tests pass. Si Vitest reporta errores de import de módulos no mockeados en la route (memory/recall, portal/directory, etc.), agregar mocks al patrón `vi.mock('@/lib/...', () => ({ ... }))` con stubs mínimos. **No modificar la ruta para hacer el test pasar** — la ruta ya está bien; agregar los mocks al test hasta que los 3 casos pasen.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice/inbound/route.ts tests/integration/fallback-inbound.test.ts
git commit -m "feat(fallback): route inbound calls to fallback number when minutes exhausted"
```

---

## Task 5 — Auto-restore en topups y cron

**Files:**
- Create: `src/lib/billing/fallback-restore.ts`
- Modify: `src/lib/billing/auto-refill.ts`
- Modify: `src/app/api/billing/webhook/route.ts`
- Modify: `src/app/api/cron/reset-minutes/route.ts`

**Interfaces:**
- Produces:
  - `resetFallbackIfActive(supabase, portalEmail: string, agentName: string): Promise<{ wasActive: boolean }>` — si `organizations.fallback_notified_at IS NOT NULL`, la nulifica, logea `fallback_restored`, y notifica por WA (via `notifyFallbackRestored`). Devuelve `{ wasActive: true }` si estaba activo.

- [ ] **Step 1: Implementar `fallback-restore.ts`**

```ts
// src/lib/billing/fallback-restore.ts
import { logRoutingTransition } from './routing-log';
import { notifyFallbackRestored } from './fallback-notify';
import type { createAdminClient } from '@/lib/supabase/admin';

type SB = ReturnType<typeof createAdminClient>;

export async function resetFallbackIfActive(
  supabase: SB,
  portalEmail: string,
  agentName: string,
): Promise<{ wasActive: boolean }> {
  const { data: org } = await supabase
    .from('organizations')
    .select('fallback_notified_at, fallback_phone_number, transfer_whatsapp, guardia_schedule, minutes_reset_date')
    .eq('portal_email', portalEmail)
    .single();

  if (!org?.fallback_notified_at) return { wasActive: false };

  await supabase.from('organizations')
    .update({ fallback_notified_at: null })
    .eq('portal_email', portalEmail);

  await logRoutingTransition(supabase, {
    portal_email: portalEmail,
    transition:   'fallback_restored',
  });

  await notifyFallbackRestored(supabase, {
    portal_email:          portalEmail,
    fallback_phone_number: (org.fallback_phone_number as string | null) ?? '',
    fallback_notified_at:  org.fallback_notified_at as string,
    minutes_reset_date:    (org.minutes_reset_date as string | null) ?? null,
    transfer_whatsapp:     null,
    guardia_principal:     ((org as any).guardia_schedule?.principal as string | null) ?? null,
  }, agentName);

  return { wasActive: true };
}
```

- [ ] **Step 2: Enganchar en `auto-refill.ts`**

En `src/lib/billing/auto-refill.ts`, después del bloque que llama `apply_ledger_entry` para `portal_email` (línea ~67-75), agregar antes del `return { ok: true, minutesAdded: minutes }`:

```ts
if (agent.portal_email) {
  const { resetFallbackIfActive } = await import('./fallback-restore');
  await resetFallbackIfActive(supabase, agent.portal_email, agent.business_name ?? 'tu empleado');
}
```

- [ ] **Step 3: Enganchar en Stripe webhook**

En `src/app/api/billing/webhook/route.ts`, grepear los case handlers que aplican `apply_ledger_entry` con `kind IN ('purchase','renewal','auto_refill','manual_credit')`:

```bash
grep -n "apply_ledger_entry" src/app/api/billing/webhook/route.ts
```

Para cada llamada exitosa que aplica minutos al pool, agregar justo después del `.rpc('apply_ledger_entry', ...)`:

```ts
if (portalEmail) {
  const { resetFallbackIfActive } = await import('@/lib/billing/fallback-restore');
  await resetFallbackIfActive(supabase, portalEmail, agentName ?? 'tu empleado');
}
```

Donde `portalEmail` y `agentName` son las variables ya en scope de cada handler (revisar el contexto local — pueden llamarse `upgradeEmail`, `portal_email`, `businessName`, etc.).

- [ ] **Step 4: Enganchar en `reset-minutes` cron**

En `src/app/api/cron/reset-minutes/route.ts`, dentro del loop `for (const acct of allAccounts ?? [])` (línea ~34), después del `UPDATE account_minutes ... SET minutes_reset_date` que ya está, agregar:

```ts
await supabase.from('organizations')
  .update({ fallback_notified_at: null })
  .eq('portal_email', acct.portal_email)
  .not('fallback_notified_at', 'is', null);
```

Esto nulifica el flag para todas las orgs cuyo ciclo avanzó, sin importar si estaban en fallback o no (idempotente).

- [ ] **Step 5: Verificar builds**

```bash
npx tsc --noEmit
```

Esperado: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/fallback-restore.ts src/lib/billing/auto-refill.ts src/app/api/billing/webhook/route.ts src/app/api/cron/reset-minutes/route.ts
git commit -m "feat(fallback): auto-restore fallback state on topups and monthly reset"
```

---

## Task 6 — Portal UI: input `FallbackNumberSection` en configurar

**Files:**
- Create: `src/app/portal/[token]/FallbackNumberSection.tsx`
- Modify: `src/app/portal/[token]/configurar/page.tsx`
- Modify (o crear si no existe): API PATCH para `organizations.fallback_phone_number`

**Interfaces:**
- Produces: componente `<FallbackNumberSection token={token} initialValue={string | null} suggestedFromTransferWhatsapp={string | null} />`.

- [ ] **Step 1: Localizar el endpoint API que hace PATCH a `organizations`**

```bash
grep -rn "from('organizations').update" src/app/api/portal/ | head
```

Tomar nota del path. Si hay uno canónico (probablemente algo tipo `src/app/api/portal/[token]/organization/route.ts`), extenderlo para aceptar `fallback_phone_number`. Si no hay endpoint org-level, crear uno nuevo en `src/app/api/portal/[token]/organization/route.ts` con handler PATCH que:
- Verifica sesión con `verifySession` como hacen las otras rutas del portal.
- Acepta `{ fallback_phone_number: string | null }` en el body.
- Valida con `isValidE164` de Task 1 (o null para desactivar).
- Actualiza `organizations` filtrando por `portal_email` de la sesión.

Escribir el handler mínimo — no incluir otros campos que no tengan que ver con este feature.

- [ ] **Step 2: Crear `FallbackNumberSection.tsx`**

```tsx
// src/app/portal/[token]/FallbackNumberSection.tsx
'use client';

import { useState } from 'react';
import { PhoneForwarded } from 'lucide-react';

interface Props {
  token:                          string;
  initialValue:                   string | null;
  suggestedFromTransferWhatsapp:  string | null;
  apiPath:                        string; // e.g. `/api/portal/${token}/organization`
}

const E164_RE = /^\+[1-9]\d{7,14}$/;

export default function FallbackNumberSection({
  token, initialValue, suggestedFromTransferWhatsapp, apiPath,
}: Props) {
  const [value, setValue]     = useState(initialValue ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);

  const isValid = value === '' || E164_RE.test(value);
  const suggestion = suggestedFromTransferWhatsapp && !initialValue ? suggestedFromTransferWhatsapp : null;

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    const res = await fetch(apiPath, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ fallback_phone_number: value || null }),
    });
    setSaving(false);
    if (!res.ok) { setError('No se pudo guardar. Verifica el formato.'); return; }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
      <div className="flex items-center gap-2" style={{ color: '#1A0A3B' }}>
        <PhoneForwarded size={18} />
        <h3 className="font-semibold">Número de respaldo</h3>
      </div>
      <p className="text-sm" style={{ color: '#4A3B6B' }}>
        Cuando se agoten tus minutos del ciclo, las llamadas entrantes se transferirán a este número personal en lugar de colgarse. Se te avisará por WhatsApp cuando esto ocurra.
      </p>
      <input
        type="tel"
        placeholder="+528112345678"
        value={value}
        onChange={e => { setValue(e.target.value.trim()); setSaved(false); }}
        className="px-3 py-2 rounded-lg border text-sm font-mono"
        style={{ borderColor: isValid ? '#E8E3F5' : '#DC2626' }}
      />
      {!isValid && (
        <p className="text-xs" style={{ color: '#DC2626' }}>
          Formato inválido. Usa E.164, por ejemplo +528112345678.
        </p>
      )}
      {suggestion && (
        <button
          type="button"
          onClick={() => setValue(suggestion)}
          className="text-xs text-left underline"
          style={{ color: '#6C3BFF' }}
        >
          Usar {suggestion} (tu WhatsApp de escalación)
        </button>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!isValid || saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#6C3BFF', opacity: (!isValid || saving) ? 0.5 : 1 }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {saved && <span className="text-xs" style={{ color: '#10B981' }}>Guardado.</span>}
        {error && <span className="text-xs" style={{ color: '#DC2626' }}>{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Renderizar en `configurar/page.tsx`**

Cargar la org row al inicio de la page (después de cargar el agent):

```ts
const { data: orgRow } = agent.portal_email
  ? await supabase.from('organizations')
      .select('fallback_phone_number')
      .eq('portal_email', agent.portal_email)
      .single()
  : { data: null };
```

Y renderizar cerca de `<CallForwardingSection>` (buscar en el JSX):

```tsx
<FallbackNumberSection
  token={token}
  initialValue={(orgRow?.fallback_phone_number as string | null) ?? null}
  suggestedFromTransferWhatsapp={(agent as any).transfer_whatsapp ?? null}
  apiPath={`/api/portal/${token}/organization`}
/>
```

Importar `FallbackNumberSection` con los otros imports del archivo.

- [ ] **Step 4: Verificar build + smoke manual**

```bash
npx tsc --noEmit
npm run dev
```

Abrir `/portal/<token>/configurar` en el navegador, verificar que la sección se muestra, guardar un número, verificar en Supabase que la fila de `organizations` se actualizó.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/\[token\]/FallbackNumberSection.tsx src/app/portal/\[token\]/configurar/page.tsx src/app/api/portal/
git commit -m "feat(fallback): portal UI to configure fallback phone number"
```

---

## Task 7 — Portal UI: banner "Modo Respaldo Activo" en BuyMinutesSection

**Files:**
- Create: `src/app/portal/[token]/FallbackBanner.tsx`
- Modify: `src/app/portal/[token]/BuyMinutesSection.tsx`

**Interfaces:**
- Produces: `<FallbackBanner state="active" | "no_fallback" | "warning" fallbackMasked={string | null} agentName={string} />`.
  - `active`: rojo, muestra `fallbackMasked`, CTA a comprar minutos.
  - `no_fallback`: ámbar, "Sin respaldo — llamadas se pausan", CTA a configurar.
  - `warning`: amarillo (temprano, ≥80% sin fallback), "Configura un número de respaldo antes de agotar minutos".

- [ ] **Step 1: Crear `FallbackBanner.tsx`**

```tsx
// src/app/portal/[token]/FallbackBanner.tsx
'use client';

import Link from 'next/link';

type State = 'active' | 'no_fallback' | 'warning';

interface Props {
  state:          State;
  fallbackMasked: string | null;
  agentName:      string;
  configurarHref: string;
}

const COLORS: Record<State, { bg: string; border: string; text: string; icon: string }> = {
  active:       { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B', icon: '🔴' },
  no_fallback:  { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: '🟡' },
  warning:      { bg: '#FEF9C3', border: '#EAB308', text: '#854D0E', icon: '🟡' },
};

export default function FallbackBanner({ state, fallbackMasked, agentName, configurarHref }: Props) {
  const c = COLORS[state];
  const title = state === 'active'      ? 'Modo Respaldo Activo'
              : state === 'no_fallback' ? 'Sin número de respaldo configurado'
              : 'Se están agotando tus minutos';

  const body = state === 'active'
    ? (fallbackMasked
        ? `Se agotaron los minutos de ${agentName} este ciclo. Las llamadas entrantes van a ${fallbackMasked}. Recarga minutos para reactivar ${agentName}.`
        : `Se agotaron los minutos y no hay número de respaldo. Las llamadas se están pausando.`)
    : state === 'no_fallback'
      ? `${agentName} no podrá atender llamadas cuando se agoten tus minutos. Configura un número de respaldo para no perder ventas.`
      : `Configura un número de respaldo antes de agotar minutos para que ${agentName} pueda transferir en lugar de colgarse.`;

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <span className="text-xl leading-none">{c.icon}</span>
      <div className="flex-1 flex flex-col gap-2">
        <h3 className="font-semibold text-sm" style={{ color: c.text }}>{title}</h3>
        <p className="text-sm" style={{ color: c.text }}>{body}</p>
        {state !== 'active' && (
          <Link href={configurarHref} className="text-xs underline" style={{ color: c.text }}>
            Configurar respaldo
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar en `BuyMinutesSection.tsx`**

Leer el archivo:

```bash
grep -n "export" src/app/portal/\[token\]/BuyMinutesSection.tsx | head
```

Extender el server component (o el parent que lo renderiza) para pasar props:
- `minutesUsed` y `minutesIncluded` — ya deberían estar cargados.
- `fallback_phone_number` de `organizations`.

Calcular estado:

```ts
import { maskPhoneNumber, isValidE164 } from '@/lib/billing/fallback-validate';

const exhausted = minutesIncluded > 0 && minutesUsed >= minutesIncluded;
const warning80 = minutesIncluded > 0 && minutesUsed >= minutesIncluded * 0.8 && !exhausted;
const hasFb     = isValidE164(fallback_phone_number);

const bannerState: 'active' | 'no_fallback' | 'warning' | null =
    exhausted && hasFb     ? 'active'
  : exhausted && !hasFb    ? 'no_fallback'
  : warning80 && !hasFb    ? 'warning'
  : null;
```

Renderizar `<FallbackBanner>` arriba del contenido si `bannerState !== null`:

```tsx
{bannerState && (
  <FallbackBanner
    state={bannerState}
    fallbackMasked={hasFb ? maskPhoneNumber(fallback_phone_number!) : null}
    agentName={agentName}
    configurarHref={`/portal/${token}/configurar`}
  />
)}
```

- [ ] **Step 3: Smoke manual**

En Supabase, setear `account_minutes.minutes_used = minutes_included` para tu portal_email. Recargar `/portal/<token>` — el banner debe aparecer. Restaurar `minutes_used = 0` cuando termines.

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/\[token\]/FallbackBanner.tsx src/app/portal/\[token\]/BuyMinutesSection.tsx
git commit -m "feat(fallback): portal banner for active/warning fallback states"
```

---

## Task 8 — Registro: checkbox para auto-populate `fallback_phone_number`

**Files:**
- Modify: `src/app/registro/page.tsx` (o el step que captura `transfer_whatsapp` — grep `transfer_whatsapp` dentro de `src/app/registro/`)

**Interfaces:**
- Producto final: al terminar el signup, si el checkbox está marcado (default true), `organizations.fallback_phone_number = transfer_whatsapp` en la misma inserción/update.

- [ ] **Step 1: Localizar dónde se pide `transfer_whatsapp` en registro**

```bash
grep -rn "transfer_whatsapp\|whatsapp" src/app/registro/ | head
```

Identificar el step/formulario. Puede estar en `page.tsx` o en subarchivos step. Anotar el path.

- [ ] **Step 2: Agregar el checkbox al form**

Cerca del input de `transfer_whatsapp` agregar:

```tsx
const [useAsFallback, setUseAsFallback] = useState(true);

// ... en el JSX, debajo del input de whatsapp:
<label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: '#4A3B6B' }}>
  <input
    type="checkbox"
    checked={useAsFallback}
    onChange={e => setUseAsFallback(e.target.checked)}
    className="mt-1"
  />
  <span>
    Usar este mismo número como respaldo si se agotan mis minutos.
    Si no lo activas, las llamadas se pausarán cuando llegues al límite.
  </span>
</label>
```

- [ ] **Step 3: Pasar el flag al submit**

En el handler de submit, cuando se hace el insert/update de `organizations` (o cuando se llama al endpoint que lo hace):

```ts
body: JSON.stringify({
  // ... campos existentes
  transfer_whatsapp:     whatsapp,
  fallback_phone_number: useAsFallback ? whatsapp : null,
}),
```

Y en el endpoint del servidor que procesa el signup (grep `insert.*organizations` en `src/app/api/registro/` o similar), aceptar y persistir `fallback_phone_number`.

- [ ] **Step 4: Smoke manual**

Crear un signup de prueba con un email distinto → verificar en Supabase que `organizations.fallback_phone_number` quedó poblado con el mismo valor de `transfer_whatsapp`. Desmarcar el checkbox en otro signup → verificar que queda `NULL`.

- [ ] **Step 5: Commit**

```bash
git add src/app/registro/ src/app/api/registro/
git commit -m "feat(fallback): auto-populate fallback number from WhatsApp during signup"
```

---

## Task 9 — E2E manual con piloto real

**Files:** ninguno.

- [ ] **Step 1: Preparar la cuenta piloto**

En Supabase SQL editor:

```sql
-- Reemplaza con el portal_email real del piloto
SELECT set_config('my.email', 'piloto@example.com', true);

-- Verificar estado actual
SELECT portal_email, fallback_phone_number, fallback_notified_at
  FROM organizations
 WHERE portal_email = current_setting('my.email');

-- Setear un fallback distinto al número Centinelia (tu celular)
UPDATE organizations
   SET fallback_phone_number = '+528111111111'  -- tu celular real
 WHERE portal_email = current_setting('my.email');

-- Forzar minutos agotados
UPDATE account_minutes
   SET minutes_used = minutes_included
 WHERE portal_email = current_setting('my.email');
```

- [ ] **Step 2: Llamar al número Centinelia desde otro teléfono**

Marcar el número asignado al agente del piloto. Debe:
1. Contestar "Un momento por favor, le comunicamos."
2. Transferir → tu celular suena.
3. Al descolgar, la llamada del caller queda conectada contigo.

- [ ] **Step 3: Verificar WA de aviso**

En el WhatsApp del owner (o `guardia_schedule.principal`), verificar que llegó el mensaje: "Se agotaron tus minutos de {agentName} este ciclo. Las llamadas entrantes van a +52 81 **** 1111 hasta que recargues. Recarga aquí: {portalUrl}/facturacion".

- [ ] **Step 4: Simular recarga**

```sql
SELECT apply_ledger_entry(
  p_portal_email := 'piloto@example.com',
  p_agent_id     := (SELECT id FROM voice_agents WHERE portal_email = 'piloto@example.com' LIMIT 1),
  p_amount       := 50,
  p_kind         := 'manual_credit',
  p_reference_id := 'e2e-test',
  p_description  := 'E2E test topup'
);
```

Verificar:

```sql
SELECT fallback_notified_at FROM organizations WHERE portal_email = 'piloto@example.com';
-- Esperado: NULL

SELECT transition, created_at FROM routing_transitions
 WHERE portal_email = 'piloto@example.com' ORDER BY created_at DESC LIMIT 5;
-- Esperado: filas fallback_restored y fallback_activated
```

**Nota:** el `resetFallbackIfActive` corre desde `auto-refill.ts` y desde el Stripe webhook. Si el `apply_ledger_entry` se llama directo desde SQL, `resetFallbackIfActive` NO corre automáticamente. Esto está OK para el E2E manual — en producción real, el reset viene del código JS que envuelve la RPC (auto-refill o webhook handler).

- [ ] **Step 5: Llamar de nuevo al número Centinelia**

Debe atender el assistant normal de Nia (o el agente del piloto), no el fallback.

- [ ] **Step 6: Cleanup**

```sql
UPDATE account_minutes SET minutes_used = 0 WHERE portal_email = 'piloto@example.com';
UPDATE organizations
   SET fallback_phone_number = NULL, fallback_notified_at = NULL
 WHERE portal_email = 'piloto@example.com';
DELETE FROM routing_transitions WHERE portal_email = 'piloto@example.com' AND caller_number IS NULL;
```

- [ ] **Step 7: Actualizar la memoria del handoff**

Editar `memory/handoff_minutos_agotados_safety_net.md`: agregar sección "CERRADO YYYY-MM-DD" al inicio, con commit SHAs y notas del E2E. Actualizar el índice `MEMORY.md` con la fecha de cierre.

- [ ] **Step 8: Commit**

```bash
git add memory/handoff_minutos_agotados_safety_net.md memory/MEMORY.md
git commit -m "chore(memory): close fallback safety-net handoff after E2E"
```

---

## Notas de operación

- El logging a `routing_transitions` es solo para audit — no hay UI todavía. Consulta con SQL directo cuando se necesite.
- Si Twilio está caído, el WA falla silenciosamente pero la transferencia de la llamada sigue funcionando. `fallback_notified_at` no se actualiza → el próximo intento reenvía el WA.
- El fallback path agrega ~1-2s de latencia (paso extra de `transferCall`). Aceptable en el edge case de sin-minutos.
- Sin `fallback_phone_number` configurado, el comportamiento es idéntico al de hoy (backwards compat total).
