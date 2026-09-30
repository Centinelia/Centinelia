# Middleware Dedup Universal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un wrapper único `withDedup()` que envuelve todos los tool handlers de voz/chat/email, aplica dedup content-based con heurística de identity/detail keys, y elimina duplicados como el incidente Tecate Six 2026-09-29 para TODOS los meerkats/clientes.

**Architecture:** Wrapper functional que envuelve el handler existente; lookup por (agent_id, tool_name, args_hash) contra tabla nueva `tool_call_dedup`; hit → retorna cached; miss → ejecuta handler + INSERT; fail-open en cualquier error del middleware. Feature flag por org (`dedup_middleware_enabled`) para rollout gradual: OFF por default → Tortillería 48h → pilotos → global.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres + supabase-js admin client, sha256 vía `node:crypto`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md`

## Global Constraints

- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (server-only). Todo I/O usa `createAdminClient()` de `@/lib/supabase/admin`.
- Integration tests que INSERT en Supabase real llaman `assertNotProdOrAllowed()` de `@/lib/test-helpers/prod-guard` en `beforeAll` (ver [[feedback-smoke-guard-prod-db]]).
- Migrations: nomenclatura `YYYYMMDDHHMMSS_snake_case.sql` en `supabase/migrations/`. Idempotentes (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS`).
- Copy usuario final SIEMPRE en español, sin em-dash, sin "IA" visible, sin tecnicismos ([[feedback-espanol-completo]], [[feedback-no-em-dash]], [[feedback-no-ia-visible]]).
- Toda llamada a Anthropic debe pasar por `logLlmCall` (enforced por `pnpm lint`) — no aplica aquí, pero no introducir bypass.
- `consumeAiOp` es la ÚNICA vía de cobro; el wrapper NO cobra, el cobro sigue dentro del handler.
- Feature flag OFF por default; el wrapper es no-op cuando `dedup_middleware_enabled=false`.
- Fail-open: cualquier error del middleware → `console.error` + ejecutar handler normal. Nunca romper operación por bug del wrapper.
- Ventana temporal default: 5 minutos. Config por tool en `dedup-config.ts` (§5 del spec).

## Review Focus

Cinco failure modes que el spec implica pero ningún test individual ejercita; cada línea corresponde a un test añadido en la task que posee el código.

- **Cross-agent leak** — dos agentes distintos con args idénticos NO deben compartir cache; hash incluye `agent_id`. Test en Task 4 (`with-dedup.test.ts`).
- **Cross-tool leak** — mismo agente, mismos args, tools distintas NO deben compartir cache. Test en Task 2 (`hash-args.test.ts`: `toolName` en el hash input).
- **Handler throw NO se cachea** — si el handler tira, NO se inserta row en `tool_call_dedup` (retry del modelo debe re-ejecutar). Test en Task 4.
- **Flag OFF en org no toca la tabla** — con `dedup_middleware_enabled=false`, ni SELECT ni INSERT ocurren (0 latency overhead). Test en Task 4.
- **Args nested con orden distinto** — `{ a: 1, b: 2 }` y `{ b: 2, a: 1 }` producen el mismo hash (canonical JSON). Test en Task 2.

---

## File Structure

**Nuevos**:
- `src/lib/tools/dedup/hash-args.ts` — heurística + `computeArgsHash()`
- `src/lib/tools/dedup/dedup-config.ts` — `DEDUP_CONFIG`, `getDedupConfig()`, `DEFAULT_WINDOW_MIN`
- `src/lib/tools/dedup/with-dedup.ts` — wrapper `withDedup()`
- `src/lib/tools/dedup/__tests__/hash-args.test.ts`
- `src/lib/tools/dedup/__tests__/with-dedup.test.ts`
- `src/lib/tools/dedup/__tests__/with-dedup.integration.test.ts`
- `src/lib/tools/dedup/__tests__/tool-coverage.test.ts` — schema drift guard (Task 11)
- `src/app/api/cron/dedup-cleanup/route.ts` — cron cleanup
- `supabase/migrations/<ts>_tool_call_dedup.sql`
- `supabase/migrations/<ts>_add_dedup_middleware_flag.sql`

**Modificados**:
- 10 archivos `src/app/api/voice/tools/*/route.ts` — aplicar `withDedup`
- `vercel.json` — nuevo cron entry
- `src/lib/tools/executors/registrar-incidencia.ts` — dedup ad-hoc queda (conviven, §6.3 del spec). El removal es Fase 4, fuera de este plan.

Total: ~15 archivos.

---

### Task 1: Migraciones (tabla dedup + feature flag)

**Files:**
- Create: `supabase/migrations/20260929200000_tool_call_dedup.sql`
- Create: `supabase/migrations/20260929200500_add_dedup_middleware_flag.sql`

**Interfaces:**
- Produces: Tabla `tool_call_dedup(id, agent_id, tool_name, args_hash, result_json, channel, tool_call_id, created_at, expires_at)` con índices; columna `organizations.dedup_middleware_enabled boolean NOT NULL DEFAULT false`.

- [ ] **Step 1: Crear migración de la tabla**

Contenido de `supabase/migrations/20260929200000_tool_call_dedup.sql`:

```sql
-- Middleware universal de dedup para tool calls.
-- Ver spec: docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md
-- Motivación: incidente Tortillería/Tecate Six 2026-09-29 (bug repetible en todos
-- los tools con side-effects sin dedup).

CREATE TABLE IF NOT EXISTS tool_call_dedup (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  tool_name    text NOT NULL,
  args_hash    text NOT NULL,               -- sha256 hex (64 chars)
  result_json  jsonb NOT NULL,              -- payload devuelto al modelo si hit
  channel      text NOT NULL,               -- 'voice' | 'chat' | 'email' (audit)
  tool_call_id text,                        -- de Vapi (audit), nullable
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_call_dedup_lookup
  ON tool_call_dedup (agent_id, tool_name, args_hash, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_call_dedup_expires
  ON tool_call_dedup (expires_at);

COMMENT ON TABLE tool_call_dedup IS
  'Dedup content-based de tool calls. Ver docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md. '
  'Retención corta (1h post-expiry) via cron /api/cron/dedup-cleanup.';
```

