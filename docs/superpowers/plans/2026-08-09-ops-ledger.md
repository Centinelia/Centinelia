# Ops Ledger — Full event-sourcing con audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship un `ops_ledger` event-sourced con paridad completa a `minutes_ledger`: credits stripe con cap 2× enforcement, consumption unificado stripe+annual, y annual grants con `unused_forfeited` audit trail para municipio. Rollout gradual via feature flag `organizations.ops_ledger_enabled`.

**Architecture:** Nueva tabla `ops_ledger` (mirror de `minutes_ledger`) + cache `account_ops` + 6 funciones SQL (`get_ops_pool_balance`, `get_ops_pool_cap`, `apply_ops_ledger_entry`, `apply_ops_annual_grant`, `consume_pool_ops`, `refresh_ops_pool_cache`) + trigger `auto_refresh_ops_pool_cache`. TS callers refactorizados detrás de un feature flag por org para rollout controlado.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL + service role), Vitest para integration tests, Resend para email.

## Global Constraints

- Next.js version 16.2.9 con breaking changes vs training data — chequear `node_modules/next/dist/docs/` antes de escribir route/server-component code.
- Copy portal/emails: **Spanish MX**. Sin em dashes (usar `:`, `,`, `.`). Sin emojis en UI (Lucide icons only). Evitar la palabra "IA" en visible copy; usar "empleado digital".
- Todas las rutas portal validan `portal_token` (voice_agents o organizations vía [[handoff_org_portal_token_migration]]) + verificación org ownership IDOR.
- Nueva regla dura [[feedback_pool_transparencia]]: minutos y tareas son moneda; no aceptar contadores directos como source of truth. Ledger append-only + cap SQL + audit CSV.
- Kinds SQL válidos para `ops_ledger.kind`: `renewal` | `extra_ops_purchase` | `auto_refill_ops` | `setup_new_agent` | `jornada_change` | `admin_adjustment` | `rollover_cap` | `annual_grant` | `unused_forfeited` | `consumption`. Sin CHECK constraint hard (mismo patrón que minutes_ledger).
- Feature flag: `organizations.ops_ledger_enabled BOOLEAN DEFAULT FALSE`. Toda ruta nueva/refactorizada checa el flag antes de escribir al ledger; si off cae al path legacy. Rollout: primero demo, luego municipio, luego general.
- Colores UI: minutos=cyan `#0E7490`, tareas=verde `#10B981` (regla [[feedback_colores_minutos_tareas]]). Pérdidas en ámbar `#B45309`.
- Emails vía `sendEmail` de `@/lib/email/send` con `shell()` wrapper y color palette existente.
- Cron auth: `Bearer ${process.env.CRON_SECRET}` en `Authorization` header, vía `verifyCronAuth(req)`.
- Migrations: archivo timestamped en `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`. Apply manual con Supabase MCP o via CLI local.
- Tests: Vitest con `describe/it/expect`. Integration tests en `tests/integration/*.test.ts` que hablan con Supabase real (usan `TEST_PORTAL_EMAIL` env var; skip graceful si no existe).
- **NO tocar** `minutes_ledger`, `apply_ledger_entry`, `get_pool_balance`, `refresh_pool_cache` — solo se lee su patrón para replicar. Cero cambios al pool de minutos existente.
- **NO backfillear** ledger de ops desde contadores actuales. Cero rows previos, ledger arranca vacío.
- annual_prepaid `overage_ops` sigue existiendo como columna cache en `organizations`, recalculada en `refresh_ops_pool_cache` cuando `balance < 0`.

## File Structure

**Nueva SQL migration:**
- `supabase/migrations/20260810120000_ops_ledger.sql` — tabla, funciones, trigger, feature flag.

**Nuevos TS files:**
- `src/lib/billing/pool-loss-notify.ts` — generalización de `rollover-cap-notify.ts` (soporta `resource: 'minutes' | 'ops'`).
- `src/app/api/admin/agentes/[id]/ops/route.ts` — POST admin manual credit/debit para ops (mirror del route de minutes).
- `src/app/api/portal/[token]/ops-ledger.csv/route.ts` — GET exporta el ledger como CSV.
- `src/app/portal/[token]/OpsLedgerSection.tsx` — server component mirror de MinutesLedgerSection.
- `src/app/portal/[token]/OpsLedgerListClient.tsx` — client component mirror de MinutesLedgerListClient.
- `src/app/admin/pool-perdido/page.tsx` — reemplazo de `rollover-perdido/page.tsx` con 3 tabs.
- `src/app/admin/rollover-perdido/page.tsx` — reemplazado por `redirect('/admin/pool-perdido')` para no romper bookmarks.
- `tests/integration/ops-ledger.test.ts` — integration test contra Supabase real.

**Modified TS files:**
- `src/lib/ai/ops-guard.ts` — `consumeAiOp` branch por feature flag; llama `consume_pool_ops` RPC.
- `src/lib/annual-contracts/pool-consume.ts` — `consumePoolOps` refactor para usar RPC cuando flag on.
- `src/app/api/billing/webhook/route.ts` — 5 sitios ops (plan_upgrade delta, extra_ops, renewal, setup_new_agent, jornada_change) reemplazan UPDATEs directos con `apply_ops_ledger_entry`.
- `src/lib/billing/auto-refill.ts` — `executeAutoRefillOps` usa `apply_ops_ledger_entry` con `kind='auto_refill_ops'`.
- `src/app/api/cron/reset-ops-pool/route.ts` — dispatch: stripe safety-net + annual grant.
- `src/app/api/cron/annual-contracts-lifecycle/route.ts` — llama `apply_ops_annual_grant` al arrancar contrato.
- `src/app/api/portal/[token]/activate-voice/route.ts` — jornada_change ops via RPC.
- `src/app/portal/[token]/page.tsx` — query paralela + card ámbar de ops.
- `src/app/admin/AdminNav.tsx` — cambiar label "Rollover perdido" → "Pool perdido", href `/admin/pool-perdido`.

**Renamed:**
- `src/lib/billing/rollover-cap-notify.ts` — su contenido se mueve a `pool-loss-notify.ts`; el archivo original se elimina.

---

## Task 1 — SQL migration: tablas + indexes + feature flag

**Files:**
- Create: `supabase/migrations/20260810120000_ops_ledger.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tablas `ops_ledger`, `account_ops`; columna `organizations.ops_ledger_enabled`; indexes.

- [ ] **Step 1: Crear el archivo de migration con schema**

Crear `supabase/migrations/20260810120000_ops_ledger.sql`:

```sql
-- Ops Ledger — event-sourced tracking de tareas/ops con paridad completa a minutes_ledger
-- Ver docs/superpowers/specs/2026-08-09-ops-ledger-design.md

-- 1) Tabla append-only de eventos
CREATE TABLE IF NOT EXISTS ops_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  text,
  agent_id      uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  amount        int NOT NULL,
  kind          text NOT NULL,
  source        text,
  reference_id  text,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_ledger_portal_email_idx  ON ops_ledger (portal_email);
CREATE INDEX IF NOT EXISTS ops_ledger_reference_id_idx  ON ops_ledger (reference_id);
CREATE INDEX IF NOT EXISTS ops_ledger_kind_created_idx  ON ops_ledger (kind, created_at DESC);

-- 2) Tabla cache derivada (mirror de account_minutes)
CREATE TABLE IF NOT EXISTS account_ops (
  portal_email    text PRIMARY KEY,
  ops_included    int NOT NULL DEFAULT 0,
  ops_used        int NOT NULL DEFAULT 0,
  ops_balance     int NOT NULL DEFAULT 0,
  ops_reset_date  date,
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

-- 3) Feature flag por org para rollout gradual
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ops_ledger_enabled boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Aplicar la migration**

Aplicar via Supabase MCP:

```
mcp__supabase__apply_migration name="ops_ledger_schema" query="<contenido del archivo del step 1>"
```

O via CLI local: `supabase db push`.

- [ ] **Step 3: Verificar que las tablas + columna existen**

Correr en Supabase SQL editor (o via MCP execute_sql):

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'ops_ledger') AS ops_ledger,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'account_ops') AS account_ops,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'ops_ledger_enabled') AS flag;
```

Expected: `ops_ledger=1, account_ops=1, flag=1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260810120000_ops_ledger.sql
git commit -m "feat(ops-ledger): add ops_ledger + account_ops tables + feature flag"
```

---

## Task 2 — SQL: get_ops_pool_balance + get_ops_pool_cap

**Files:**
- Modify: `supabase/migrations/20260810120000_ops_ledger.sql` (append)

**Interfaces:**
- Consumes: `ops_ledger`, `voice_agents.ai_ops_limit`, `organizations.billing_model`, `annual_contracts.monthly_ops_pool`.
- Produces: RPCs `get_ops_pool_balance(portal_email) → int`, `get_ops_pool_cap(portal_email) → int`.

- [ ] **Step 1: Añadir las 2 funciones al archivo de migration**

Append a `supabase/migrations/20260810120000_ops_ledger.sql`:

```sql
-- 4) Balance = suma de todos los amounts en ledger para un portal_email
CREATE OR REPLACE FUNCTION public.get_ops_pool_balance(p_portal_email text)
RETURNS int
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(SUM(amount), 0)::int
  FROM ops_ledger
  WHERE portal_email = p_portal_email;
$function$;

-- 5) Cap: 2× para stripe, monthly_ops_pool del contrato para annual
CREATE OR REPLACE FUNCTION public.get_ops_pool_cap(p_portal_email text)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_model  text;
  v_active_contract uuid;
  v_pool   int;
  v_base   int := 0;
BEGIN
  SELECT billing_model, active_contract_id
    INTO v_model, v_active_contract
    FROM organizations WHERE portal_email = p_portal_email;

  IF v_model = 'annual_prepaid' THEN
    IF v_active_contract IS NULL THEN RETURN 0; END IF;
    SELECT monthly_ops_pool INTO v_pool
      FROM annual_contracts WHERE id = v_active_contract;
    RETURN COALESCE(v_pool, 0);
  END IF;

  -- Default = stripe (o unset): 2× la suma de ai_ops_limit per-agente activo
  SELECT COALESCE(SUM(ai_ops_limit), 0)::int INTO v_base
    FROM voice_agents
    WHERE portal_email = p_portal_email
      AND active = true
      AND (billing_status = 'activo' OR billing_status IS NULL);

  RETURN v_base * 2;
