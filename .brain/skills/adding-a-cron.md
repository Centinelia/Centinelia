---
name: adding-a-cron
description: Use when adding, modifying, or reviewing a cron endpoint in /api/cron/*. Enforces defineCron wrapper, observability, partial-failure alerts, and testability. Applies to all 63+ active crons in Centinelia.
type: skill
owner: nazre
last_verified: 2026-09-14
inputs:
  - cron name (matches route)
  - schedule (cron expression para vercel.json)
  - lo que procesa (agents, invoices, tasks, etc)
  - alerts esperadas (partial failure, timeout)
output: PR con defineCron aplicado + entry en vercel.json + tests
---

# Adding a cron

## Antes de escribir código

63 crons corren en Centinelia hoy. Los bugs recurrentes son:
- Cron falla silenciosamente y nadie se entera (Nash lo detecta 30-60 min después)
- Partial failure (procesa 40 de 42 items) sin alertar
- No hay métricas de duración → detectar degradación es imposible
- Copy-paste del auth block (verifyCronAuth) en cada archivo
- Cero tests → cambios rompen crons sin notarlo

Todos estos casos están cubiertos por `defineCron`. **NO reescribas auth, alertas o el registro en cron_runs** — usa el helper.

---

## Pattern estándar (usa esto)

```ts
import { defineCron, errorMessage } from '@/lib/cron/define-cron';

export const dynamic = 'force-dynamic';

export const GET = defineCron({
  name: 'mi-cron',
  maxDuration: 300,  // soft budget en segundos
  handler: async ({ supabase, now, log }) => {
    const { data: items } = await supabase.from('t').select('*').eq('status', 'pending');
    let processed = 0;
    const errors: string[] = [];

    for (const item of items ?? []) {
      try {
        await doWork(item);
        processed++;
      } catch (err) {
        errors.push(`${item.id}: ${errorMessage(err)}`);
        log.error(`item ${item.id} failed`, { error: errorMessage(err) });
      }
    }

    return {
      expected:  items?.length ?? 0,
      processed,
      errors,
      metadata:  { any_extra_debug_info: true },
    };
  },
});
```

**Lo que `defineCron` cubre automáticamente:**

| Invariante | Cómo |
|---|---|
| Auth `Bearer ${CRON_SECRET}` | verifyCronAuth automático → 401 si falla |
| Timing start/end/duration | Console log estructurado + row en cron_runs |
| Partial failure alert | Si `processed < expected` OR `errors.length > 0` → alertCronPartialFailure |
| Handler crash | try/catch global → 500 + status=error + alert |
| Timeout soft | Si `duration > maxDuration*1000` → status=timeout |
| Observability | Row en cron_runs con status/duration/counts/errors |
| Response consistente | `{ ok, cron, status, duration_ms, expected, processed, errors_count }` |

---

## Handler contract

Tu handler debe retornar `CronResult`:

```ts
interface CronResult {
  expected:  number;               // total items a procesar
  processed: number;               // items completados OK
  errors?:   string[];             // mensajes de error acumulados
  metadata?: Record<string, unknown>;  // debug libre
}
```

**Status classification automática**:

- `ok` — `processed === expected` y `errors.length === 0`
- `partial` — cualquier item no procesado o cualquier error acumulado
- `error` — el handler lanzó una excepción
- `timeout` — el handler tardó más de `maxDuration` segundos

Alerts se disparan automáticamente en `partial` y `error` (via `alertCronPartialFailure`).

Para crons "scanner" (que por diseño no procesan todo, ej. dispatch de encuestas cuando encuentra 3 de 50 a mandar), usa `silenceAlerts: true`.

---

## Cuándo NO usar este pattern

- **Webhooks entrantes**: usa `withWebhookAuth` (`src/lib/webhooks/with-webhook-auth.ts`).
- **APIs autenticadas por sesión**: usa `withPortalAuth`.
- **Fire-and-forget desde otro handler**: no es un cron, es un worker — no lo envuelvas.

---

## Migrar un cron existente

Si un `route.ts` ya tiene el patrón viejo:

```ts
// ANTES:
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const now = new Date();
  // ... loop con try/catch ...
  return NextResponse.json({ ok: true, ran });
}
```

Cambios mecánicos:

1. Imports: quita `NextRequest, NextResponse, createAdminClient, verifyCronAuth`. Agrega `defineCron, errorMessage`.
2. Envuelve: `export const GET = defineCron({ name: 'xxx', handler: async ({ supabase, now, log }) => { ... } });`
3. Cambia los `NextResponse.json` internos por `return { expected, processed, errors, metadata }`.
4. En lugar de `console.error`, usa `log.error(msg, meta)` — auto-prefija con `[cron:name]`.
5. Verifica compilación + tests.

Ejemplos ya migrados:
- `src/app/api/cron/nash-monitor/route.ts` — Simple, silenceAlerts (Nash es el detector).
- `src/app/api/cron/expire-insights/route.ts` — Compacto, lanza en error.
- `src/app/api/cron/heartbeat/route.ts` — Complejo, con skipped counter y metadata.

---

## Tests

El harness `src/lib/cron/__tests__/test-utils.ts` te da todo:

```ts
import { makeCronRequest, setCronSecret } from '@/lib/cron/__tests__/test-utils';
import { createSupabaseMock } from '@/lib/portal/__tests__/test-utils';
import { GET } from '../route';

beforeEach(() => {
  setCronSecret();  // stubs CRON_SECRET env var
});

it('procesa 3 items', async () => {
  const supabase = createSupabaseMock();
  supabase.setResults([...]);  // mock queries
  vi.mocked(createAdminClient).mockReturnValue(supabase);

  const res = await GET(makeCronRequest());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.processed).toBe(3);
});
```

**Checklist mínimo de tests**:

- [ ] 401 sin Bearer / con bearer incorrecto
- [ ] 200 en happy path con conteos correctos
- [ ] Partial failure dispara alert (verificar mock `alertCronPartialFailure`)
- [ ] Handler throw → 500 + status=error
- [ ] Metadata en response cuando aplica

---

## vercel.json

Después de migrar, agrega la entrada en `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/mi-cron", "schedule": "0 * * * *" }
  ]
}
```

Convención: schedule en UTC. Si el cron es timezone-sensitive (ej. heartbeat corre a la hora local del cliente), documenta en el header del handler.

---

## Observabilidad: leer cron_runs

Tabla `cron_runs` (ver `supabase/migrations/20260914120000_cron_runs.sql`):

```sql
-- Últimos 20 runs de un cron
SELECT * FROM cron_runs WHERE cron_name = 'heartbeat' ORDER BY started_at DESC LIMIT 20;

-- Todos los crons con fallos en la última hora
SELECT cron_name, status, error_sample FROM cron_runs
WHERE started_at > now() - interval '1 hour' AND status IN ('error', 'partial', 'timeout')
ORDER BY started_at DESC;

-- p95 duración por cron (última semana)
SELECT cron_name, percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)
FROM cron_runs WHERE started_at > now() - interval '7 days'
GROUP BY cron_name ORDER BY 2 DESC;
```

Nash puede extender su lógica para alertar cuando un cron tiene 3+ runs `partial`/`error` consecutivos — leyendo directamente de `cron_runs` en vez de detectarlo por síntoma downstream.

---

## Ver también

- `src/lib/cron/define-cron.ts` — implementación del wrapper
- `src/lib/cron/alert-partial-failure.ts` — helper de alerta (heredado)
- `src/lib/auth/cron-auth.ts` — verify CRON_SECRET
- [[../decisions/2026-08-10-cron-alerts-h13]] — decisión histórica sobre alertas parciales (si existe)