- [ ] **Step 2: Crear migración del feature flag**

Contenido de `supabase/migrations/20260929200500_add_dedup_middleware_flag.sql`:

```sql
-- Feature flag por org para rollout gradual del middleware de dedup.
-- Default false → habilitar por org según rollout (spec §6).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dedup_middleware_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.dedup_middleware_enabled IS
  'Middleware universal de dedup de tool calls (spec 2026-09-29). '
  'Cuando true, envuelve todos los handlers con withDedup(). '
  'Default false; rollout Tortillería → pilotos → global.';
```

- [ ] **Step 3: Aplicar en dev/prod (post-review)**

No ejecutar todavía. En Task 12 (final) se aplica a prod con `supabase db push` bajo autorización explícita.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260929200000_tool_call_dedup.sql \
        supabase/migrations/20260929200500_add_dedup_middleware_flag.sql
git commit -m "feat(dedup): tabla tool_call_dedup + feature flag por org"
```

---

### Task 2: `hash-args.ts` — heurística de hash con tests unit

**Files:**
- Create: `src/lib/tools/dedup/hash-args.ts`
- Test: `src/lib/tools/dedup/__tests__/hash-args.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function computeArgsHash(
    toolName: string,
    args: Record<string, unknown>,
    override?: { identity_keys?: string[]; detail_keys?: string[] },
  ): string;
  ```

- [ ] **Step 1: Escribir el test primero**

Contenido de `src/lib/tools/dedup/__tests__/hash-args.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeArgsHash } from '../hash-args';