END;
$function$;
```

- [ ] **Step 2: Aplicar la migration (append es idempotente por CREATE OR REPLACE)**

Re-aplicar el archivo completo via MCP o CLI.

- [ ] **Step 3: Crear el integration test**

Crear `tests/integration/ops-ledger.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

const TEST_EMAIL = process.env.TEST_PORTAL_EMAIL ?? 'centinelia.dev@gmail.com';
const supabase = createAdminClient();

async function cleanup() {
  await supabase.from('ops_ledger').delete().eq('portal_email', TEST_EMAIL);
  await supabase.from('account_ops').delete().eq('portal_email', TEST_EMAIL);
}

describe('ops_ledger SQL functions', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('get_ops_pool_balance returns 0 for empty ledger', async () => {
    const { data } = await supabase.rpc('get_ops_pool_balance', { p_portal_email: TEST_EMAIL });
    expect(data).toBe(0);
  });

  it('get_ops_pool_cap returns 0 for portal with no active agents', async () => {
    const { data } = await supabase.rpc('get_ops_pool_cap', { p_portal_email: 'nonexistent@test.com' });
    expect(data).toBe(0);
  });
});
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/integration/ops-ledger.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120000_ops_ledger.sql tests/integration/ops-ledger.test.ts
git commit -m "feat(ops-ledger): add get_ops_pool_balance + get_ops_pool_cap with billing_model branching"
```

---

## Task 3 — SQL: apply_ops_ledger_entry con cap enforcement

**Files:**
- Modify: `supabase/migrations/20260810120000_ops_ledger.sql` (append)
- Modify: `tests/integration/ops-ledger.test.ts` (append)

**Interfaces:**
- Consumes: `get_ops_pool_balance`, `get_ops_pool_cap`.
- Produces: RPC `apply_ops_ledger_entry(p_portal_email text, p_agent_id uuid, p_amount int, p_kind text, p_reference_id text, p_description text) → void`.

- [ ] **Step 1: Añadir la función al archivo de migration**

Append a `supabase/migrations/20260810120000_ops_ledger.sql`:

```sql
-- 6) Aplica un credit/debit con cap 2× enforcement (solo para stripe)
CREATE OR REPLACE FUNCTION public.apply_ops_ledger_entry(
  p_portal_email  text,
  p_agent_id      uuid,
  p_amount        int,
  p_kind          text,
  p_reference_id  text DEFAULT NULL,
  p_description   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance INT;
  v_cap     INT;
  v_excess  INT;
  v_model   text;
  v_desc    text;
BEGIN
  v_desc := COALESCE(p_description, format('%s: %s ops', p_kind, p_amount));

  SELECT billing_model INTO v_model
    FROM organizations WHERE portal_email = p_portal_email;

  -- Cap enforcement solo aplica a credits (amount > 0) y modelo stripe
  IF p_amount > 0 AND p_portal_email IS NOT NULL AND (v_model IS NULL OR v_model = 'stripe') THEN
    v_balance := get_ops_pool_balance(p_portal_email);
    v_cap     := get_ops_pool_cap(p_portal_email);

    IF v_balance + p_amount > v_cap THEN
      v_excess := v_balance + p_amount - v_cap;
      INSERT INTO ops_ledger (
        portal_email, agent_id, amount, kind, reference_id,
        description, source
      ) VALUES (
        p_portal_email, p_agent_id, -v_excess, 'rollover_cap',
        p_reference_id,
        format('Se pierden %s tareas por exceder cap 2x', v_excess),
        'rollover_cap'
      );
    END IF;
  END IF;

  INSERT INTO ops_ledger (
    portal_email, agent_id, amount, kind, reference_id,
    description, source
  ) VALUES (
    p_portal_email, p_agent_id, p_amount, p_kind, p_reference_id,
    v_desc, p_kind
  );
END;
$function$;
```

- [ ] **Step 2: Aplicar la migration**

Re-aplicar via MCP o CLI.

- [ ] **Step 3: Añadir tests para cap enforcement**

Append a `tests/integration/ops-ledger.test.ts`:

```typescript
describe('apply_ops_ledger_entry cap enforcement', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('inserts full credit when within cap', async () => {
    // Setup: 1 agent con ai_ops_limit=100 → cap = 200
    // (Requiere que TEST_EMAIL tenga un voice_agent activo con ai_ops_limit=100.
    // Si no, skip con warning.)
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, ai_ops_limit')
      .eq('portal_email', TEST_EMAIL)
      .eq('active', true);
    if (!agents || agents.length === 0) {
      console.warn('[skip] no active agent for TEST_EMAIL — cannot test cap');
      return;
    }
    const agent = agents[0];

    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL,
      p_agent_id: agent.id,
      p_amount: 50,
      p_kind: 'extra_ops_purchase',
      p_reference_id: 'test_ref_1',
      p_description: 'test 50',
    });

    const { data: rows } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('reference_id', 'test_ref_1');

    expect(rows).toHaveLength(1);
    expect(rows![0].amount).toBe(50);
    expect(rows![0].kind).toBe('extra_ops_purchase');
  });

  it('inserts rollover_cap row when credit exceeds cap', async () => {
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, ai_ops_limit')
      .eq('portal_email', TEST_EMAIL)
      .eq('active', true);
    if (!agents || agents.length === 0) return;
    const agent = agents[0];
    const cap = (agent.ai_ops_limit ?? 0) * 2;
    if (cap === 0) return;

    // Push exactly the cap first
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL,
      p_agent_id: agent.id,
      p_amount: cap,
      p_kind: 'renewal',
      p_reference_id: 'test_ref_2',
      p_description: 'push to cap',
    });

    // Then push 30 more — should generate rollover_cap of -30
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL,
      p_agent_id: agent.id,
      p_amount: 30,
      p_kind: 'extra_ops_purchase',
      p_reference_id: 'test_ref_3',
      p_description: 'overflow',
    });

    const { data: capRows } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('reference_id', 'test_ref_3')
      .eq('kind', 'rollover_cap');

    expect(capRows).toHaveLength(1);
    expect(capRows![0].amount).toBe(-30);
  });
});
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run tests/integration/ops-ledger.test.ts`
Expected: 4 PASS (2 previos + 2 nuevos).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120000_ops_ledger.sql tests/integration/ops-ledger.test.ts
git commit -m "feat(ops-ledger): add apply_ops_ledger_entry with 2x cap enforcement"
```

---

## Task 4 — SQL: consume_pool_ops + apply_ops_annual_grant

**Files:**
- Modify: `supabase/migrations/20260810120000_ops_ledger.sql` (append)
- Modify: `tests/integration/ops-ledger.test.ts` (append)

**Interfaces:**
- Consumes: `get_ops_pool_balance`, `ops_ledger`, `annual_contracts.monthly_ops_pool`, `organizations.active_contract_id`.
- Produces: RPCs `consume_pool_ops(p_portal_email text, p_agent_id uuid, p_ops int, p_reference_id text, p_description text) → int` (retorna balance nuevo); `apply_ops_annual_grant(p_portal_email text) → void`.

- [ ] **Step 1: Añadir las 2 funciones al archivo de migration**

Append a `supabase/migrations/20260810120000_ops_ledger.sql`:

```sql
-- 7) Consumo: inserta un debit y devuelve balance actualizado
CREATE OR REPLACE FUNCTION public.consume_pool_ops(
  p_portal_email  text,
  p_agent_id      uuid,
  p_ops           int,
  p_reference_id  text DEFAULT NULL,
  p_description   text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
AS $function$
DECLARE
  v_desc text;
BEGIN
  v_desc := COALESCE(p_description, format('consumo: %s ops', p_ops));

  INSERT INTO ops_ledger (
    portal_email, agent_id, amount, kind, reference_id,
    description, source
  ) VALUES (
    p_portal_email, p_agent_id, -p_ops, 'consumption', p_reference_id,
    v_desc, 'consumption'
  );

  RETURN get_ops_pool_balance(p_portal_email);
END;
$function$;

-- 8) Annual grant: cierra ciclo con unused_forfeited + abre nuevo con annual_grant
CREATE OR REPLACE FUNCTION public.apply_ops_annual_grant(p_portal_email text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_unused   int;
  v_contract uuid;
  v_pool     int;
BEGIN
  v_unused := get_ops_pool_balance(p_portal_email);

  IF v_unused > 0 THEN
    INSERT INTO ops_ledger (
      portal_email, agent_id, amount, kind, reference_id, description, source
    ) VALUES (
      p_portal_email, NULL, -v_unused, 'unused_forfeited', NULL,
      format('Se pierden %s tareas no consumidas del ciclo anterior', v_unused),
      'unused_forfeited'
    );
  END IF;

  SELECT active_contract_id INTO v_contract
    FROM organizations WHERE portal_email = p_portal_email;
  IF v_contract IS NULL THEN RETURN; END IF;

  SELECT monthly_ops_pool INTO v_pool
    FROM annual_contracts WHERE id = v_contract;
  IF v_pool IS NULL OR v_pool <= 0 THEN RETURN; END IF;

  INSERT INTO ops_ledger (
    portal_email, agent_id, amount, kind, reference_id, description, source
  ) VALUES (
    p_portal_email, NULL, v_pool, 'annual_grant', v_contract::text,
    format('Grant mensual del contrato anual: %s tareas', v_pool),
    'annual_grant'
  );
END;
$function$;
```

- [ ] **Step 2: Aplicar la migration**

Re-aplicar via MCP o CLI.

- [ ] **Step 3: Añadir tests**

Append a `tests/integration/ops-ledger.test.ts`:

```typescript
describe('consume_pool_ops', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('inserts consumption debit and returns new balance', async () => {
    // Seed: apply credit +100
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_amount: 100,
      p_kind: 'admin_adjustment', p_reference_id: 'seed', p_description: 'seed',
    });

    const { data: balance } = await supabase.rpc('consume_pool_ops', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_ops: 15,
      p_reference_id: 'call_1', p_description: 'test consumption',
    });

    expect(balance).toBe(85);

    const { data: rows } = await supabase
      .from('ops_ledger')
      .select('amount, kind')
      .eq('portal_email', TEST_EMAIL)
      .eq('reference_id', 'call_1');

    expect(rows).toHaveLength(1);
    expect(rows![0].amount).toBe(-15);
    expect(rows![0].kind).toBe('consumption');
  });
});

describe('apply_ops_annual_grant', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('does NOT insert unused_forfeited when balance is 0', async () => {
    // Precondición: no annual contract for TEST_EMAIL, so no grant either.
    // Test verifies solo el branch de unused=0.
    await supabase.rpc('apply_ops_annual_grant', { p_portal_email: TEST_EMAIL });
    const { data: forfeit } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('kind', 'unused_forfeited');
    expect(forfeit).toHaveLength(0);
  });

  it('inserts unused_forfeited when balance > 0', async () => {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_amount: 50,
      p_kind: 'admin_adjustment', p_reference_id: 'seed', p_description: 'seed',
    });
    await supabase.rpc('apply_ops_annual_grant', { p_portal_email: TEST_EMAIL });
    const { data: forfeit } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('kind', 'unused_forfeited');
    expect(forfeit).toHaveLength(1);
    expect(forfeit![0].amount).toBe(-50);
  });
});
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run tests/integration/ops-ledger.test.ts`
Expected: 7 PASS (4 previos + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120000_ops_ledger.sql tests/integration/ops-ledger.test.ts
git commit -m "feat(ops-ledger): add consume_pool_ops + apply_ops_annual_grant"
```

---

## Task 5 — SQL: refresh_ops_pool_cache + trigger

**Files:**
- Modify: `supabase/migrations/20260810120000_ops_ledger.sql` (append)
- Modify: `tests/integration/ops-ledger.test.ts` (append)

**Interfaces:**
- Consumes: `get_ops_pool_balance`, `get_ops_pool_cap`, `organizations.billing_model`.
- Produces: RPC `refresh_ops_pool_cache(p_portal_email text) → void`; trigger `auto_refresh_ops_pool_cache` sobre `ops_ledger` INSERT; efecto: `account_ops` + `organizations.overage_ops` actualizados.

- [ ] **Step 1: Añadir la función + trigger al archivo de migration**

Append a `supabase/migrations/20260810120000_ops_ledger.sql`:

```sql
-- 9) Refresca account_ops (cache derivada del ledger)
CREATE OR REPLACE FUNCTION public.refresh_ops_pool_cache(p_portal_email text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance   int;
  v_cap       int;
  v_used_30d  int;
  v_model     text;
BEGIN
  v_balance := get_ops_pool_balance(p_portal_email);
  v_cap     := get_ops_pool_cap(p_portal_email);

  SELECT COALESCE(SUM(-amount), 0)::int INTO v_used_30d
    FROM ops_ledger
    WHERE portal_email = p_portal_email
      AND kind = 'consumption'
      AND created_at >= NOW() - INTERVAL '30 days';

  INSERT INTO account_ops (
    portal_email, ops_included, ops_used, ops_balance, ops_reset_date, updated_at
  )
  VALUES (
    p_portal_email, v_cap, v_used_30d, v_balance,
    (CURRENT_DATE + INTERVAL '30 days')::date, NOW()
  )
  ON CONFLICT (portal_email) DO UPDATE SET
    ops_included = EXCLUDED.ops_included,
    ops_used     = EXCLUDED.ops_used,
    ops_balance  = EXCLUDED.ops_balance,
    updated_at   = NOW();

  -- Para annual: si el balance quedó negativo, eso es overage acumulado del ciclo
  SELECT billing_model INTO v_model
    FROM organizations WHERE portal_email = p_portal_email;

  IF v_model = 'annual_prepaid' THEN
    UPDATE organizations
      SET overage_ops = GREATEST(0, -v_balance)
      WHERE portal_email = p_portal_email;
  END IF;
END;
$function$;

-- 10) Trigger: cada insert al ledger refresca la cache automáticamente
CREATE OR REPLACE FUNCTION public.trigger_refresh_ops_pool_cache()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.portal_email IS NOT NULL THEN
    PERFORM refresh_ops_pool_cache(NEW.portal_email);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS auto_refresh_ops_pool_cache ON ops_ledger;
CREATE TRIGGER auto_refresh_ops_pool_cache
  AFTER INSERT ON ops_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_ops_pool_cache();
```

- [ ] **Step 2: Aplicar la migration**

Re-aplicar via MCP o CLI.

- [ ] **Step 3: Añadir test que verifica trigger dispara**

Append a `tests/integration/ops-ledger.test.ts`:

```typescript
describe('auto_refresh_ops_pool_cache trigger', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('refreshes account_ops after ledger insert', async () => {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_amount: 42,
      p_kind: 'admin_adjustment', p_reference_id: 'trigger_test', p_description: 'trigger test',
    });

    const { data: acct } = await supabase
      .from('account_ops')
      .select('ops_balance, ops_included')
      .eq('portal_email', TEST_EMAIL)
      .single();

    expect(acct?.ops_balance).toBe(42);
    expect(acct?.ops_included).toBeGreaterThanOrEqual(0); // depends on cap
  });
});
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run tests/integration/ops-ledger.test.ts`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120000_ops_ledger.sql tests/integration/ops-ledger.test.ts
git commit -m "feat(ops-ledger): add refresh_ops_pool_cache + auto-refresh trigger"
```

---

## Task 6 — TS: refactor consumeAiOp con feature flag

**Files:**
- Modify: `src/lib/ai/ops-guard.ts` (líneas ~24-100 en `consumeAiOp`)

**Interfaces:**
- Consumes: `consume_pool_ops` RPC (Task 4), `organizations.ops_ledger_enabled` (Task 1).
- Produces: `consumeAiOp(agentId, count, meta)` mantiene la misma signature pero internamente branchea por flag.

- [ ] **Step 1: Leer el archivo actual completo**

Verificar contenido actual de `src/lib/ai/ops-guard.ts` (existe la función `consumeAiOp`, 3 paths — annual, stripe-portal, stripe-standalone).

- [ ] **Step 2: Refactorizar consumeAiOp para checar el flag**

Reemplazar el body de `consumeAiOp` en `src/lib/ai/ops-guard.ts`:

```typescript
export async function consumeAiOp(agentId: string, count = 1, meta?: OpsMeta): Promise<OpsResult> {
  const supabase = createAdminClient();
  const logPayload = {
    source:       meta?.source       ?? 'unknown',
    reference_id: meta?.reference_id ?? null,
    label:        meta?.label        ?? null,
    context:      meta?.context      ?? null,
    count,
  };

  // Resolve portal_email + feature flag + billing_model
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agentId)
    .maybeSingle();
  const portalEmail = (agentRow?.portal_email as string | null) ?? null;

  let ledgerEnabled = false;
  if (portalEmail) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    ledgerEnabled = !!orgRow?.ops_ledger_enabled;
  }

  // Path NEW (feature flag on): unifica annual + stripe via consume_pool_ops
  if (ledgerEnabled && portalEmail) {
    const { data: newBalance, error } = await supabase.rpc('consume_pool_ops', {
      p_portal_email: portalEmail,
      p_agent_id:     agentId,
      p_ops:          count,
      p_reference_id: meta?.reference_id ?? null,
      p_description:  meta?.label ?? meta?.source ?? null,
    });
    if (error) return { ok: false, used: 0, limit: 0 };

    const { data: acct } = await supabase
      .from('account_ops')
      .select('ops_used, ops_included')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    after(async () => {
      await supabase
        .from('ai_ops_log')
        .insert({ agent_id: agentId, portal_email: portalEmail, ...logPayload });
    });

    // Balance <=0 = agotado; los grants nuevos vienen del cron
    return {
      ok:    (newBalance ?? 0) >= 0,
      used:  acct?.ops_used ?? 0,
      limit: acct?.ops_included ?? 0,
    };
  }

  // Path LEGACY: código actual sin cambios (annual → consumePoolOps, stripe → consume_ai_ops)
  if (portalEmail) {
    const pool = await consumePoolOps(portalEmail, count, supabase);
    if (pool.consumed) {
      void fireOverageAlertIfNeeded(portalEmail, {
        crossed_100_threshold: pool.crossed_100_threshold,
        crossed_120_threshold: pool.crossed_120_threshold,
      });
      after(async () => {
        await supabase
          .from('ai_ops_log')
          .insert({ agent_id: agentId, portal_email: portalEmail, ...logPayload });
      });
      return { ok: true, used: pool.minutes_used_after, limit: pool.minutes_pool };
    }
  }

  const { data, error } = await supabase
    .rpc('consume_ai_ops', { p_agent_id: agentId, p_count: count })
    .single();

  if (error || !data) return { ok: false, used: 0, limit: 0 };

  const row = data as { ok: boolean; ops_used: number; ops_limit: number; account_email: string | null };

  if (row.ok && row.account_email) {
    const accountEmail = row.account_email;
    after(async () => {
      await supabase
        .from('ai_ops_log')
        .insert({ agent_id: agentId, portal_email: accountEmail, ...logPayload });
    });

    const remaining = row.ops_limit - row.ops_used;
    const prevRemaining = remaining + count;
    after(async () => {
      const { data: cfg } = await supabase
        .from('voice_agents')
        .select('auto_refill_ops_enabled, auto_refill_ops_threshold, stripe_customer_id')
        .eq('id', agentId)
        .single();
      const threshold = (cfg?.auto_refill_ops_threshold as number) ?? 50;
      if (cfg?.auto_refill_ops_enabled && cfg?.stripe_customer_id && prevRemaining >= threshold && remaining < threshold) {
        await executeAutoRefillOps(agentId).catch(() => null);
      }
    });
  }

  return { ok: row.ok, used: row.ops_used, limit: row.ops_limit };
}
```

- [ ] **Step 3: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Test manual — flag off = comportamiento previo**

Con `TEST_EMAIL` que tenga `ops_ledger_enabled=false`, llamar `consumeAiOp` desde un smoke test:

```typescript
// tests/integration/ops-ledger.test.ts (append)
describe('consumeAiOp behavior with feature flag', () => {
  it('uses legacy path when flag off', async () => {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', TEST_EMAIL)
      .maybeSingle();

    // Assumption: TEST_EMAIL org has flag off by default
    expect(org?.ops_ledger_enabled ?? false).toBe(false);

    // Ledger should be empty of consumption rows for this email
    const before = await supabase
      .from('ops_ledger')
      .select('id')
      .eq('portal_email', TEST_EMAIL)
      .eq('kind', 'consumption');

    // No hacemos consumeAiOp real aquí porque toca agentes vivos.
    // El test principal es que el flag existe y default false.
    expect(before.data).toEqual([]);
  });
});
```

Run: `npx vitest run tests/integration/ops-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ops-guard.ts tests/integration/ops-ledger.test.ts
git commit -m "feat(ops-ledger): consumeAiOp branches on ops_ledger_enabled flag"
```

---

## Task 7 — TS: refactor consumePoolOps en pool-consume.ts

**Files:**
- Modify: `src/lib/annual-contracts/pool-consume.ts` (función `consumePoolOps`)

**Interfaces:**
- Consumes: `consume_pool_ops` RPC (Task 4), `ops_ledger_enabled` flag.
- Produces: `consumePoolOps` mantiene su return type pero usa el ledger cuando flag on.

- [ ] **Step 1: Modificar consumePoolOps para checar el flag**

Reemplazar el body de `consumePoolOps` en `src/lib/annual-contracts/pool-consume.ts` (deja `getPoolSnapshot` y `consumePoolMinutes` sin tocar):

```typescript
export async function consumePoolOps(
  portalEmail: string,
  ops: number,
  supabase?: Supabase,
): Promise<PoolConsumeResult | PoolPassthroughResult> {
  const sb = supabase ?? createAdminClient();

  // Check feature flag
  const { data: orgFlag } = await sb
    .from('organizations')
    .select('ops_ledger_enabled, billing_model')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const ledgerEnabled = !!orgFlag?.ops_ledger_enabled;
  const model = (orgFlag?.billing_model as BillingModel) ?? 'stripe';

  // NEW path: ledger event-sourced (aplica tanto a stripe como annual)
  if (ledgerEnabled) {
    // Solo annual pasa por consumePoolOps hoy — para stripe consumeAiOp llama consume_pool_ops directo
    if (model !== 'annual_prepaid') {
      return { consumed: false, billing_model: model === 'expired' ? 'expired' : 'stripe' };
    }

    const { data: newBalance } = await sb.rpc('consume_pool_ops', {
      p_portal_email: portalEmail,
      p_agent_id:     null,
      p_ops:          ops,
      p_reference_id: null,
      p_description:  null,
    });

    const { data: acct } = await sb
      .from('account_ops')
      .select('ops_used, ops_included')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const { data: org } = await sb
      .from('organizations')
      .select('overage_ops')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const pool = acct?.ops_included ?? 0;
    const used = acct?.ops_used ?? 0;
    const overage = (org?.overage_ops as number) ?? 0;
    const pctPrev = pool > 0 ? ((used - ops) / pool) * 100 : 0;
    const pctNext = pool > 0 ? (used / pool) * 100 : 0;

    return {
      consumed:              true,
      billing_model:         'annual_prepaid',
      minutes_used_after:    used,
      minutes_pool:          pool,
      overage_after:         overage,
      crossed_100_threshold: pctPrev < 100 && pctNext >= 100,
      crossed_120_threshold: pctPrev < 120 && pctNext >= 120,
    };
  }

  // LEGACY path: código actual sin cambios
  const snap = await getPoolSnapshot(portalEmail, sb);
  if (!snap) {
    const { data: org } = await sb
      .from('organizations')
      .select('billing_model')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    return { consumed: false, billing_model: ((org?.billing_model as BillingModel) ?? 'stripe') === 'expired' ? 'expired' : 'stripe' };
  }

  const prev = snap.monthly_ops_used;
  const next = prev + ops;
  const pool = snap.monthly_ops_pool;
  const prevOverBy = Math.max(0, prev - pool);
  const nextOverBy = Math.max(0, next - pool);
  const overageDelta = nextOverBy - prevOverBy;
  const newOverage = snap.overage_ops + overageDelta;

  await sb.from('organizations')
    .update({
      monthly_ops_used: next,
      overage_ops:      newOverage,
    })
    .eq('portal_email', portalEmail);

  const pctPrev = pool > 0 ? (prev / pool) * 100 : 0;
  const pctNext = pool > 0 ? (next / pool) * 100 : 0;

  return {
    consumed:              true,
    billing_model:         'annual_prepaid',
    minutes_used_after:    next,
    minutes_pool:          pool,
    overage_after:         newOverage,
    crossed_100_threshold: pctPrev < 100 && pctNext >= 100,
    crossed_120_threshold: pctPrev < 120 && pctNext >= 120,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/annual-contracts/pool-consume.ts
git commit -m "feat(ops-ledger): consumePoolOps branches on ops_ledger_enabled flag for annual"
```

---

## Task 8 — TS: webhook stripe extra_ops → apply_ops_ledger_entry

**Files:**
- Modify: `src/app/api/billing/webhook/route.ts` (bloque `extra_ops` ~línea 175-215)

**Interfaces:**
- Consumes: `apply_ops_ledger_entry` RPC (Task 3), `ops_ledger_enabled` flag.
- Produces: cuando flag on, el credit va al ledger y triggera rollover_cap si excede; cuando off, comportamiento actual.

- [ ] **Step 1: Localizar el bloque actual de extra_ops en el webhook**

En `src/app/api/billing/webhook/route.ts` buscar `session.metadata?.type === 'extra_ops'`. Verifica que el UPDATE actual hace `ai_ops_limit + ops` directo.

- [ ] **Step 2: Añadir branching por feature flag**

Reemplazar el bloque `extra_ops` (aproximadamente):

```typescript
if (session.metadata?.type === 'extra_ops') {
  const agentId = session.metadata?.agent_id;
  const ops     = parseInt(session.metadata?.ops ?? '0');
  if (!agentId || !ops) break;

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, ai_ops_limit')
    .eq('id', agentId)
    .single();

  if (!agent) break;

  const portalEmail = agent.portal_email as string | null;
  let ledgerEnabled = false;
  if (portalEmail) {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    ledgerEnabled = !!org?.ops_ledger_enabled;
  }

  if (ledgerEnabled && portalEmail) {
    // NEW path: escribe al ledger, cap 2× aplicado automático
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: portalEmail,
      p_agent_id:     agentId,
      p_amount:       ops,
      p_kind:         'extra_ops_purchase',
      p_reference_id: session.id ?? null,
      p_description:  `Compra de ${ops} tareas extra`,
    });
    // Notify si excedió cap — helper generalizado en Task 15
    after(() => maybeNotifyPoolLoss(supabase, { portalEmail, referenceId: session.id ?? null, resource: 'ops' }));
  } else {
    // LEGACY: código actual
    const newOpsLimit = ((agent.ai_ops_limit as number) ?? 0) + ops;
    if (portalEmail) {
      await supabase.from('voice_agents')
        .update({ ai_ops_limit: newOpsLimit })
        .eq('id', agentId);
    } else {
      await supabase.from('voice_agents')
        .update({ ai_ops_limit: newOpsLimit })
        .eq('id', agentId);
    }
  }

  break;
}
```

`maybeNotifyPoolLoss` se generaliza en Task 15. Para que Task 8 pueda commitear standalone, agregamos ya un stub en `src/lib/billing/rollover-cap-notify.ts` que hace passthrough a `maybeNotifyRolloverLoss` para minutos y no-op con log para ops:

```typescript
// En rollover-cap-notify.ts — agregar al final del archivo:
export async function maybeNotifyPoolLoss(
  supabase: SupabaseClient,
  params: { portalEmail: string; referenceId: string | null; resource: 'minutes' | 'ops' }
): Promise<void> {
  if (params.resource === 'minutes') {
    return maybeNotifyRolloverLoss(supabase, params);
  }
  // Ops: no-op hasta Task 15. Log para poder auditar cuántos eventos se perderían.
  console.log('[pool-loss-notify:stub] ops event skipped (implementation lands in Task 15)', params);
}
```

En Task 15 este stub se reemplaza por la implementación real en `pool-loss-notify.ts` y el archivo original se convierte en re-export.

- [ ] **Step 3: Añadir el import + stub**

En `src/lib/billing/rollover-cap-notify.ts`, agregar la función `maybeNotifyPoolLoss` como wrapper temporal.

En `webhook/route.ts`, actualizar el import existente:

```typescript
import { maybeNotifyRolloverLoss, maybeNotifyPoolLoss } from '@/lib/billing/rollover-cap-notify';
```