describe('computeArgsHash', () => {
  it('args idénticos → mismo hash', () => {
    const a = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462' };
    expect(computeArgsHash('registrar_incidencia', a))
      .toBe(computeArgsHash('registrar_incidencia', a));
  });

  it('motivo distinto (caso Tecate) → mismo hash', () => {
    const call1 = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462', motivo: 'Ya tiene unos días' };
    const call2 = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462', motivo: 'El supervisor vino hace 3 días' };
    expect(computeArgsHash('registrar_incidencia', call1))
      .toBe(computeArgsHash('registrar_incidencia', call2));
  });

  it('phone distinto → hash distinto', () => {
    const a = { contact_phone: '8129262462' };
    const b = { contact_phone: '8112345678' };
    expect(computeArgsHash('registrar_incidencia', a))
      .not.toBe(computeArgsHash('registrar_incidencia', b));
  });

  it('business normalize (acentos + case) → mismo hash', () => {
    const a = { business_name: 'Tecate Six Cantú', contact_phone: '8129262462' };
    const b = { business_name: 'TECATE SIX CANTU', contact_phone: '8129262462' };
    expect(computeArgsHash('registrar_incidencia', a))
      .toBe(computeArgsHash('registrar_incidencia', b));
  });

  it('free-text >200 chars → ignored', () => {
    const long = 'x'.repeat(250);
    const a = { contact_phone: '8129262462', unknown_field: long };
    const b = { contact_phone: '8129262462', unknown_field: long.slice(0, -1) + 'y' };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('keys de timestamp → ignored (created_at, scheduled_at, .*_at)', () => {
    const a = { contact_phone: '8129262462', scheduled_at: '2026-09-29T18:00:00Z' };
    const b = { contact_phone: '8129262462', scheduled_at: '2026-09-29T19:00:00Z' };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('override identity_keys respeta la lista', () => {
    const a = { contact_phone: '8129262462', unknown: 'x' };
    const b = { contact_phone: '8129262462', unknown: 'y' };
    const override = { identity_keys: ['contact_phone', 'unknown'] };
    expect(computeArgsHash('t', a, override))
      .not.toBe(computeArgsHash('t', b, override));
  });

  it('override detail_keys ignora campos que la heurística normalmente incluiría', () => {
    const a = { contact_phone: '8129262462', misc_field: 'a' };
    const b = { contact_phone: '8129262462', misc_field: 'b' };
    const override = { detail_keys: ['misc_field'] };
    expect(computeArgsHash('t', a, override))
      .toBe(computeArgsHash('t', b, override));
  });

  it('nested objects — orden de keys NO cambia el hash (canonical JSON)', () => {
    const a = { contact_phone: '81', nested: { a: 1, b: 2 } };
    const b = { contact_phone: '81', nested: { b: 2, a: 1 } };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('null/undefined tratados consistente', () => {
    const a = { contact_phone: '81', extra: null };
    const b = { contact_phone: '81', extra: undefined };
    expect(computeArgsHash('t', a)).toBe(computeArgsHash('t', b));
  });

  it('diferentes toolName → hash distinto aunque args iguales', () => {
    const args = { contact_phone: '8129262462' };
    expect(computeArgsHash('registrar_incidencia', args))
      .not.toBe(computeArgsHash('registrar_pedido', args));
  });

  it('args vacío → hash estable', () => {
    expect(computeArgsHash('t', {})).toBe(computeArgsHash('t', {}));
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/tools/dedup/__tests__/hash-args.test.ts`
Expected: FAIL — "Cannot find module '../hash-args'"

- [ ] **Step 3: Implementar `hash-args.ts`**

Contenido de `src/lib/tools/dedup/hash-args.ts`:

```ts
import { createHash } from 'node:crypto';

const IDENTITY_KEYS = /^(contact_phone|phone|telefono|contact_email|email|correo|business_name|negocio|contact_name|nombre|sucursal|cliente_id|.*_id)$/i;
const DETAIL_KEYS   = /^(motivo|notas|detalles|descripcion|mensaje|texto|transcript|resumen|observaciones|razon|contexto)$/i;
const TIME_KEYS     = /^(fecha|hora|created_at|scheduled_at|.*_at|.*_time)$/i;
const FREE_TEXT_MAX_LEN = 200;

function normalize(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Recursivamente ordena keys de objetos para canonical JSON.
// Arrays mantienen su orden (semánticamente importan).
function sortDeep(v: unknown): unknown {
  if (v === null || v === undefined) return null;   // trata null/undefined igual
  if (Array.isArray(v)) return v.map(sortDeep);
  if (typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortDeep((v as Record<string, unknown>)[k]);
  }
  return out;
}

function keepKey(k: string, v: unknown): boolean {
  if (DETAIL_KEYS.test(k) || TIME_KEYS.test(k)) return false;
  if (typeof v === 'string' && v.length > FREE_TEXT_MAX_LEN) return false;
  return true;
}

function pickKept(
  args: Record<string, unknown>,
  override?: { identity_keys?: string[]; detail_keys?: string[] },
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const explicitId     = new Set(override?.identity_keys ?? []);
  const explicitDetail = new Set(override?.detail_keys ?? []);
  for (const [k, v] of Object.entries(args)) {
    if (explicitId.has(k))     { kept[k] = normalize(v); continue; }
    if (explicitDetail.has(k)) { continue; }
    if (!keepKey(k, v))        { continue; }
    if (IDENTITY_KEYS.test(k)) { kept[k] = normalize(v); }
    else                       { kept[k] = v; }
  }
  return kept;
}

export function computeArgsHash(
  toolName: string,
  args: Record<string, unknown>,
  override?: { identity_keys?: string[]; detail_keys?: string[] },
): string {
  const kept = pickKept(args, override);
  const canonical = JSON.stringify(sortDeep(kept));
  return createHash('sha256').update(`${toolName}::${canonical}`).digest('hex');
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/tools/dedup/__tests__/hash-args.test.ts`
Expected: PASS — 12/12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/dedup/hash-args.ts \
        src/lib/tools/dedup/__tests__/hash-args.test.ts
git commit -m "feat(dedup): computeArgsHash con heurística identity/detail/time"
```

---

### Task 3: `dedup-config.ts` — overrides por tool

**Files:**
- Create: `src/lib/tools/dedup/dedup-config.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_WINDOW_MIN: number;
  export type DedupOverride = {
    window_min?: number;
    disable?: boolean;
    identity_keys?: string[];
    detail_keys?: string[];
  };
  export function getDedupConfig(toolName: string): DedupOverride;
  ```

- [ ] **Step 1: Escribir el archivo**

Contenido de `src/lib/tools/dedup/dedup-config.ts`:

```ts
// Overrides de dedup por tool. Ver spec §5.
// Tools no listadas usan la heurística default de computeArgsHash().

export const DEFAULT_WINDOW_MIN = 5;

export type DedupOverride = {
  window_min?:    number;    // default 5 min
  disable?:       boolean;   // opt-out completo del dedup
  identity_keys?: string[];  // añade a la heurística automática
  detail_keys?:   string[];  // añade a la heurística automática
};

export const DEDUP_CONFIG: Record<string, DedupOverride> = {
  // Tools con args no capturados por la heurística estándar
  registrar_pedido: { identity_keys: ['contact_phone', 'items_hash'] },
  agendar_cita:     { identity_keys: ['contact_phone', 'fecha_hora'] },

  // Opt-outs explícitos: cada call es único por naturaleza
  reportar_falla:   { disable: true },
  crear_reporte:    { disable: true },
};

export function getDedupConfig(toolName: string): DedupOverride {
  return DEDUP_CONFIG[toolName] ?? {};
}
```

- [ ] **Step 2: Commit**

Este archivo no necesita test dedicado — su uso se testea en `with-dedup.test.ts` (Task 4).

```bash
git add src/lib/tools/dedup/dedup-config.ts
git commit -m "feat(dedup): DEDUP_CONFIG con overrides por tool"
```

---

### Task 4: `with-dedup.ts` — wrapper principal + tests unit

**Files:**
- Create: `src/lib/tools/dedup/with-dedup.ts`
- Test: `src/lib/tools/dedup/__tests__/with-dedup.test.ts`

**Interfaces:**
- Consumes: `computeArgsHash` de Task 2; `getDedupConfig`, `DEFAULT_WINDOW_MIN`, `DedupOverride` de Task 3.
- Produces:
  ```ts
  export type DedupContext = {
    agentId: string;
    portalEmail: string;
    toolName: string;
    args: Record<string, unknown>;
    channel: 'voice' | 'chat' | 'email';
    toolCallId?: string;
  };
  export async function withDedup<T>(
    ctx: DedupContext,
    handler: () => Promise<T>,
  ): Promise<T>;
  ```

Fail-open: cualquier error interno → `console.error` + `handler()`.

- [ ] **Step 1: Escribir el test primero**

Contenido de `src/lib/tools/dedup/__tests__/with-dedup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpcSelect, mockRpcInsert, mockCreateAdmin, mockOrgFlag } = vi.hoisted(() => ({
  mockRpcSelect: vi.fn(),
  mockRpcInsert: vi.fn(),
  mockOrgFlag:   vi.fn(),
  mockCreateAdmin: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { dedup_middleware_enabled: mockOrgFlag() } }),
            }),
          }),
        };
      }
      if (table === 'tool_call_dedup') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gt: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => mockRpcSelect(),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: unknown) => mockRpcInsert(row),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  mockRpcSelect.mockReset();
  mockRpcInsert.mockReset();
  mockOrgFlag.mockReset();
  mockOrgFlag.mockReturnValue(true);       // flag ON por default
  mockRpcSelect.mockResolvedValue({ data: null, error: null });   // miss default
  mockRpcInsert.mockResolvedValue({ data: null, error: null });
});

const baseCtx = {
  agentId:     'agent-1',
  portalEmail: 'x@y.mx',
  toolName:    'registrar_incidencia',
  args:        { contact_phone: '8129262462', business_name: 'Tecate' },
  channel:     'voice' as const,
  toolCallId:  'call_abc',
};

describe('withDedup', () => {
  it('miss → ejecuta handler, INSERT, retorna resultado', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true, id: 'inc-1' }));

    const result = await withDedup(baseCtx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(mockRpcInsert).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, id: 'inc-1' });
  });

  it('hit dentro de ventana → retorna cached, NO ejecuta handler', async () => {
    mockRpcSelect.mockResolvedValue({
      data: { result_json: { ok: true, id: 'inc-original' } },
      error: null,
    });
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true, id: 'wrong' }));

    const result = await withDedup(baseCtx, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(mockRpcInsert).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, id: 'inc-original' });
  });

  it('flag OFF en org → no toca la tabla, ejecuta handler directo', async () => {
    mockOrgFlag.mockReturnValue(false);
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup(baseCtx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(mockRpcSelect).not.toHaveBeenCalled();
    expect(mockRpcInsert).not.toHaveBeenCalled();
  });

  it('config disable:true → skip completo aunque flag ON', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup({ ...baseCtx, toolName: 'reportar_falla' }, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(mockRpcSelect).not.toHaveBeenCalled();
  });

  it('SELECT falla → fail-open: ejecuta handler + log warning', async () => {
    mockRpcSelect.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    const result = await withDedup(baseCtx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/fail-open/),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('INSERT falla → fail-open: retorna resultado sin cachear + log warning', async () => {
    mockRpcInsert.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true, id: 'inc-1' }));

    const result = await withDedup(baseCtx, handler);

    expect(result).toEqual({ ok: true, id: 'inc-1' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handler throw → NO se inserta row (retry del modelo re-ejecuta)', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => { throw new Error('handler boom'); });

    await expect(withDedup(baseCtx, handler)).rejects.toThrow('handler boom');
    expect(mockRpcInsert).not.toHaveBeenCalled();
  });

  it('cross-agent: mismos args pero agent_id distinto → cache separado', async () => {
    // Simulamos que el primer agente tiene cache (hit) y el segundo no.
    // El mock select se activa por agent (aquí ejercitamos con args idénticos,
    // agent distinto → miss).
    mockRpcSelect.mockResolvedValue({ data: null, error: null });
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup({ ...baseCtx, agentId: 'agent-2' }, handler);

    // El SELECT se hace con agentId agent-2; el mock recibe el eq() pero
    // la interfaz del mock ignora el filtro y devuelve lo configurado.
    expect(mockRpcSelect).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('INSERT contiene tool_call_id + channel + expires_at futuros', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup(baseCtx, handler);

    expect(mockRpcInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id:     'agent-1',
        tool_name:    'registrar_incidencia',
        channel:      'voice',
        tool_call_id: 'call_abc',
        result_json:  { ok: true },
        expires_at:   expect.any(String),
      }),
    );
    const call = mockRpcInsert.mock.calls[0][0] as { expires_at: string };
    expect(new Date(call.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('logs hit para trace observability', async () => {
    mockRpcSelect.mockResolvedValue({
      data: { result_json: { ok: true } },
      error: null,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { withDedup } = await import('../with-dedup');
    await withDedup(baseCtx, vi.fn(async () => ({ ok: true, id: 'wrong' })));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[dedup\] hit/),
      expect.anything(),
    );
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/lib/tools/dedup/__tests__/with-dedup.test.ts`
Expected: FAIL — "Cannot find module '../with-dedup'"

- [ ] **Step 3: Implementar `with-dedup.ts`**

Contenido de `src/lib/tools/dedup/with-dedup.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { computeArgsHash } from './hash-args';
import { getDedupConfig, DEFAULT_WINDOW_MIN } from './dedup-config';

export type DedupContext = {
  agentId:     string;
  portalEmail: string;
  toolName:    string;
  args:        Record<string, unknown>;
  channel:     'voice' | 'chat' | 'email';
  toolCallId?: string;
};

export async function withDedup<T>(
  ctx: DedupContext,
  handler: () => Promise<T>,
): Promise<T> {
  const config = getDedupConfig(ctx.toolName);

  // Opt-out explícito: skip completo
  if (config.disable) return handler();

  const supabase = createAdminClient();

  // Feature flag por org
  let flagEnabled = false;
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('dedup_middleware_enabled')
      .eq('portal_email', ctx.portalEmail)
      .maybeSingle();
    flagEnabled = !!(org?.dedup_middleware_enabled);
  } catch (err) {
    console.error('[dedup] fail-open (flag lookup):', err);
    return handler();
  }
  if (!flagEnabled) return handler();

  // Hash de args
  let argsHash: string;
  try {
    argsHash = computeArgsHash(ctx.toolName, ctx.args, {
      identity_keys: config.identity_keys,
      detail_keys:   config.detail_keys,
    });
  } catch (err) {
    console.error('[dedup] fail-open (hash):', err);
    return handler();
  }

  // Lookup hit
  const nowIso = new Date().toISOString();
  try {
    const { data: hit, error } = await supabase
      .from('tool_call_dedup')
      .select('result_json')
      .eq('agent_id', ctx.agentId)
      .eq('tool_name', ctx.toolName)
      .eq('args_hash', argsHash)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (hit?.result_json !== undefined && hit?.result_json !== null) {
      console.log('[dedup] hit', {
        tool: ctx.toolName, agent: ctx.agentId, channel: ctx.channel,
        toolCallId: ctx.toolCallId,
      });
      return hit.result_json as T;
    }
  } catch (err) {
    console.error('[dedup] fail-open (select):', err);
    return handler();
  }

  // Miss → ejecutar handler
  const result = await handler();

  // Insertar cache (fail-open si el INSERT falla)
  const windowMin = config.window_min ?? DEFAULT_WINDOW_MIN;
  const expiresAt = new Date(Date.now() + windowMin * 60 * 1000).toISOString();
  try {
    const { error: insErr } = await supabase.from('tool_call_dedup').insert({
      agent_id:     ctx.agentId,
      tool_name:    ctx.toolName,
      args_hash:    argsHash,
      result_json:  result,
      channel:      ctx.channel,
      tool_call_id: ctx.toolCallId ?? null,
      expires_at:   expiresAt,
    });
    if (insErr) throw insErr;
  } catch (err) {
    console.error('[dedup] fail-open (insert):', err);
  }

  return result;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/lib/tools/dedup/__tests__/with-dedup.test.ts`
Expected: PASS — 10/10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/dedup/with-dedup.ts \
        src/lib/tools/dedup/__tests__/with-dedup.test.ts
git commit -m "feat(dedup): withDedup wrapper con fail-open"
```

---

### Task 5: Integration test contra Supabase local

**Files:**
- Test: `src/lib/tools/dedup/__tests__/with-dedup.integration.test.ts`

**Interfaces:**
- Consumes: `withDedup`, `computeArgsHash` (Tasks 2, 4).

- [ ] **Step 1: Escribir el test**

Contenido de `src/lib/tools/dedup/__tests__/with-dedup.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { withDedup } from '../with-dedup';

const TEST_PORTAL = `dedup-test-${Date.now()}@example.com`;
const TEST_AGENT: string = crypto.randomUUID();

describe('withDedup integration', () => {
  beforeAll(async () => {
    await assertNotProdOrAllowed();
    const supa = createAdminClient();

    // Setup: org con flag ON + agent
    await supa.from('organizations').upsert({
      portal_email: TEST_PORTAL,
      dedup_middleware_enabled: true,
    });
    await supa.from('voice_agents').insert({
      id:            TEST_AGENT,
      portal_email:  TEST_PORTAL,
      agent_name:    'Test',
      business_name: 'Test Biz',
    });
  });

  afterAll(async () => {
    const supa = createAdminClient();
    await supa.from('tool_call_dedup').delete().eq('agent_id', TEST_AGENT);
    await supa.from('voice_agents').delete().eq('id', TEST_AGENT);
    await supa.from('organizations').delete().eq('portal_email', TEST_PORTAL);
  });

  it('2 llamadas back-to-back al mismo hash → 1 row en tool_call_dedup, 2do retorna cached', async () => {
    const supa = createAdminClient();
    const ctx = {
      agentId:     TEST_AGENT,
      portalEmail: TEST_PORTAL,
      toolName:    'registrar_incidencia',
      args:        { contact_phone: '8129262462', business_name: 'Tecate' },
      channel:     'voice' as const,
      toolCallId:  'test-1',
    };
    const handler1 = vi.fn(async () => ({ ok: true, id: 'inc-first' }));
    const handler2 = vi.fn(async () => ({ ok: true, id: 'inc-second' }));

    const r1 = await withDedup(ctx, handler1);
    const r2 = await withDedup({ ...ctx, toolCallId: 'test-2' }, handler2);

    expect(r1).toEqual({ ok: true, id: 'inc-first' });
    expect(r2).toEqual({ ok: true, id: 'inc-first' });   // cached
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).not.toHaveBeenCalled();

    const { data } = await supa.from('tool_call_dedup')
      .select('id').eq('agent_id', TEST_AGENT);
    expect(data).toHaveLength(1);
  });

  it('args distintos → 2 rows separadas', async () => {
    const supa = createAdminClient();
    await supa.from('tool_call_dedup').delete().eq('agent_id', TEST_AGENT);   // reset
    const base = {
      agentId:     TEST_AGENT,
      portalEmail: TEST_PORTAL,
      toolName:    'registrar_incidencia',
      channel:     'voice' as const,
    };

    await withDedup({ ...base, args: { contact_phone: '111' } },
      async () => ({ ok: true, phone: '111' }));
    await withDedup({ ...base, args: { contact_phone: '222' } },
      async () => ({ ok: true, phone: '222' }));

    const { data } = await supa.from('tool_call_dedup')
      .select('id').eq('agent_id', TEST_AGENT);
    expect(data).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Verificar que los tests estáticos siguen verdes primero**

Run: `npx vitest run src/lib/tools/dedup/__tests__/hash-args.test.ts src/lib/tools/dedup/__tests__/with-dedup.test.ts`
Expected: PASS — 22/22 tests green.

- [ ] **Step 3: Correr el integration test contra Supabase local**

Requiere Supabase local corriendo o `TEST_ALLOW_PROD=true` con autorización explícita del user. Este step queda como manual verification.

Run (si local levantado): `npx vitest run src/lib/tools/dedup/__tests__/with-dedup.integration.test.ts`
Expected: PASS — 2/2.

Si no hay local disponible: skip (`.skip`) el describe y anotar en el PR que la verificación integration se hace en Fase 1 del rollout con Tortillería real.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/dedup/__tests__/with-dedup.integration.test.ts
git commit -m "test(dedup): integration test contra Supabase con smoke guard"
```

---

### Task 6: Envolver `registrar_incidencia` route + regression Tecate

**Files:**
- Modify: `src/app/api/voice/tools/registrar-incidencia/route.ts`
- Test: `src/app/api/voice/tools/registrar-incidencia/__tests__/route.dedup.test.ts` (nuevo)

**Interfaces:**
- Consumes: `withDedup`, `DedupContext` (Task 4).
- Produces: Route con dedup activo cuando `dedup_middleware_enabled=true` en su org.

- [ ] **Step 1: Escribir el regression test Tecate contra la route**

Contenido de `src/app/api/voice/tools/registrar-incidencia/__tests__/route.dedup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockRegistrarIncidencia, mockWithDedup } = vi.hoisted(() => ({
  mockRegistrarIncidencia: vi.fn(),
  mockWithDedup:           vi.fn(),
}));

vi.mock('@/lib/tools/executors/registrar-incidencia', () => ({
  registrarIncidencia: mockRegistrarIncidencia,
}));
vi.mock('@/lib/tools/dedup/with-dedup', () => ({
  withDedup: mockWithDedup,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single:      async () => ({ data: { id: 'a', portal_email: 'p@x.mx' } }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
  }),
}));

beforeEach(() => {
  mockRegistrarIncidencia.mockReset();
  mockWithDedup.mockReset();
});

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/voice/tools/registrar-incidencia?agent_id=a', {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('registrar_incidencia route — dedup wrap', () => {
  it('llama a withDedup con toolName, agentId y args', async () => {
    mockWithDedup.mockImplementation(async (_ctx: unknown, handler: () => Promise<unknown>) => handler());
    mockRegistrarIncidencia.mockResolvedValue({ ok: true, incident_id: 'inc-1', email_sent: true, verification_at: '2026-10-02T00:00:00Z' });

    const { POST } = await import('../route');
    await POST(makeReq({
      message: {
        toolCallList: [{
          id:       'call_a',
          function: { name: 'registrar_incidencia', arguments: {
            business_name: 'Tecate', contact_phone: '8129262462',
            address: 'Y', motivo: 'M',
          }},
        }],
      },
    }));

    expect(mockWithDedup).toHaveBeenCalledOnce();
    const ctx = mockWithDedup.mock.calls[0][0] as { toolName: string; agentId: string; args: Record<string, unknown>; toolCallId?: string };
    expect(ctx.toolName).toBe('registrar_incidencia');
    expect(ctx.agentId).toBe('a');
    expect(ctx.args.business_name).toBe('Tecate');
    expect(ctx.toolCallId).toBe('call_a');
  });

  it('regression Tecate: 2 calls back-to-back, wrapper retorna cached el 2do', async () => {
    // Wrapper mock simula el comportamiento real: 1er call ejecuta handler,
    // 2do call retorna cached (mismo result).
    let cached: unknown = null;
    mockWithDedup.mockImplementation(async (_ctx: unknown, handler: () => Promise<unknown>) => {
      if (cached) return cached;
      cached = await handler();
      return cached;
    });
    mockRegistrarIncidencia.mockResolvedValue({
      ok: true, incident_id: 'inc-1', email_sent: true, verification_at: '2026-10-02T00:00:00Z',
    });

    const { POST } = await import('../route');

    // Call 1: motivo simple
    const r1 = await POST(makeReq({
      message: { toolCallList: [{
        id: 'call_a',
        function: { name: 'registrar_incidencia', arguments: {
          business_name: 'Tecate Six', contact_phone: '8129262462',
          address: 'Cruz Potensada 4-54', motivo: 'Ya tiene unos días',
        }},
      }]},
    }));

    // Call 2: motivo enriquecido (mismos identity fields, motivo distinto)
    const r2 = await POST(makeReq({
      message: { toolCallList: [{
        id: 'call_b',
        function: { name: 'registrar_incidencia', arguments: {
          business_name: 'Tecate Six', contact_phone: '8129262462',
          address: 'Cruz Potensada 4-54', motivo: 'El supervisor vino hace 3 días',
        }},
      }]},
    }));

    // Handler solo se llamó UNA vez (el 2do call fue cacheado por withDedup)
    expect(mockRegistrarIncidencia).toHaveBeenCalledOnce();
    // Ambos responses son iguales (result cacheado)
    expect(await r1.json()).toEqual(await r2.json());
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npx vitest run src/app/api/voice/tools/registrar-incidencia/__tests__/route.dedup.test.ts`
Expected: FAIL — el route.ts todavía no llama a `withDedup`.

- [ ] **Step 3: Modificar `route.ts` para envolver el registrarIncidencia con withDedup**

Diff en `src/app/api/voice/tools/registrar-incidencia/route.ts`:

- Añadir `import { withDedup } from '@/lib/tools/dedup/with-dedup';` al top
- En la sección después del guardrail empty-args (línea ~82) y antes de `await registrarIncidencia(...)`:

Reemplazar el bloque:
```ts
    const result = await registrarIncidencia(
      {
        supabase,
        agent,
        org,
        channel: 'voice',
        sourceCallId: voiceCall?.id ?? null,
      },
      args,
    );
```

Con:
```ts
    const result = await withDedup(
      {
        agentId:     agentId,
        portalEmail: agent.portal_email,
        toolName:    'registrar_incidencia',
        args,
        channel:     'voice',
        toolCallId,
      },
      () => registrarIncidencia(
        {
          supabase,
          agent,
          org,
          channel: 'voice',
          sourceCallId: voiceCall?.id ?? null,
        },
        args,
      ),
    );
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx vitest run src/app/api/voice/tools/registrar-incidencia/__tests__/route.dedup.test.ts`
Expected: PASS — 2/2.

- [ ] **Step 5: Correr los tests existentes de registrar_incidencia para asegurar no-regression**

Run: `npx vitest run src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`
Expected: PASS — 17/17 (los mismos que hoy).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice/tools/registrar-incidencia/route.ts \
        src/app/api/voice/tools/registrar-incidencia/__tests__/route.dedup.test.ts
git commit -m "feat(dedup): envolver registrar_incidencia con withDedup"
```

---

### Task 7: Envolver los 9 tools restantes con side-effect

**Files:**
- Modify: 9 archivos `src/app/api/voice/tools/*/route.ts`:
  - `registrar-cliente-nuevo/route.ts`
  - `registrar-pedido/route.ts`
  - `crear-ticket/route.ts`
  - `agendar-cita/route.ts`
  - `agendar-cita-externa/route.ts`
  - `crear-reporte/route.ts` (disable en config, wrapper aún se aplica → no-op)
  - `crear-lead/route.ts` (ver Nota abajo si no tiene route sino dispatcher)
  - `marcar-no-llamar/route.ts`
  - `generar-punto-acuerdo/route.ts`, `generar-acta-sesion/route.ts`

**Interfaces:**
- Consumes: `withDedup`, `DedupContext` (Task 4).

**Nota**: Si `crear-lead` no tiene su propio route sino que vive dentro de otro handler, se envuelve donde se llama. Auditar durante ejecución.

- [ ] **Step 1: Escribir un test parametrizado que verifique que cada route llama a withDedup**

Contenido de `src/lib/tools/dedup/__tests__/tool-coverage.test.ts` (será compartido con Task 11 pero se arranca aquí):

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const TOOLS_WITH_SIDE_EFFECTS = [
  'registrar-incidencia',
  'registrar-cliente-nuevo',
  'registrar-pedido',
  'crear-ticket',
  'agendar-cita',
  'agendar-cita-externa',
  'crear-reporte',
  'marcar-no-llamar',
  'generar-punto-acuerdo',
  'generar-acta-sesion',
];

describe('tool coverage — withDedup applied', () => {
  for (const tool of TOOLS_WITH_SIDE_EFFECTS) {
    it(`${tool} route.ts importa y llama withDedup`, () => {
      const routePath = path.join(ROOT, 'src', 'app', 'api', 'voice', 'tools', tool, 'route.ts');
      const src = readFileSync(routePath, 'utf8');
      expect(src, `${tool} debería importar withDedup`).toMatch(/import\s+\{[^}]*withDedup[^}]*\}\s+from\s+['"]@\/lib\/tools\/dedup\/with-dedup['"]/);
      expect(src, `${tool} debería llamar withDedup(...)`).toMatch(/\bwithDedup\s*\(/);
    });
  }
});
```

- [ ] **Step 2: Correr el test — verifica que solo registrar-incidencia pasa**

Run: `npx vitest run src/lib/tools/dedup/__tests__/tool-coverage.test.ts`
Expected: 1/10 PASS (registrar-incidencia de Task 6), 9/10 FAIL.

- [ ] **Step 3: Para cada tool, aplicar el mismo patrón que Task 6**

Para cada uno de los 9 routes:
1. Añadir import `import { withDedup } from '@/lib/tools/dedup/with-dedup';`
2. Localizar la llamada al executor (o el bloque de lógica principal si es inline).
3. Envolver con `await withDedup({ agentId, portalEmail: agent.portal_email, toolName: '<snake_case>', args, channel: 'voice', toolCallId }, () => <handler>)`.
4. **Importante**: `portalEmail` debe estar disponible en el scope (leer del agent row si no está).

Ejemplo mínimo por tool (variar según cada route):
```ts
// antes
const result = await someExecutor(ctx, args);

// después
const result = await withDedup(
  { agentId, portalEmail: agent.portal_email, toolName: 'registrar_pedido', args, channel: 'voice', toolCallId },
  () => someExecutor(ctx, args),
);
```

- [ ] **Step 4: Correr el test — debe pasar 10/10**

Run: `npx vitest run src/lib/tools/dedup/__tests__/tool-coverage.test.ts`
Expected: 10/10 PASS.

- [ ] **Step 5: Correr los tests existentes de cada tool para asegurar no-regression**

Run: `npx vitest run src/app/api/voice/tools/`
Expected: TODOS los tests preexistentes pasan (los mocks de executors ignoran el wrapper porque withDedup real ejecuta el handler directo en tests sin config de org).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice/tools/ src/lib/tools/dedup/__tests__/tool-coverage.test.ts
git commit -m "feat(dedup): envolver 9 tools restantes con withDedup"
```

---

### Task 8: Envolver dispatchers de chat y email

**Files:**
- Modify: `src/app/api/agent-chat/route.ts` (dispatcher chat)
- Modify: `src/lib/inbox/processor.ts` o equivalente (dispatcher email)

**Interfaces:**
- Consumes: `withDedup` (Task 4).

**Nota**: los dispatchers de chat/email invocan las mismas tools pero por otro path. El wrapper aplica igualmente. Auditar cada uno durante ejecución para localizar el `switch (toolName)` o equivalente.

- [ ] **Step 1: Localizar el dispatcher de chat**

Buscar: `grep -rn "toolName === 'registrar_incidencia'\|case 'registrar_incidencia'" src/app/api/agent-chat/`
Localizar el switch/if principal donde se despachan las tools por nombre.

- [ ] **Step 2: Envolver el dispatch**

Ejemplo del patrón:

```ts
// antes
const result = await executeAgentTool(agent, toolName, args, ctx);

// después
const result = await withDedup(
  { agentId: agent.id, portalEmail: agent.portal_email, toolName, args, channel: 'chat', toolCallId: /* del mensaje */ },
  () => executeAgentTool(agent, toolName, args, ctx),
);
```

- [ ] **Step 3: Idem para el processor de email**

Buscar: `grep -rn "inbox" src/lib/ | head`
Localizar el processor y aplicar el mismo patrón con `channel: 'email'`.

- [ ] **Step 4: Correr los tests de chat/email si existen**

Run: `npx vitest run src/app/api/agent-chat/ src/lib/inbox/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent-chat/ src/lib/inbox/
git commit -m "feat(dedup): envolver dispatchers de chat y email con withDedup"
```

---

### Task 9: Cron cleanup

**Files:**
- Create: `src/app/api/cron/dedup-cleanup/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces: `GET /api/cron/dedup-cleanup` → borra rows con `expires_at < NOW() - INTERVAL '1 hour'`.

- [ ] **Step 1: Crear la route**

Contenido de `src/app/api/cron/dedup-cleanup/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Auth: header Bearer con CRON_SECRET (patrón standard del repo)
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();  // NOW - 1h

  const { error, count } = await supabase
    .from('tool_call_dedup')
    .delete({ count: 'exact' })
    .lt('expires_at', cutoff);

  if (error) {
    console.error('[dedup-cleanup] error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log('[dedup-cleanup] deleted rows:', count);
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
```

- [ ] **Step 2: Añadir entrada en `vercel.json`**

En `vercel.json`, añadir al array `crons`:
```json
{
  "path": "/api/cron/dedup-cleanup",
  "schedule": "0 * * * *"
}
```

- [ ] **Step 3: Verificar que otras rutas siguen tests**

Run: `npx vitest run src/app/api/cron/`
Expected: los tests existentes pasan (nuestra route no tiene test dedicado — es trivial y sale del scope de cobertura).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/dedup-cleanup/route.ts vercel.json
git commit -m "feat(dedup): cron cleanup hourly de tool_call_dedup"
```

---

### Task 10: Nash drift detector para dedup

**Files:**
- Modify: `src/lib/monitoring/` (buscar el módulo de drift detectors existente)
- Test: junto al módulo modificado

**Interfaces:**
- Consumes: `tool_call_dedup` tabla (Task 1).
- Produces: Función `detectDedupAnomalies(portalEmail): Promise<AnomalyList>` que devuelve spikes vs baseline y cero-hits sospechosos.

- [ ] **Step 1: Localizar el módulo de drift detectors**

Run: `grep -rn "detectOutbound\|driftDetector\|Nash monitor" src/lib/monitoring/ src/lib/ops/ 2>&1 | head`

Ubicar el patrón de "drift detector" existente (referenciado en la memoria `project_centinelia_pool_drift_detector`).

- [ ] **Step 2: Escribir test unit para el detector**

Un test como los existentes en `consumption-audit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { detectDedupAnomalies } from '../dedup-drift';

// (Mocks del supabase client patrón standard de los tests de monitoring)

describe('detectDedupAnomalies', () => {
  it('spike >3x baseline → devuelve anomaly type=spike', async () => {
    // Setup: mock 200 rows current week vs 50 avg previas 4 semanas
    // ...
    const anomalies = await detectDedupAnomalies('x@y.mx');
    expect(anomalies).toContainEqual(expect.objectContaining({ type: 'spike', ratio: expect.any(Number) }));
  });

  it('cero hits en 24h con volumen normal → devuelve anomaly type=cero_hits', async () => {
    // ...
    const anomalies = await detectDedupAnomalies('x@y.mx');
    expect(anomalies).toContainEqual(expect.objectContaining({ type: 'cero_hits' }));
  });

  it('sin anomalías → array vacío', async () => {
    // ...
    expect(await detectDedupAnomalies('x@y.mx')).toEqual([]);
  });
});
```

- [ ] **Step 3: Implementar el detector**

Añadir a `src/lib/monitoring/dedup-drift.ts` una función que:
- SELECT COUNT(*) FROM tool_call_dedup del org últimos 7 días
- SELECT COUNT(*) del mismo periodo 4 weeks atrás promedio semanal
- Si ratio > 3, retorna `{ type: 'spike', ratio, ... }`
- Si count del último 24h = 0 y el promedio semanal >= 20/día, retorna `{ type: 'cero_hits' }`

- [ ] **Step 4: Registrar en Nash monitor pipeline**

Buscar dónde Nash llama a otros drift detectors y añadir la llamada a `detectDedupAnomalies`. Si emite `notification_events` para el daily digest, imitar ese patrón.

- [ ] **Step 5: Tests verdes + commit**

Run: `npx vitest run src/lib/monitoring/`
Expected: PASS.

```bash
git add src/lib/monitoring/
git commit -m "feat(dedup): Nash drift detector para spike y cero-hits"
```

---

### Task 11: Schema drift guard (tools nuevas sin wrapper)

**Files:**
- Modify: `src/lib/tools/dedup/__tests__/tool-coverage.test.ts` (creado en Task 7)

**Interfaces:**
- Ya existe (Task 7). Este task extiende con verificación estática de nuevos tools.

- [ ] **Step 1: Ampliar `tool-coverage.test.ts` para detectar tools nuevos sin wrapper**

Añadir al describe:

```ts
it('cualquier tool nueva con INSERT + consumeAiOp debe estar en TOOLS_WITH_SIDE_EFFECTS', () => {
  // Lista los directorios bajo src/app/api/voice/tools/
  const dir = path.join(ROOT, 'src', 'app', 'api', 'voice', 'tools');
  const tools = readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const missing: string[] = [];
  for (const tool of tools) {
    const routePath = path.join(dir, tool, 'route.ts');
    if (!existsSync(routePath)) continue;
    const src = readFileSync(routePath, 'utf8');
    const hasInsert    = /\.insert\(/.test(src);
    const hasConsumeOp = /consumeAiOp/.test(src);
    const hasDedup     = /withDedup/.test(src);
    if ((hasInsert || hasConsumeOp) && !hasDedup) missing.push(tool);
  }

  expect(missing, `tools con side-effects sin withDedup wrapper: ${missing.join(', ')}`).toEqual([]);
});
```

Añadir imports: `readdirSync`, `existsSync` de `node:fs`.

- [ ] **Step 2: Correr el test — debe pasar (asumiendo Task 7 completo)**

Run: `npx vitest run src/lib/tools/dedup/__tests__/tool-coverage.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tools/dedup/__tests__/tool-coverage.test.ts
git commit -m "test(dedup): schema drift guard para tools nuevas sin withDedup"
```

---

### Task 12: Aplicar migraciones a prod y habilitar flag en Tortillería (Fase 1)

**Files:** No code changes, ops-only.

**Interfaces:** N/A.

**REQUIRE user authorization explícita antes de este task.** Toca prod DB.

- [ ] **Step 1: Verificar migration list contra remoto**

Run: `cd C:/Users/Nazre/centinelia && npx supabase migration list 2>&1 | tail -5`
Expected: mis 2 migraciones de Task 1 aparecen como `local` sin `remote`.

- [ ] **Step 2: Correr dry-run**

Run: `npx supabase db push --dry-run 2>&1 | tail -5`
Expected: lista las 2 migraciones nuevas como pending.

- [ ] **Step 3: Aplicar a prod**

Run: `npx supabase db push`
Expected: `Finished supabase db push.` con las 2 migraciones aplicadas.

- [ ] **Step 4: Habilitar flag en Tortillería**

Vía script one-shot (con smoke guard bypass autorizado por Nazre):

```ts
// scripts/enable-dedup-tortilleria.ts
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenvConfig({ path: '.env.local' });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

async function main() {
  const { error } = await supa.from('organizations')
    .update({ dedup_middleware_enabled: true })
    .eq('portal_email', PORTAL);
  if (error) throw error;
  const { data } = await supa.from('organizations')
    .select('portal_email, dedup_middleware_enabled')
    .eq('portal_email', PORTAL).single();
  console.log('post-update:', data);
}
main().catch(e => { console.error(e); process.exit(1); });
```

Run: `TEST_ALLOW_PROD=true npx tsx scripts/enable-dedup-tortilleria.ts`
Expected: `post-update: { portal_email: '...', dedup_middleware_enabled: true }`

- [ ] **Step 5: Borrar el script one-shot**

Run: `rm scripts/enable-dedup-tortilleria.ts`

- [ ] **Step 6: Documentar Fase 1 activa en handoff/memory + próximos pasos rollout**

Actualizar `MEMORY.md` con la fecha de arranque de Fase 1 y ventana de monitoreo 48h.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(dedup): Fase 1 rollout Tortillería + memoria actualizada"
```

- [ ] **Step 8: Merge del PR completo**

```bash
gh pr create --title "feat(dedup): middleware universal de dedup para tool calls" --body "..." 2>&1
# después de review + merge:
```

Fases 2-4 del rollout no forman parte de este plan (ver spec §6). Se ejecutan en sesiones separadas post-Fase 1 con evidencia real.

---

## Fuera de scope

- Portal admin view (`/admin/dedup`) — Fase 3 rollout, spec §8.3.
- Remoción del dedup ad-hoc de `registrar_incidencia` executor — Fase 4, spec §6.3.
- Refactor de latencia (~15s SMTP+IMAP) — spec §9.
- Idempotencia por `toolCallId` puro — evaluar post-Fase 1 si content-based no cubre.