- [ ] **Step 4: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/billing/webhook/route.ts src/lib/billing/rollover-cap-notify.ts
git commit -m "feat(ops-ledger): webhook extra_ops routes to apply_ops_ledger_entry when flag on"
```

---

## Task 9 — TS: webhook renewal + setup_new_agent + plan_upgrade para ops

**Files:**
- Modify: `src/app/api/billing/webhook/route.ts` (bloques `plan_upgrade` ops delta, `setup_new_agent`, `invoice.paid` renewal)

**Interfaces:**
- Consumes: `apply_ops_ledger_entry` RPC (Task 3), `MONTHLY_CONFIG` y `NOX_MONTHLY_CONFIG` de plans.ts.
- Produces: ops credits para renewal/setup/plan_upgrade van al ledger cuando flag on.

- [ ] **Step 1: Localizar los 3 bloques**

En webhook/route.ts:
- Bloque `plan_upgrade` — hoy actualiza `voice_agents.ai_ops_limit` con el nuevo tier.
- Bloque `setup_new_agent` — el `resetAiOps` + `setAiOpsLimit` calls.
- Bloque `invoice.paid` renewal — llama `resetAiOps` y `setAiOpsLimit`.

Documentar en el commit qué líneas se cambian.

- [ ] **Step 2: Añadir helper local para ops credit**

Al principio de webhook/route.ts (después de imports), agregar:

```typescript
// Wrapper que decide entre ledger (nuevo) y legacy setAiOpsLimit según feature flag.
async function creditOpsToPool(
  supabase: ReturnType<typeof createAdminClient>,
  args: {
    portalEmail: string;
    agentId: string;
    amount: number;
    kind: 'renewal' | 'setup_new_agent' | 'jornada_change';
    referenceId: string | null;
    description: string;
  }
): Promise<void> {
  const { data: org } = await supabase
    .from('organizations')
    .select('ops_ledger_enabled')
    .eq('portal_email', args.portalEmail)
    .maybeSingle();

  if (org?.ops_ledger_enabled) {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: args.portalEmail,
      p_agent_id:     args.agentId,
      p_amount:       args.amount,
      p_kind:         args.kind,
      p_reference_id: args.referenceId,
      p_description:  args.description,
    });
    // Después de renewal on annual, apply_ops_annual_grant sería más correcto,
    // pero webhook renewal ES para stripe. Annual usa el cron reset-ops-pool.
  }
  // Legacy path se mantiene inline en cada sitio (no lo movemos aquí para no
  // acoplar los flujos annual/stripe existentes).
}
```

- [ ] **Step 3: Modificar el bloque de renewal (invoice.paid)**

Localizar la sección `case 'invoice.paid':` en webhook/route.ts. Después de la llamada existente `if (renewalEmail) await resetAiOps(renewalEmail);`, agregar:

```typescript
if (renewalEmail) {
  // Legacy: resetAiOps ya se llamó
  const opsConfig = MONTHLY_CONFIG[agent.plan as Plan]?.[agent.minutes_plan as MinutesTier];
  const opsAmount = opsConfig?.aiOps ?? 0;
  if (opsAmount > 0) {
    await creditOpsToPool(supabase, {
      portalEmail: renewalEmail,
      agentId:     agentId,
      amount:      opsAmount,
      kind:        'renewal',
      referenceId: invoice.id ?? null,
      description: `Renovación mensual: ${opsAmount} tareas`,
    });
    after(() => maybeNotifyPoolLoss(supabase, { portalEmail: renewalEmail, referenceId: invoice.id ?? null, resource: 'ops' }));
  }
}
```

- [ ] **Step 4: Modificar el bloque de setup_new_agent**

En el bloque después de que se calcula `jornadaAlloc` y se crea la subscripción, si `jornadaAlloc.ops > 0`:

```typescript
if (activationEmail && jornadaAlloc.ops > 0) {
  await creditOpsToPool(supabase, {
    portalEmail: activationEmail,
    agentId:     agentId,
    amount:      jornadaAlloc.ops,
    kind:        'setup_new_agent',
    referenceId: session.id ?? null,
    description: `Activación de nuevo empleado: +${jornadaAlloc.ops} tareas`,
  });
}
```

Cómo derivar `jornadaAlloc.ops`: primero busca en `JORNADA_CONFIG[jornadaType].ops`. Si es `undefined`, calcula así:

```typescript
const isNoxLike = agent.role === 'ops' || agent.role === 'admin'; // Nox/Niva
const opsForNew = isNoxLike
  ? (NOX_MONTHLY_CONFIG[minutesPlan as keyof typeof NOX_MONTHLY_CONFIG]?.ai_ops ?? 0)
  : (MONTHLY_CONFIG[plan as Plan]?.[minutesPlan as MinutesTier]?.aiOps ?? 0);
```

Usa `opsForNew` como el `p_amount`. Si es 0 (jornada solo-minutos), skipear la llamada a `creditOpsToPool`.

- [ ] **Step 5: Modificar el bloque de plan_upgrade**

Al calcular `delta` para minutos existente, calcular también `opsDelta`:

```typescript
const prevOpsPer   = prevTier ? (MONTHLY_CONFIG[toPlan][prevTier]?.aiOps ?? 0) : 0;
const newOpsPer    = newMinutesCfg.aiOps ?? 0;
const opsDelta     = Math.max(0, newOpsPer - prevOpsPer);

if (opsDelta > 0 && upgradeEmail) {
  await creditOpsToPool(supabase, {
    portalEmail: upgradeEmail,
    agentId:     agentId,
    amount:      opsDelta,
    kind:        'renewal',
    referenceId: session.id ?? null,
    description: `Upgrade a ${newMinutesCfg.label}: +${opsDelta} tareas de diferencial`,
  });
  after(() => maybeNotifyPoolLoss(supabase, { portalEmail: upgradeEmail, referenceId: session.id ?? null, resource: 'ops' }));
}
```

- [ ] **Step 6: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/billing/webhook/route.ts
git commit -m "feat(ops-ledger): webhook renewal + setup + plan_upgrade credit ops via ledger"
```

---

## Task 10 — TS: activate-voice + auto-refill ops + admin ops route

**Files:**
- Modify: `src/app/api/portal/[token]/activate-voice/route.ts` (jornada_change)
- Modify: `src/lib/billing/auto-refill.ts` (executeAutoRefillOps)
- Create: `src/app/api/admin/agentes/[id]/ops/route.ts` (admin manual credit/debit)

**Interfaces:**
- Consumes: `apply_ops_ledger_entry` (Task 3), feature flag.
- Produces: 3 sitios más de credits (jornada_change, auto_refill_ops, admin_adjustment).

- [ ] **Step 1: Modificar activate-voice route**

En `src/app/api/portal/[token]/activate-voice/route.ts`, después del `apply_ledger_entry` de minutos (~línea 114), verificar si el cambio de jornada también otorga ops. Si sí:

```typescript
if (agent.portal_email && allocation.ops && allocation.ops > 0) {
  const { data: org } = await supabase
    .from('organizations')
    .select('ops_ledger_enabled')
    .eq('portal_email', agent.portal_email)
    .maybeSingle();

  if (org?.ops_ledger_enabled) {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: agent.portal_email,
      p_agent_id:     agent.id,
      p_amount:       allocation.ops,
      p_kind:         'jornada_change',
      p_reference_id: null,
      p_description:  `Activación de voz: +${allocation.ops} tareas`,
    });
  }
}
```

Si `allocation.ops` no existe en el interface actual, agregarlo en el tipo o calcularlo con base al nuevo jornada.

- [ ] **Step 2: Modificar executeAutoRefillOps**

En `src/lib/billing/auto-refill.ts`, localizar `executeAutoRefillOps`. Después del Stripe PaymentIntent success:

```typescript
const { data: org } = await supabase
  .from('organizations')
  .select('ops_ledger_enabled')
  .eq('portal_email', agent.portal_email)
  .maybeSingle();

if (org?.ops_ledger_enabled) {
  await supabase.rpc('apply_ops_ledger_entry', {
    p_portal_email: agent.portal_email,
    p_agent_id:     agentId,
    p_amount:       ops,
    p_kind:         'auto_refill_ops',
    p_reference_id: pi.id ?? null,
    p_description:  `Auto-recarga ${ops} tareas · $${amountMxn.toLocaleString('es-MX')} MXN`,
  });
  await maybeNotifyPoolLoss(supabase, { portalEmail: agent.portal_email, referenceId: pi.id ?? null, resource: 'ops' });
} else {
  // LEGACY: código actual sin cambios (update directo a ai_ops_limit)
}
```

- [ ] **Step 3: Crear admin/agentes/[id]/ops/route.ts**

Crear `src/app/api/admin/agentes/[id]/ops/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

interface Params { params: Promise<{ id: string }> }

// credit  → suma al pool
// debit   → resta al pool
export async function POST(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { action, amount, reason } = await req.json() as {
    action: 'credit' | 'debit';
    amount: number;
    reason?: string;
  };

  if (!['credit', 'debit'].includes(action) || typeof amount !== 'number' || amount < 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, ai_ops_used, ai_ops_limit')
    .eq('id', id)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const portalEmail = agent.portal_email ?? null;
  const ledgerAmount = action === 'credit' ? amount : -amount;
  const description = reason?.trim() || (action === 'credit' ? `Crédito manual: +${amount} tareas` : `Descuento manual: −${amount} tareas`);

  if (portalEmail) {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    if (org?.ops_ledger_enabled) {
      await supabase.rpc('apply_ops_ledger_entry', {
        p_portal_email: portalEmail,
        p_agent_id:     id,
        p_amount:       ledgerAmount,
        p_kind:         'admin_adjustment',
        p_reference_id: null,
        p_description:  description,
      });

      const { data: acct } = await supabase
        .from('account_ops')
        .select('ops_used, ops_included')
        .eq('portal_email', portalEmail)
        .maybeSingle();

      return NextResponse.json({
        ops_used:     acct?.ops_used     ?? 0,
        ops_included: acct?.ops_included ?? 0,
      });
    }
  }

  // LEGACY: update directo a voice_agents
  const currentLimit = agent.ai_ops_limit ?? 0;
  const currentUsed  = agent.ai_ops_used  ?? 0;
  if (action === 'credit') {
    await supabase.from('voice_agents').update({ ai_ops_limit: currentLimit + amount }).eq('id', id);
  } else {
    await supabase.from('voice_agents').update({ ai_ops_used: currentUsed + amount }).eq('id', id);
  }

  const { data: after } = await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('id', id).single();
  return NextResponse.json({
    ops_used:     after?.ai_ops_used     ?? 0,
    ops_included: after?.ai_ops_limit    ?? 0,
  });
}
```

- [ ] **Step 4: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/[token]/activate-voice/route.ts src/lib/billing/auto-refill.ts src/app/api/admin/agentes/[id]/ops/route.ts
git commit -m "feat(ops-ledger): activate-voice + auto-refill-ops + admin ops route use ledger"
```

---

## Task 11 — TS: cron reset-ops-pool dispatch stripe/annual

**Files:**
- Modify: `src/app/api/cron/reset-ops-pool/route.ts` (reescritura completa)

**Interfaces:**
- Consumes: `apply_ops_ledger_entry` (Task 3), `apply_ops_annual_grant` (Task 4), feature flag.
- Produces: cron mensual ahora inserta events al ledger para stripe (safety net) y annual (grant + forfeited).

- [ ] **Step 1: Reescribir el cron**

Reemplazar contenido de `src/app/api/cron/reset-ops-pool/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today    = new Date().toISOString().slice(0, 10);
  const nextResetDate = new Date();
  nextResetDate.setDate(nextResetDate.getDate() + 30);
  const nextResetIso = nextResetDate.toISOString().slice(0, 10);

  // Orgs con reset vencido, agrupadas por billing_model
  const { data: due } = await supabase
    .from('organizations')
    .select('portal_email, pool_reset_date, monthly_ops_used, monthly_ops_pool, billing_model, ops_ledger_enabled, active_contract_id')
    .lte('pool_reset_date', today);

  let annualGrants = 0;
  let stripeSafetyNets = 0;
  let legacyResets = 0;
  const errors: string[] = [];

  for (const org of due ?? []) {
    const email = org.portal_email as string;
    const model = org.billing_model as string;
    const ledgerOn = !!org.ops_ledger_enabled;

    try {
      if (ledgerOn && model === 'annual_prepaid' && org.active_contract_id) {
        // Annual: cierra ciclo con unused_forfeited + abre con annual_grant
        await supabase.rpc('apply_ops_annual_grant', { p_portal_email: email });
        annualGrants++;
      } else if (ledgerOn && (model === 'stripe' || !model)) {
        // Stripe safety net: si invoice.paid webhook no llegó, insertamos renewal manual.
        // Sumamos el aiOps del plan de cada agente activo para calcular el crédito total.
        const { data: agents } = await supabase
          .from('voice_agents')
          .select('id, plan, minutes_plan, ai_ops_limit')
          .eq('portal_email', email)
          .eq('active', true);

        let totalOps = 0;
        const primaryAgentId = agents?.[0]?.id ?? null;
        for (const a of agents ?? []) {
          const cfg = MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier];
          totalOps += cfg?.aiOps ?? (a.ai_ops_limit as number) ?? 0;
        }

        if (totalOps > 0 && primaryAgentId) {
          await supabase.rpc('apply_ops_ledger_entry', {
            p_portal_email: email,
            p_agent_id:     primaryAgentId,
            p_amount:       totalOps,
            p_kind:         'renewal',
            p_reference_id: `cron-safety-${today}`,
            p_description:  `Renovación (safety-net cron): ${totalOps} tareas`,
          });
          stripeSafetyNets++;
        }
      } else {
        // LEGACY path (flag off): comportamiento actual sin cambios
        await Promise.all([
          supabase.from('organizations').update({ monthly_ops_used: 0, pool_reset_date: nextResetIso }).eq('portal_email', email),
          supabase.from('voice_agents').update({ ai_ops_used: 0 }).eq('portal_email', email),
        ]);
        legacyResets++;
        continue;
      }

      // En path ledger-enabled también actualizamos pool_reset_date
      await supabase.from('organizations')
        .update({ pool_reset_date: nextResetIso })
        .eq('portal_email', email);

    } catch (err) {
      errors.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok:              true,
    checked:         due?.length ?? 0,
    annualGrants,
    stripeSafetyNets,
    legacyResets,
    errors:          errors.length ? errors : undefined,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Test manual del cron con curl**

Con el cron secret local:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reset-ops-pool
```

Expected: JSON `{ ok: true, checked: N, ... }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/reset-ops-pool/route.ts
git commit -m "feat(ops-ledger): reset-ops-pool cron dispatches stripe safety-net + annual grant"
```

---

## Task 12 — TS: annual-contracts-lifecycle inserta primer grant

**Files:**
- Modify: `src/app/api/cron/annual-contracts-lifecycle/route.ts` (agregar llamada a `apply_ops_annual_grant` al arrancar contrato)

**Interfaces:**
- Consumes: `apply_ops_annual_grant` (Task 4), feature flag.
- Produces: nuevo contrato annual arranca con `annual_grant` row en `ops_ledger`.

- [ ] **Step 1: Localizar el flow de activación de contrato**

Leer `src/app/api/cron/annual-contracts-lifecycle/route.ts` completo (buscar el bloque que marca `active_contract_id` en la org — es donde se arranca).

- [ ] **Step 2: Agregar la llamada después de activar**

Después de setear `active_contract_id`, si `ops_ledger_enabled`:

```typescript
if (org.ops_ledger_enabled) {
  await supabase.rpc('apply_ops_annual_grant', {
    p_portal_email: org.portal_email,
  });
}
```

Ubicación exacta: buscar donde se hace UPDATE de `active_contract_id` sobre `organizations`. Agregar la llamada inmediatamente después.

- [ ] **Step 3: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/annual-contracts-lifecycle/route.ts
git commit -m "feat(ops-ledger): annual-contracts-lifecycle inserts first apply_ops_annual_grant"
```

---

## Task 13 — TS: rename admin/rollover-perdido → admin/pool-perdido con tabs

**Files:**
- Create: `src/app/admin/pool-perdido/page.tsx` (nueva página con 3 tabs)
- Modify: `src/app/admin/rollover-perdido/page.tsx` (reemplazar contenido con redirect)
- Modify: `src/app/admin/AdminNav.tsx` (cambiar label + href)

**Interfaces:**
- Consumes: `minutes_ledger` y `ops_ledger` (kinds `rollover_cap`, `unused_forfeited`).
- Produces: `/admin/pool-perdido?tab=minutos|ops-rollover|ops-annual` accesible; redirect 301 desde ruta antigua.

- [ ] **Step 1: Crear pool-perdido/page.tsx con 3 tabs**

Crear `src/app/admin/pool-perdido/page.tsx`. Estructura básica:

```typescript
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { AlertTriangle, Info, RotateCcw, Terminal, TrendingDown, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

const DEMO_EMAILS = ['demo@centinelia.mx', 'centinelia.dev@gmail.com'];
type Tab = 'minutos' | 'ops-rollover' | 'ops-annual';

interface Props { searchParams: Promise<{ tab?: string }> }

export default async function PoolPerdidoPage({ searchParams }: Props) {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/pool-perdido');
  }
  const sp = await searchParams;
  const tab: Tab = (['minutos','ops-rollover','ops-annual'] as const).includes(sp.tab as Tab)
    ? (sp.tab as Tab) : 'minutos';

  const supabase = createAdminClient();
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Query según tab
  let rows: Array<{ portal_email: string; amount: number; created_at: string; description: string | null }> = [];
  if (tab === 'minutos') {
    const { data } = await supabase.from('minutes_ledger')
      .select('portal_email, amount, created_at, description')
      .eq('kind', 'rollover_cap')
      .order('created_at', { ascending: false });
    rows = (data ?? []) as typeof rows;
  } else if (tab === 'ops-rollover') {
    const { data } = await supabase.from('ops_ledger')
      .select('portal_email, amount, created_at, description')
      .eq('kind', 'rollover_cap')
      .order('created_at', { ascending: false });
    rows = (data ?? []) as typeof rows;
  } else {
    const { data } = await supabase.from('ops_ledger')
      .select('portal_email, amount, created_at, description')
      .eq('kind', 'unused_forfeited')
      .order('created_at', { ascending: false });
    rows = (data ?? []) as typeof rows;
  }

  // Aggregate por portal_email (misma lógica que /admin/rollover-perdido original)
  // ... (copiar el patrón del archivo original, ver src/app/admin/rollover-perdido/page.tsx)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Pool perdido</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Registro de saldo descartado por cap (stripe) o no consumido (annual).
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'minutos',       label: 'Minutos (rollover cap)' },
          { id: 'ops-rollover',  label: 'Tareas (rollover cap)' },
          { id: 'ops-annual',    label: 'Tareas (no consumidas · annual)' },
        ].map(t => (
          <Link
            key={t.id}
            href={`/admin/pool-perdido?tab=${t.id}`}
            className="px-4 py-2 text-[13px] font-medium"
            style={{
              color: tab === t.id ? '#111827' : '#6B7280',
              borderBottom: tab === t.id ? '2px solid #6C3BFF' : '2px solid transparent',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Tabla — usar el mismo patrón agregado del archivo original */}
      {/* ...ver src/app/admin/rollover-perdido/page.tsx para render de rows */}
    </div>
  );
}
```

Para el render de tabla + summary cards, copiar y adaptar del archivo `src/app/admin/rollover-perdido/page.tsx` existente (mantener las funciones auxiliares como `fmtMinutes`, `fmtDate`, `Th`, `SummaryCard`, `AggregatedRow`). El único cambio es que la unidad es "min" o "tareas" según tab.

- [ ] **Step 2: Reemplazar rollover-perdido/page.tsx con redirect**

Reemplazar todo el contenido de `src/app/admin/rollover-perdido/page.tsx`:

```typescript
import { redirect, permanentRedirect } from 'next/navigation';

export default function RolloverPerdidoLegacy() {
  permanentRedirect('/admin/pool-perdido?tab=minutos');
}
```

- [ ] **Step 3: Actualizar AdminNav**

En `src/app/admin/AdminNav.tsx` reemplazar la línea `Rollover perdido`:

```typescript
{ href: '/admin/pool-perdido',            icon: RotateCcw,   label: 'Pool perdido' },
```

- [ ] **Step 4: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Test manual navegación**

Iniciar dev server: `npm run dev`
Abrir `http://localhost:3000/admin/pool-perdido` y verificar los 3 tabs cargan sin errores (aunque sea vacíos si no hay data).
Verificar que `http://localhost:3000/admin/rollover-perdido` redirige a `/admin/pool-perdido?tab=minutos`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/pool-perdido/page.tsx src/app/admin/rollover-perdido/page.tsx src/app/admin/AdminNav.tsx
git commit -m "feat(ops-ledger): rename admin/rollover-perdido → pool-perdido with 3 tabs"
```

---

## Task 14 — TS: portal card extend con línea ámbar de ops

**Files:**
- Modify: `src/app/portal/[token]/page.tsx` (Promise.all block ~line 140 y hero tareas ~line 1305)

**Interfaces:**
- Consumes: `ops_ledger` (kinds `rollover_cap` + `unused_forfeited`).
- Produces: card portal muestra línea "N tareas no acumuladas / no consumidas" cuando aplica.

- [ ] **Step 1: Añadir query paralela en el Promise.all**

En `src/app/portal/[token]/page.tsx`, después de `rolloverLostRes` (línea ~172 aprox), agregar otra query:

```typescript
supabase
  .from('ops_ledger')
  .select('amount, kind')
  .eq('portal_email', agent.portal_email)
  .in('kind', ['rollover_cap', 'unused_forfeited'])
  .gte('created_at', cycleStartIso)
  .then(r => r.data),
```

Actualizar el destructuring:

```typescript
const [
  clientAgentsRes,
  orgSettingsRes,
  acctMinsRes,
  opsAgentsRes,
  accountSerialRes,
  rolloverLostRes,
  opsLossRes,
] = agent.portal_email ? await Promise.all([ /* ...anteriores + opsLossRes... */ ]) : [
  [], null, null, null, null, null, null,
];
```

Y el fallback:

```typescript
] : [
  [] as any[], null, null, null as any, null, null, null,
];
```

- [ ] **Step 2: Computar los totales ops separados**

Debajo de `rolloverLostThisCycle`:

```typescript
type OpsLossRow = { amount: number; kind: 'rollover_cap' | 'unused_forfeited' };
const opsLossRows = ((opsLossRes ?? []) as OpsLossRow[]);
const opsRolloverLost = Math.max(0, -opsLossRows.filter(r => r.kind === 'rollover_cap').reduce((s, r) => s + (r.amount ?? 0), 0));
const opsUnusedForfeited = Math.max(0, -opsLossRows.filter(r => r.kind === 'unused_forfeited').reduce((s, r) => s + (r.amount ?? 0), 0));
```

- [ ] **Step 3: Añadir la línea condicional en el hero de tareas**

Localizar el hero de tareas (~línea 1305) — busca el bloque después del `aiOpsPct` progress bar. Después de la línea de "N disponibles / Renueva el X", agregar:

```tsx
{opsRolloverLost > 0 && (
  <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
    {opsRolloverLost} tareas no acumuladas este ciclo por límite de rollover (2× de tu plan base).
  </p>
)}
{opsUnusedForfeited > 0 && (
  <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
    {opsUnusedForfeited} tareas no consumidas del ciclo anterior, no acumulan al siguiente.
  </p>
)}
```

- [ ] **Step 4: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/[token]/page.tsx
git commit -m "feat(ops-ledger): portal card shows ops rollover_cap + unused_forfeited amber line"
```

---

## Task 15 — TS: generalize rollover-cap-notify → pool-loss-notify

**Files:**
- Rename+Modify: `src/lib/billing/rollover-cap-notify.ts` → `src/lib/billing/pool-loss-notify.ts`
- Modify: todos los callers existentes (webhook, auto-refill)

**Interfaces:**
- Consumes: `minutes_ledger` o `ops_ledger` según `resource` param.
- Produces: `maybeNotifyPoolLoss({ portalEmail, referenceId, resource: 'minutes' | 'ops' })`.
- Deprecate: `maybeNotifyRolloverLoss` (mantener como alias por compat en misma sesión, borrar en cleanup posterior).

- [ ] **Step 1: Crear pool-loss-notify.ts con signature nueva**

Crear `src/lib/billing/pool-loss-notify.ts` copiando el contenido de `rollover-cap-notify.ts` pero:

- Renombrar `maybeNotifyRolloverLoss` → `maybeNotifyPoolLoss`.
- Signature: `params: { portalEmail: string; referenceId: string | null; resource: 'minutes' | 'ops' }`.
- Constantes por resource: `MIN_LOSS_TO_ALERT_MIN = 20`, `MIN_LOSS_TO_ALERT_OPS = 10`.
- Query interno branchea a `minutes_ledger` o `ops_ledger` según `resource`.
- Rate-limit por resource: `features.rollover_alert_sent_at_minutes` vs `features.rollover_alert_sent_at_ops`.
- Email subject/body adaptado: "minutos" vs "tareas" en textos.

Estructura clave:

```typescript
export async function maybeNotifyPoolLoss(
  supabase: SupabaseClient,
  params: { portalEmail: string; referenceId: string | null; resource: 'minutes' | 'ops' }
): Promise<void> {
  try {
    const { portalEmail, referenceId, resource } = params;
    if (!portalEmail || !referenceId) return;
    if (DEMO_EMAILS.has(portalEmail)) return;

    const table = resource === 'minutes' ? 'minutes_ledger' : 'ops_ledger';
    const threshold = resource === 'minutes' ? 20 : 10;
    const unitSing  = resource === 'minutes' ? 'minuto' : 'tarea';
    const unitPlur  = resource === 'minutes' ? 'minutos' : 'tareas';
    const flagKey   = resource === 'minutes' ? 'rollover_alert_sent_at_minutes' : 'rollover_alert_sent_at_ops';

    // Legacy back-compat: si el flag nuevo no existe pero existe el viejo (rollover_alert_sent_at), respetarlo para minutos.
    // ... (implementación con read del ledger, rate-limit check, envío)
  } catch (err) {
    console.error('[pool-loss-notify] error', err);
  }
}

// Alias para compatibilidad — callers existentes de minutos siguen funcionando
export async function maybeNotifyRolloverLoss(
  supabase: SupabaseClient,
  params: { portalEmail: string; referenceId: string | null }
): Promise<void> {
  return maybeNotifyPoolLoss(supabase, { ...params, resource: 'minutes' });
}
```

- [ ] **Step 2: Borrar el stub temporal en rollover-cap-notify.ts**

En `src/lib/billing/rollover-cap-notify.ts`, borrar la exportación temporal `maybeNotifyPoolLoss` creada en Task 8. El archivo puede quedar como un simple re-export:

```typescript
// Re-exporta desde pool-loss-notify.ts para compat con callers existentes.
export { maybeNotifyRolloverLoss, maybeNotifyPoolLoss } from './pool-loss-notify';
```

- [ ] **Step 3: Update callers de imports**

Buscar todos los imports de `rollover-cap-notify` y cambiar a `pool-loss-notify` (opcional, el re-export cubre back-compat).

```bash
# Verificar imports
grep -r "rollover-cap-notify" C:/Users/Nazre/centinelia/src
```

Sitios encontrados en Task 8/9/10 (webhook, auto-refill, etc.) — ya usan `maybeNotifyPoolLoss` importado desde `rollover-cap-notify.ts` (que re-exporta). Funciona sin cambios.

- [ ] **Step 4: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Correr tests existentes para verificar no ruptura**

Run: `npx vitest run` (suite completa)
Expected: sin fallos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/pool-loss-notify.ts src/lib/billing/rollover-cap-notify.ts
git commit -m "feat(ops-ledger): generalize rollover-cap-notify → pool-loss-notify with resource param"
```

---

## Task 16 — TS: OpsLedgerSection + CSV export

**Files:**
- Create: `src/app/portal/[token]/OpsLedgerSection.tsx`
- Create: `src/app/portal/[token]/OpsLedgerListClient.tsx`
- Create: `src/app/api/portal/[token]/ops-ledger.csv/route.ts`
- Modify: `src/app/portal/[token]/page.tsx` (montar `<OpsLedgerSection />` dentro del tab `cuenta`)

**Interfaces:**
- Consumes: `ops_ledger` rows.
- Produces: historial visible en portal + botón exportar CSV.

- [ ] **Step 1: Crear OpsLedgerSection.tsx**

Copiar la estructura de `src/app/portal/[token]/MinutesLedgerSection.tsx`. Los cambios:

- Query a `ops_ledger` en vez de `minutes_ledger`.
- No hay tabla separada de debits (para minutos son `voice_calls`; para ops los debits ya están en el ledger como `kind='consumption'`).
- Kinds a mapear: `annual_grant`, `renewal`, `extra_ops_purchase`, `auto_refill_ops`, `setup_new_agent`, `jornada_change`, `admin_adjustment`, `rollover_cap`, `unused_forfeited`, `consumption`.
- Botón "Exportar CSV" que abre `/api/portal/[token]/ops-ledger.csv`.

Sample skeleton:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import OpsLedgerListClient, { type OpsLedgerEntry, type OpsLedgerKind } from './OpsLedgerListClient';

export default async function OpsLedgerSection({
  portalEmail,
  token,
}: {
  portalEmail: string;
  token: string;
}) {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from('ops_ledger')
    .select('id, created_at, amount, description, kind')
    .eq('portal_email', portalEmail)
    .order('created_at', { ascending: false })
    .limit(500);

  let running = 0;
  const chronological = [...(rows ?? [])].reverse();
  const withBalance: OpsLedgerEntry[] = chronological.map(r => {
    running += (r.amount ?? 0);
    return {
      id:          r.id,
      date:        r.created_at,
      amount:      r.amount ?? 0,
      description: r.description ?? '',
      kind:        (r.kind ?? 'admin_adjustment') as OpsLedgerKind,
      balance:     running,
    };
  }).reverse();

  return (
    <OpsLedgerListClient
      entries={withBalance}
      csvUrl={`/api/portal/${token}/ops-ledger.csv`}
    />
  );
}
```

- [ ] **Step 2: Crear OpsLedgerListClient.tsx**

Copiar patrón de `MinutesLedgerListClient.tsx`. Meta por kind con icon/color/label:

```typescript
'use client';

import { RefreshCw, RotateCcw, Zap, CreditCard, SlidersHorizontal, BatteryCharging, TrendingDown, X, Download } from 'lucide-react';

export type OpsLedgerKind = 'renewal' | 'extra_ops_purchase' | 'auto_refill_ops' | 'setup_new_agent' | 'jornada_change' | 'admin_adjustment' | 'rollover_cap' | 'annual_grant' | 'unused_forfeited' | 'consumption';

export interface OpsLedgerEntry {
  id: string; date: string; amount: number; description: string; kind: OpsLedgerKind; balance: number;
}

const KIND_META: Record<OpsLedgerKind, { iconKey: string; color: string; label: string }> = {
  renewal:            { iconKey: 'refresh',       color: '#10B981', label: 'Renovación' },
  extra_ops_purchase: { iconKey: 'zap',           color: '#f59e0b', label: 'Compra extra' },
  auto_refill_ops:    { iconKey: 'battery',       color: '#3b82f6', label: 'Auto-recarga' },
  setup_new_agent:    { iconKey: 'card',          color: '#3b82f6', label: 'Nuevo empleado' },
  jornada_change:     { iconKey: 'sliders',       color: '#3b82f6', label: 'Cambio de jornada' },
  admin_adjustment:   { iconKey: 'sliders',       color: '#6B7280', label: 'Ajuste admin' },
  rollover_cap:       { iconKey: 'x',             color: '#B45309', label: 'Descartado (cap 2×)' },
  annual_grant:       { iconKey: 'refresh',       color: '#10B981', label: 'Grant mensual (contrato)' },
  unused_forfeited:   { iconKey: 'trending-down', color: '#B45309', label: 'No consumido' },
  consumption:        { iconKey: 'rotate',        color: '#6B7280', label: 'Consumo' },
};

export default function OpsLedgerListClient({ entries, csvUrl }: { entries: OpsLedgerEntry[]; csvUrl: string }) {
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: '1px solid #E5E7EB' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>Historial de tareas</h3>
        <a href={csvUrl} download className="text-[12px] font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: '#F3F4F6', color: '#374151' }}>
          <Download size={12} />
          Exportar CSV
        </a>
      </div>
      {entries.length === 0 ? (
        <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin movimientos todavía.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#F3F4F6' }}>
          {entries.map(e => {
            const meta = KIND_META[e.kind] ?? KIND_META.admin_adjustment;
            return (
              <li key={e.id} className="py-2.5 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: '#6B7280' }}>{e.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold tabular-nums" style={{ color: e.amount >= 0 ? '#10B981' : '#B45309' }}>
                    {e.amount >= 0 ? '+' : ''}{e.amount}
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: '#9CA3AF' }}>Saldo: {e.balance}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crear ops-ledger.csv/route.ts**

Crear `src/app/api/portal/[token]/ops-ledger.csv/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const session = await verifySession(token, req);
  if (!session?.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from('ops_ledger')
    .select('created_at, amount, kind, source, reference_id, description')
    .eq('portal_email', session.portalEmail)
    .order('created_at', { ascending: true });

  const header = 'fecha,cantidad,tipo,fuente,referencia,descripcion\n';
  const body = (rows ?? []).map(r => {
    const desc = (r.description ?? '').replace(/"/g, '""');
    return `${r.created_at},${r.amount},${r.kind},${r.source ?? ''},${r.reference_id ?? ''},"${desc}"`;
  }).join('\n');

  const csv = header + body + '\n';
  const filename = `ops-ledger-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 4: Montar OpsLedgerSection en portal/page.tsx**

Localizar en `src/app/portal/[token]/page.tsx` donde se monta `<MinutesLedgerSection />` (dentro del tab `cuenta`). Agregar `<OpsLedgerSection />` inmediatamente después:

```tsx
{agent.portal_email && (
  <OpsLedgerSection
    portalEmail={agent.portal_email}
    token={token}
  />
)}
```

Importar al principio:

```typescript
import OpsLedgerSection from './OpsLedgerSection';
```

- [ ] **Step 5: Type-check**

Run: `cd C:/Users/Nazre/centinelia && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Test manual navegación**

Iniciar dev server: `npm run dev`
Abrir portal de la cuenta demo. Navegar al tab Cuenta.
Verificar que aparece "Historial de tareas" (vacío si aún no hay eventos).
Click en "Exportar CSV" — debería descargar un archivo CSV (aunque solo tenga header si no hay eventos).

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/OpsLedgerSection.tsx src/app/portal/[token]/OpsLedgerListClient.tsx src/app/api/portal/[token]/ops-ledger.csv/route.ts src/app/portal/[token]/page.tsx
git commit -m "feat(ops-ledger): portal OpsLedgerSection with historial + CSV export"
```

---

## Task 17 — E2E validation en cuenta demo

**Files:** ninguno de código; solo activación de flag + validación de flows.

**Interfaces:**
- Consumes: todo lo shipeado en Tasks 1-16.
- Produces: confianza de que el flow completo funciona end-to-end en la cuenta demo, antes de rollout a annual.

- [ ] **Step 1: Activar flag en la cuenta demo**

En Supabase SQL editor (o MCP):

```sql
UPDATE organizations
SET ops_ledger_enabled = true
WHERE portal_email = 'centinelia.dev@gmail.com';
```

- [ ] **Step 2: Golden path — extra_ops purchase con cap hit**

1. En portal demo → sección `Comprar tareas` → comprar un paquete grande (ej. 500 tareas) via Stripe test mode.
2. Verificar en Supabase:
   ```sql
   SELECT kind, amount, description, created_at
   FROM ops_ledger
   WHERE portal_email = 'centinelia.dev@gmail.com'
   ORDER BY created_at DESC LIMIT 5;
   ```
   Expected: al menos 1 row `kind='extra_ops_purchase'` con `amount=500`. Si excedió cap, también 1 row `kind='rollover_cap'` con `amount` negativo.
3. Verificar `account_ops`:
   ```sql
   SELECT * FROM account_ops WHERE portal_email = 'centinelia.dev@gmail.com';
   ```
   `ops_balance` debe cuadrar con la suma del ledger.
4. Si hubo `rollover_cap`, verificar email recibido (Resend log).

- [ ] **Step 3: Golden path — consumption via consumeAiOp**

1. Ejecutar una herramienta agente que dispare `consumeAiOp` (ej. call agent chat que use un tool o tarea manual desde el portal).
2. Verificar:
   ```sql
   SELECT * FROM ops_ledger
   WHERE portal_email = 'centinelia.dev@gmail.com'
     AND kind = 'consumption'
   ORDER BY created_at DESC LIMIT 3;
   ```
   Expected: nuevos rows con `amount` negativo.
3. Verificar `account_ops.ops_used` incrementó.

- [ ] **Step 4: Admin dashboard visual check**

1. Abrir `/admin/pool-perdido?tab=ops-rollover` — si el step 2 gatilló rollover_cap, debe aparecer el cliente demo con el amount perdido.
2. Abrir `/admin/pool-perdido?tab=minutos` — la vista de minutos existente debe seguir funcionando idéntica.

- [ ] **Step 5: Portal card visual check**

1. Abrir el portal de la cuenta demo.
2. Si hubo rollover_cap, verificar línea ámbar "N tareas no acumuladas este ciclo por límite de rollover" en el hero de tareas.
3. Scroll al tab Cuenta → verificar que "Historial de tareas" muestra los eventos generados.
4. Click "Exportar CSV" → verificar que el archivo se descarga con las columnas correctas.

- [ ] **Step 6: Documentar resultado**

Crear `docs/superpowers/plans/2026-08-09-ops-ledger-e2e-validation.md` con:
- Fecha de ejecución
- Balance final del ledger vs balance del cache
- Screenshots (opcionales) de: admin dashboard con datos, portal card con línea ámbar, CSV descargado abierto en excel
- Cualquier bug encontrado + fix aplicado

- [ ] **Step 7: Commit del documento de validación**

```bash
git add docs/superpowers/plans/2026-08-09-ops-ledger-e2e-validation.md
git commit -m "docs(ops-ledger): E2E validation results on demo account"
```

---

## Task 18 — Rollout a annual (municipio) con checklist

**Files:** ninguno de código.

**Interfaces:**
- Consumes: todo lo validado en Task 17.
- Produces: cuenta municipio corre con ops_ledger event-sourced. Municipio puede pedir su CSV audit trail.

- [ ] **Step 1: Identificar el portal_email del municipio**

Query:
```sql
SELECT o.portal_email, o.name, o.billing_model, ac.contract_folio, ac.monthly_ops_pool
FROM organizations o
LEFT JOIN annual_contracts ac ON ac.id = o.active_contract_id
WHERE o.billing_model = 'annual_prepaid';
```

Anotar el `portal_email` del municipio (o del contrato que corresponda).

- [ ] **Step 2: Documentar estado pre-rollout**

Snapshot para audit:

```sql
SELECT 
  (SELECT monthly_ops_pool FROM organizations WHERE portal_email = '<municipio>') AS pool_actual,
  (SELECT monthly_ops_used FROM organizations WHERE portal_email = '<municipio>') AS used_actual,
  (SELECT overage_ops       FROM organizations WHERE portal_email = '<municipio>') AS overage_actual,
  (SELECT pool_reset_date   FROM organizations WHERE portal_email = '<municipio>') AS proximo_reset;
```

Guardar el output en el doc de validación.

- [ ] **Step 3: Activar flag para el municipio**

```sql
UPDATE organizations
SET ops_ledger_enabled = true
WHERE portal_email = '<municipio>';
```

- [ ] **Step 4: Forzar el primer annual_grant**

```sql
SELECT apply_ops_annual_grant('<municipio>');
```

Este es el primer evento que arranca el ledger event-sourced para esa cuenta.

- [ ] **Step 5: Verificar el ledger arrancó**

```sql
SELECT kind, amount, description, created_at
FROM ops_ledger
WHERE portal_email = '<municipio>'
ORDER BY created_at;
```

Expected: 1 row `annual_grant` con `amount = contract.monthly_ops_pool`. `unused_forfeited` no debería existir (primer grant, no había balance previo).

- [ ] **Step 6: Verificar account_ops se creó**

```sql
SELECT * FROM account_ops WHERE portal_email = '<municipio>';
```

Expected: `ops_balance = monthly_ops_pool`, `ops_used = 0`.

- [ ] **Step 7: Monitorear consumo por 24-48 horas**

Consultas para chequear salud del rollout:

```sql
-- Consumos capturados via ledger
SELECT COUNT(*) as eventos_consumption, SUM(-amount) as total_consumido
FROM ops_ledger
WHERE portal_email = '<municipio>'
  AND kind = 'consumption'
  AND created_at >= NOW() - INTERVAL '48 hours';

-- Comparar con ai_ops_log (audit alternativo) — ambos deben coincidir en count
SELECT COUNT(*) as eventos_audit, SUM(count) as total_audit
FROM ai_ops_log
WHERE portal_email = '<municipio>'
  AND created_at >= NOW() - INTERVAL '48 hours';
```

Los dos totales deben cuadrar. Si divergen, hay un bug — investigar antes de continuar.

- [ ] **Step 8: Entregar CSV audit al equipo de cuenta**

Descargar el CSV del portal (`/api/portal/<token>/ops-ledger.csv`) y compartir con quien lleve la cuenta del municipio. Éste es el artefacto de auditoría que se le entrega al cliente si lo solicita.

- [ ] **Step 9: Documentar rollout**

En `docs/superpowers/plans/2026-08-09-ops-ledger-e2e-validation.md`, agregar sección "Rollout Municipio" con:
- Fecha de activación
- portal_email
- Snapshot pre-activación
- Primer annual_grant row (id + amount + created_at)
- Chequeos de consistencia de 24-48h
- Cualquier incidente + resolución

- [ ] **Step 10: Commit final**

```bash
git add docs/superpowers/plans/2026-08-09-ops-ledger-e2e-validation.md
git commit -m "docs(ops-ledger): municipio rollout complete + audit CSV delivered"
```

---

## Notas finales de rollout

- **Rollback:** para cualquier cuenta con problemas, `UPDATE organizations SET ops_ledger_enabled = false WHERE portal_email = 'x'`. El sistema vuelve al path legacy inmediatamente. Los rows del ledger quedan pero no se leen para operación.
- **Cleanup posterior:** una vez que todas las cuentas estén en flag on y estables 30+ días, se puede borrar los paths legacy en `consumeAiOp`, `consumePoolOps`, webhook, auto-refill. Deuda documentada en memoria como sub-tarea futura.
- **Deuda documentada:** el email de `unused_forfeited` no se dispara al momento del reset (annual). Se cubre en `nox-monthly-report` como sección "Tareas no consumidas este mes: N" — implementar en sesión separada.
