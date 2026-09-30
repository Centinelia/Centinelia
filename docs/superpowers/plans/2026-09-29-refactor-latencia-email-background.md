# Refactor Latencia Email — Background Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los executors con side-effect de email responden al modelo en <2s enqueuando el trabajo pesado (SMTP + IMAP APPEND ~15s) en una tabla nueva `email_send_jobs`; un cron cada 1 min procesa los jobs con retry exponencial + charge deferred + drift detector Nash.

**Architecture:** Executor hace INSERT en `email_send_jobs` (status='pending') y retorna al modelo inmediatamente. Cron `/api/cron/process-email-jobs` picks pending con lock optimista (`UPDATE ... WHERE status='pending' RETURNING`), llama `sendMeerkatHtmlEmail`, en éxito marca done + carga op + actualiza tabla source; en falla retry con backoff exponencial (30s × 2^attempts) hasta max_attempts=5, luego status='failed' + alerta Nash. Feature flag `organizations.email_jobs_enabled` (default false) permite rollout gradual Tortillería → pilotos → global; legacy path inline preservado hasta Fase 4.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres + supabase-js admin client, `sendMeerkatHtmlEmail` existente en `src/lib/email/send-as-agent.ts`, vitest, Supabase Storage para attachments.

**Spec:** `docs/superpowers/specs/2026-09-29-refactor-latencia-email-background-design.md`

## Global Constraints

- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (server-only). Todo I/O usa `createAdminClient()` de `@/lib/supabase/admin`.
- Integration tests con INSERTs reales llaman `assertNotProdOrAllowed()` de `@/lib/test-helpers/prod-guard` en `beforeAll` ([[feedback-smoke-guard-prod-db]]).
- Migrations: nomenclatura `YYYYMMDDHHMMSS_snake_case.sql` en `supabase/migrations/`. Idempotentes (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` es no-op si ya está).
- **RLS obligatorio**: cada `CREATE TABLE` en schema public incluye `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en la MISMA migración ([[feedback-rls-public-tables-default]], PR #82).
- Copy usuario final SIEMPRE en español, sin em-dash, sin "IA" visible, sin tecnicismos ([[feedback-espanol-completo]], [[feedback-no-em-dash]], [[feedback-no-ia-visible]]).
- Toda llamada a Anthropic debe pasar por `logLlmCall` (enforced por `pnpm lint`) — no aplica aquí (no hay llamadas Anthropic).
- `consumeAiOp` es la ÚNICA vía de cobro. Cargos por email se mueven al cron (deferred), NO al executor. Si el job termina en `failed`, NO se cobra ([[feedback-pool-accuracy-top-priority]]).
- Feature flag OFF por default; executor legacy path (send inline) sigue funcionando cuando flag=false.
- Fail-safe: `isEmailJobsEnabled` retorna `false` en cualquier error (org no existe, DB down). Nunca romper por bug del helper.
- Copy al modelo NO cambia. "Registrado. Correo enviado al encargado..." sigue siendo funcionalmente cierto porque el email SÍ sale con delay <60s.

## Review Focus

Cinco failure modes que el spec implica pero ningún test individual ejercita; cada línea tiene test añadido en la task que posee el código.

- **Job stuck en `processing` por crash del cron mid-flight** — otro cron o cron secundario debe poder rescatarlo. Test en Task 7 (`process-email-jobs.test.ts`: setup row en `processing` con `processing_at > 5 min` → cron secundario lo devuelve a `pending`).
- **Concurrent crons picking mismo job** — 2 crons corren simultáneamente, mismo pending → solo 1 procesa. Test en Task 5 (`with-dedup`-style con Promise.all doble UPDATE, uno retorna null).
- **`isEmailJobsEnabled` cache stale** — flag OFF en org pero cache in-memory dice ON → jobs se enqueuan pero cron no los procesa. Test en Task 4 (`enqueue-email.test.ts`: TTL del cache 30s, verificar re-lookup).
- **Job con `agent_id` que fue eliminado** — ON DELETE CASCADE elimina el job, pero si el agent se desactivó entre enqueue y cron pick, `voice_agents` select debe manejar `null` sin crashear. Test en Task 5 (`process-email-jobs.test.ts`: mockFetchAgent → null → job pasa a `failed` con `last_error='agent not found'`, no throw).
- **Charge deferred se pierde (cron cae después de send pero antes de charge)** — pool queda undercharged. Test en Task 6 (mock consumeAiOp throw → job queda done pero log de error; drift detector debe detectarlo con `ratio events/refs`).

---

## File Structure

**Nuevos** (10 archivos):
- `supabase/migrations/20260930000000_email_send_jobs.sql` — tabla + índices + RLS + flag
- `src/lib/email/enqueue-email.ts` — helper con `enqueueEmailJob`, `enqueueEmailJobBatch`, `isEmailJobsEnabled`
- `src/lib/email/__tests__/enqueue-email.test.ts`
- `src/app/api/cron/process-email-jobs/route.ts` — cron worker principal
- `src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
- `src/app/api/cron/cleanup-email-jobs/route.ts` — retention weekly
- `src/lib/monitoring/email-jobs-drift.ts` — Nash detector
- `src/lib/monitoring/__tests__/email-jobs-drift.test.ts`
- `src/lib/tools/dedup/__tests__/tool-coverage.test.ts` (extender existente) — schema drift guard nuevo

**Modificados** (7):
- `src/lib/tools/executors/registrar-incidencia.ts` — bifurcación flag ON/OFF
- `src/lib/tools/executors/registrar-cliente-nuevo.ts` — idem
- `src/app/api/voice/tools/crear-ticket/route.ts` — idem
- `src/app/api/voice/tools/enviar-correo/route.ts` — idem
- `src/app/api/voice/tools/enviar-documento-oficina/route.ts` — idem
- `vercel.json` — 2 crons nuevos (process + cleanup)
- `src/lib/tools/executors/__tests__/registrar-incidencia.test.ts` — regression Tecate v2

Total: ~17 archivos.

---

### Task 1: Migración `email_send_jobs` + feature flag

**Files:**
- Create: `supabase/migrations/20260930000000_email_send_jobs.sql`

**Interfaces:**
- Produces: Tabla `email_send_jobs(id, agent_id, portal_email, to_addr, subject, html, reply_to, from_addr, attachment_url, attachment_name, attachment_mime, source, reference_id, charge_source, charge_label, source_table, source_row_id, status, attempts, max_attempts, next_attempt_at, last_error, provider, provider_meta, created_at, processing_at, delivered_at, failed_at)` con 3 índices + RLS. Columna `organizations.email_jobs_enabled boolean NOT NULL DEFAULT false`.

- [ ] **Step 1: Crear migración**

Contenido de `supabase/migrations/20260930000000_email_send_jobs.sql`:

```sql
-- Refactor latencia email: SMTP+IMAP a background jobs.
-- Ver spec: docs/superpowers/specs/2026-09-29-refactor-latencia-email-background-design.md
-- Motivación: el bug Tortillería/Tecate Six 2026-09-29 tuvo root cause en la
-- latencia ~15s del envío inline (SMTP+IMAP APPEND). Modelo timeout →
-- reinvoca → duplicados. Este table + cron elimina la latencia sync.

CREATE TABLE IF NOT EXISTS email_send_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email      text NOT NULL,

  -- Payload
  to_addr           text NOT NULL,
  subject           text NOT NULL,
  html              text NOT NULL,
  reply_to          text,
  from_addr         text,
  attachment_url    text,
  attachment_name   text,
  attachment_mime   text,

  -- Origen y contabilidad
  source            text NOT NULL,
  reference_id      text,
  charge_source     text,
  charge_label      text,
  source_table      text,
  source_row_id     text,

  -- Ciclo de vida
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts          int  NOT NULL DEFAULT 0,
  max_attempts      int  NOT NULL DEFAULT 5,
  next_attempt_at   timestamptz NOT NULL DEFAULT NOW(),
  last_error        text,
  provider          text,
  provider_meta     jsonb,

  -- Timestamps
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  processing_at     timestamptz,
  delivered_at      timestamptz,
  failed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_pending
  ON email_send_jobs (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_jobs_agent_source
  ON email_send_jobs (agent_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_jobs_stuck
  ON email_send_jobs (created_at)
  WHERE status IN ('pending', 'processing');

-- RLS obligatorio (feedback_rls_public_tables_default, PR #82)
ALTER TABLE email_send_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE email_send_jobs IS
  'Background jobs para envío de email (SMTP+IMAP APPEND). Executors enqueue y responden <2s; cron /api/cron/process-email-jobs procesa con retry exponencial. Ver docs/superpowers/specs/2026-09-29-refactor-latencia-email-background-design.md.';

-- Feature flag org para rollout gradual
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_jobs_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.email_jobs_enabled IS
  'Refactor latencia email (spec 2026-09-29). Cuando true, los tools con side-effect de email encolan en email_send_jobs y responden al modelo <2s. Cuando false, envían inline como legacy. Default false; rollout Tortillería → pilotos → global.';
```

- [ ] **Step 2: Commit (aplicación a prod en Task 11)**

```bash
git add supabase/migrations/20260930000000_email_send_jobs.sql
git commit -m "feat(email-jobs): tabla email_send_jobs + feature flag por org"
```

---

### Task 2: `enqueueEmailJob` — helper single + tests

**Files:**
- Create: `src/lib/email/enqueue-email.ts`
- Test: `src/lib/email/__tests__/enqueue-email.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EnqueueEmailArgs {
    agentId:       string;
    portalEmail:   string;
    to:            string;
    subject:       string;
    html:          string;
    from?:         string;
    replyTo?:      string;
    attachment?:   { url: string; name: string; mime: string };
    source:        string;
    referenceId?:  string;
    chargeSource?: string;
    chargeLabel?:  string;
    sourceTable?:  string;
    sourceRowId?:  string;
  }
  export type EnqueueEmailResult =
    | { ok: true;  job_id: string }
    | { ok: false; error: string };
  export async function enqueueEmailJob(
    args: EnqueueEmailArgs,
    supabase: SupabaseClient,
  ): Promise<EnqueueEmailResult>;
  ```

- [ ] **Step 1: Escribir el test**

Contenido de `src/lib/email/__tests__/enqueue-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueEmailJob } from '../enqueue-email';

const mockInsert = vi.fn();
const mockSupa = {
  from: (table: string) => {
    if (table !== 'email_send_jobs') throw new Error(`unexpected table: ${table}`);
    return {
      insert: (row: unknown) => ({
        select: () => ({
          single: async () => mockInsert(row),
        }),
      }),
    };
  },
} as unknown as Parameters<typeof enqueueEmailJob>[1];

beforeEach(() => {
  mockInsert.mockReset();
});

const baseArgs = {
  agentId:     'agent-1',
  portalEmail: 'org@x.mx',
  to:          'encargado@x.mx',
  subject:     'Nueva queja',
  html:        '<p>hola</p>',
  source:      'incidencia_notif',
};

describe('enqueueEmailJob', () => {
  it('INSERT con payload completo → retorna { ok: true, job_id }', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-1' }, error: null });
    const res = await enqueueEmailJob(baseArgs, mockSupa);
    expect(res).toEqual({ ok: true, job_id: 'job-1' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      agent_id:      'agent-1',
      portal_email:  'org@x.mx',
      to_addr:       'encargado@x.mx',
      subject:       'Nueva queja',
      html:          '<p>hola</p>',
      source:        'incidencia_notif',
      status:        'pending',
    }));
  });

  it('con attachment → INSERT incluye url/name/mime', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-2' }, error: null });
    await enqueueEmailJob({
      ...baseArgs,
      attachment: { url: 'https://x/f.pdf', name: 'f.pdf', mime: 'application/pdf' },
    }, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      attachment_url:  'https://x/f.pdf',
      attachment_name: 'f.pdf',
      attachment_mime: 'application/pdf',
    }));
  });

  it('con source_table + source_row_id → INSERT los incluye', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-3' }, error: null });
    await enqueueEmailJob({
      ...baseArgs,
      sourceTable:  'client_incidents',
      sourceRowId:  'inc-uuid',
    }, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_table:  'client_incidents',
      source_row_id: 'inc-uuid',
    }));
  });

  it('con charge_source + charge_label → INSERT los incluye', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-4' }, error: null });
    await enqueueEmailJob({
      ...baseArgs,
      chargeSource: 'incidencia_notif',
      chargeLabel:  'Aviso de queja al encargado',
    }, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      charge_source: 'incidencia_notif',
      charge_label:  'Aviso de queja al encargado',
    }));
  });

  it('INSERT falla → retorna { ok: false, error }', async () => {
    mockInsert.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await enqueueEmailJob(baseArgs, mockSupa);
    expect(res).toEqual({ ok: false, error: 'db down' });
  });

  it('reply_to y from_addr opcionales → NULL si no se pasan', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'job-5' }, error: null });
    await enqueueEmailJob(baseArgs, mockSupa);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      reply_to:  null,
      from_addr: null,
    }));
  });
});
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npx vitest run src/lib/email/__tests__/enqueue-email.test.ts`
Expected: FAIL — "Cannot find module '../enqueue-email'"

- [ ] **Step 3: Implementar `enqueue-email.ts` (solo `enqueueEmailJob`)**

Contenido de `src/lib/email/enqueue-email.ts`:

```ts
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface EnqueueEmailArgs {
  agentId:       string;
  portalEmail:   string;
  to:            string;
  subject:       string;
  html:          string;
  from?:         string;
  replyTo?:      string;
  attachment?:   { url: string; name: string; mime: string };
  source:        string;
  referenceId?:  string;
  chargeSource?: string;
  chargeLabel?:  string;
  sourceTable?:  string;
  sourceRowId?:  string;
}

export type EnqueueEmailResult =
  | { ok: true;  job_id: string }
  | { ok: false; error: string };

export async function enqueueEmailJob(
  args:     EnqueueEmailArgs,
  supabase: SupabaseClient,
): Promise<EnqueueEmailResult> {
  const row = {
    agent_id:        args.agentId,
    portal_email:    args.portalEmail,
    to_addr:         args.to,
    subject:         args.subject,
    html:            args.html,
    reply_to:        args.replyTo ?? null,
    from_addr:       args.from ?? null,
    attachment_url:  args.attachment?.url ?? null,
    attachment_name: args.attachment?.name ?? null,
    attachment_mime: args.attachment?.mime ?? null,
    source:          args.source,
    reference_id:    args.referenceId ?? null,
    charge_source:   args.chargeSource ?? null,
    charge_label:    args.chargeLabel ?? null,
    source_table:    args.sourceTable ?? null,
    source_row_id:   args.sourceRowId ?? null,
    status:          'pending',
  };

  const { data, error } = await supabase
    .from('email_send_jobs')
    .insert(row)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, job_id: (data as { id: string }).id };
}
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx vitest run src/lib/email/__tests__/enqueue-email.test.ts`
Expected: PASS — 6/6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/enqueue-email.ts src/lib/email/__tests__/enqueue-email.test.ts
git commit -m "feat(email-jobs): enqueueEmailJob helper con payload completo"
```

---

### Task 3: `enqueueEmailJobBatch` — batch INSERT + tests

**Files:**
- Modify: `src/lib/email/enqueue-email.ts` (agregar función)
- Modify: `src/lib/email/__tests__/enqueue-email.test.ts` (agregar tests)

**Interfaces:**
- Consumes: `EnqueueEmailArgs`, `EnqueueEmailResult` de Task 2.
- Produces:
  ```ts
  export async function enqueueEmailJobBatch(
    common:      Omit<EnqueueEmailArgs, 'to'>,
    recipients:  Array<{ to: string }>,
    supabase:    SupabaseClient,
  ): Promise<EnqueueEmailResult[]>;
  ```

- [ ] **Step 1: Añadir tests al archivo existente**

Al final del `describe('enqueueEmailJob', ...)`, añadir:

```ts
describe('enqueueEmailJobBatch', () => {
  const mockBatchInsert = vi.fn();
  const mockBatchSupa = {
    from: () => ({
      insert: (rows: unknown[]) => ({
        select: () => mockBatchInsert(rows),
      }),
    }),
  } as unknown as Parameters<typeof enqueueEmailJobBatch>[2];

  beforeEach(() => {
    mockBatchInsert.mockReset();
  });

  it('N recipients → 1 INSERT batch con N rows', async () => {
    mockBatchInsert.mockResolvedValue({
      data: [{ id: 'job-1' }, { id: 'job-2' }],
      error: null,
    });
    const results = await enqueueEmailJobBatch(
      { agentId: 'a', portalEmail: 'p@x.mx', subject: 's', html: 'h', source: 'x' },
      [{ to: 'a@x.mx' }, { to: 'b@x.mx' }],
      mockBatchSupa,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ ok: true, job_id: 'job-1' });
    expect(results[1]).toEqual({ ok: true, job_id: 'job-2' });
    expect(mockBatchInsert).toHaveBeenCalledOnce();
    const rows = mockBatchInsert.mock.calls[0][0] as Array<{ to_addr: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].to_addr).toBe('a@x.mx');
    expect(rows[1].to_addr).toBe('b@x.mx');
  });

  it('recipients vacío → retorna [] sin INSERT', async () => {
    const results = await enqueueEmailJobBatch(
      { agentId: 'a', portalEmail: 'p@x.mx', subject: 's', html: 'h', source: 'x' },
      [],
      mockBatchSupa,
    );
    expect(results).toEqual([]);
    expect(mockBatchInsert).not.toHaveBeenCalled();
  });

  it('INSERT falla → retorna N × { ok: false } manteniendo alineación con recipients', async () => {
    mockBatchInsert.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const results = await enqueueEmailJobBatch(
      { agentId: 'a', portalEmail: 'p@x.mx', subject: 's', html: 'h', source: 'x' },
      [{ to: 'a@x.mx' }, { to: 'b@x.mx' }],
      mockBatchSupa,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ ok: false, error: 'db down' });
    expect(results[1]).toEqual({ ok: false, error: 'db down' });
  });
});
```

Añadir import al top del test: `import { enqueueEmailJob, enqueueEmailJobBatch } from '../enqueue-email';`

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/lib/email/__tests__/enqueue-email.test.ts`
Expected: FAIL — `enqueueEmailJobBatch is not a function`

- [ ] **Step 3: Implementar `enqueueEmailJobBatch`**

Añadir al final de `src/lib/email/enqueue-email.ts`:

```ts
export async function enqueueEmailJobBatch(
  common:     Omit<EnqueueEmailArgs, 'to'>,
  recipients: Array<{ to: string }>,
  supabase:   SupabaseClient,
): Promise<EnqueueEmailResult[]> {
  if (recipients.length === 0) return [];

  const rows = recipients.map(r => ({
    agent_id:        common.agentId,
    portal_email:    common.portalEmail,
    to_addr:         r.to,
    subject:         common.subject,
    html:            common.html,
    reply_to:        common.replyTo ?? null,
    from_addr:       common.from ?? null,
    attachment_url:  common.attachment?.url ?? null,
    attachment_name: common.attachment?.name ?? null,
    attachment_mime: common.attachment?.mime ?? null,
    source:          common.source,
    reference_id:    common.referenceId ?? null,
    charge_source:   common.chargeSource ?? null,
    charge_label:    common.chargeLabel ?? null,
    source_table:    common.sourceTable ?? null,
    source_row_id:   common.sourceRowId ?? null,
    status:          'pending',
  }));

  const { data, error } = await supabase
    .from('email_send_jobs')
    .insert(rows)
    .select('id');

  if (error) {
    return recipients.map(() => ({ ok: false as const, error: error.message }));
  }
  const inserted = (data ?? []) as Array<{ id: string }>;
  return inserted.map(r => ({ ok: true as const, job_id: r.id }));
}
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/lib/email/__tests__/enqueue-email.test.ts`
Expected: PASS — 9/9 tests green (6 anteriores + 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/enqueue-email.ts src/lib/email/__tests__/enqueue-email.test.ts
git commit -m "feat(email-jobs): enqueueEmailJobBatch para multi-recipient"
```

---

### Task 4: `isEmailJobsEnabled` — flag check con cache 30s

**Files:**
- Modify: `src/lib/email/enqueue-email.ts`
- Modify: `src/lib/email/__tests__/enqueue-email.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function isEmailJobsEnabled(
    portalEmail: string,
    supabase:    SupabaseClient,
  ): Promise<boolean>;
  export function __clearEmailJobsFlagCache(): void;   // test-only
  ```

- [ ] **Step 1: Añadir tests**

Al final del archivo, añadir describe:

```ts
describe('isEmailJobsEnabled', () => {
  const mockFlag = vi.fn();
  const mockSupaFlag = {
    from: (table: string) => {
      if (table !== 'organizations') throw new Error(`unexpected: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => mockFlag(),
          }),
        }),
      };
    },
  } as unknown as Parameters<typeof isEmailJobsEnabled>[1];

  beforeEach(() => {
    mockFlag.mockReset();
    __clearEmailJobsFlagCache();
  });

  it('flag ON en org → retorna true', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    expect(await isEmailJobsEnabled('org@x.mx', mockSupaFlag)).toBe(true);
  });

  it('flag OFF en org → retorna false', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: false }, error: null });
    expect(await isEmailJobsEnabled('org@x.mx', mockSupaFlag)).toBe(false);
  });

  it('org no existe → retorna false (fail-safe)', async () => {
    mockFlag.mockResolvedValue({ data: null, error: null });
    expect(await isEmailJobsEnabled('missing@x.mx', mockSupaFlag)).toBe(false);
  });

  it('DB throw → retorna false (fail-safe)', async () => {
    mockFlag.mockRejectedValue(new Error('db down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await isEmailJobsEnabled('org@x.mx', mockSupaFlag)).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('cache 30s → 2 lookups consecutivos = 1 DB query', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    expect(mockFlag).toHaveBeenCalledOnce();
  });

  it('cache respeta TTL — 31s después re-lookup a DB', async () => {
    vi.useFakeTimers();
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    vi.advanceTimersByTime(31_000);
    await isEmailJobsEnabled('org@x.mx', mockSupaFlag);
    expect(mockFlag).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('cache es por-org — 2 orgs distintos = 2 queries', async () => {
    mockFlag.mockResolvedValue({ data: { email_jobs_enabled: true }, error: null });
    await isEmailJobsEnabled('a@x.mx', mockSupaFlag);
    await isEmailJobsEnabled('b@x.mx', mockSupaFlag);
    expect(mockFlag).toHaveBeenCalledTimes(2);
  });
});
```

Añadir import: `import { enqueueEmailJob, enqueueEmailJobBatch, isEmailJobsEnabled, __clearEmailJobsFlagCache } from '../enqueue-email';`

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/lib/email/__tests__/enqueue-email.test.ts`
Expected: FAIL — `isEmailJobsEnabled is not a function`.

- [ ] **Step 3: Implementar con cache**

Añadir al final de `src/lib/email/enqueue-email.ts`:

```ts
const FLAG_TTL_MS = 30_000;

interface FlagCacheEntry {
  value:      boolean;
  fetchedAt:  number;
}
const flagCache = new Map<string, FlagCacheEntry>();

export function __clearEmailJobsFlagCache(): void {
  flagCache.clear();
}

export async function isEmailJobsEnabled(
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<boolean> {
  const cached = flagCache.get(portalEmail);
  const now = Date.now();
  if (cached && (now - cached.fetchedAt) < FLAG_TTL_MS) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('email_jobs_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    if (error) throw error;
    const value = !!(data as { email_jobs_enabled?: boolean } | null)?.email_jobs_enabled;
    flagCache.set(portalEmail, { value, fetchedAt: now });
    return value;
  } catch (err) {
    console.error('[email-jobs] isEmailJobsEnabled fail-safe:', err);
    return false;
  }
}
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/lib/email/__tests__/enqueue-email.test.ts`
Expected: PASS — 16/16 tests green (9 anteriores + 7 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/enqueue-email.ts src/lib/email/__tests__/enqueue-email.test.ts
git commit -m "feat(email-jobs): isEmailJobsEnabled con cache 30s fail-safe"
```

---

### Task 5: Cron worker — pick + lock + success path

**Files:**
- Create: `src/app/api/cron/process-email-jobs/route.ts`
- Test: `src/app/api/cron/process-email-jobs/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `sendMeerkatHtmlEmail` de `@/lib/email/send-as-agent`, `consumeAiOp` de `@/lib/ai/ops-guard`.
- Produces: `GET /api/cron/process-email-jobs` → `{ ok: true, picked, done, retried, failed, latency_ms }`.

- [ ] **Step 1: Escribir el test (solo success path para arrancar)**

Contenido de `src/app/api/cron/process-email-jobs/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockPending, mockLock, mockUpdate, mockSourceUpdate, mockSend, mockConsume, mockFetchAgent } = vi.hoisted(() => ({
  mockPending:      vi.fn(),
  mockLock:         vi.fn(),
  mockUpdate:       vi.fn(),
  mockSourceUpdate: vi.fn(),
  mockSend:         vi.fn(),
  mockConsume:      vi.fn(),
  mockFetchAgent:   vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'email_send_jobs') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => mockPending(),
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => mockLock(patch),
                }),
              }),
              select: () => ({
                single: async () => mockUpdate(patch),
              }),
            }),
          }),
        };
      }
      if (table === 'voice_agents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => mockFetchAgent(),
            }),
          }),
        };
      }
      // source tables (client_incidents, etc.)
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: async () => mockSourceUpdate(table, patch),
        }),
      };
    },
  }),
}));

vi.mock('@/lib/email/send-as-agent', () => ({
  sendMeerkatHtmlEmail: (args: unknown) => mockSend(args),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: (agentId: string, count: number, meta: unknown) => mockConsume(agentId, count, meta),
}));

beforeEach(() => {
  mockPending.mockReset();
  mockLock.mockReset();
  mockUpdate.mockReset();
  mockSourceUpdate.mockReset();
  mockSend.mockReset();
  mockConsume.mockReset();
  mockFetchAgent.mockReset();
  process.env.CRON_SECRET = 'test-secret';
  mockFetchAgent.mockResolvedValue({ data: { agent_name: 'Nia', business_name: 'Biz', email_from: null, email_domain_verified: false } });
});

function makeReq() {
  return new NextRequest('http://localhost/api/cron/process-email-jobs', {
    method: 'GET',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('process-email-jobs cron', () => {
  it('sin auth → 401', async () => {
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/cron/process-email-jobs', {
      method: 'GET',
    }));
    expect(res.status).toBe(401);
  });

  it('sin pending → picked=0, done=0', async () => {
    mockPending.mockResolvedValue({ data: [], error: null });
    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, picked: 0, done: 0, retried: 0, failed: 0 });
  });

  it('1 pending + send OK → status=done, charge invocada, source_table actualizada', async () => {
    const job = {
      id: 'job-1', agent_id: 'a', portal_email: 'p@x.mx',
      to_addr: 'e@x.mx', subject: 's', html: 'h',
      reply_to: null, from_addr: null,
      attachment_url: null, attachment_name: null, attachment_mime: null,
      source: 'incidencia_notif', reference_id: 'inc-1',
      charge_source: 'incidencia_notif', charge_label: 'Aviso',
      source_table: 'client_incidents', source_row_id: 'inc-1',
      attempts: 0, max_attempts: 5,
    };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend', meta: { message_id: 'x' } });
    mockUpdate.mockResolvedValue({ data: job, error: null });
    mockSourceUpdate.mockResolvedValue({ data: null, error: null });
    mockConsume.mockResolvedValue({ ok: true });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, picked: 1, done: 1, retried: 0, failed: 0 });
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockConsume).toHaveBeenCalledWith('a', 1, expect.objectContaining({
      source:       'incidencia_notif',
      reference_id: 'inc-1',
      label:        'Aviso',
    }));
    expect(mockSourceUpdate).toHaveBeenCalledWith('client_incidents', expect.objectContaining({
      email_sent_at: expect.any(String),
    }));
    // El primer UPDATE (lock) marca processing; el segundo marca done.
    const doneUpdates = mockUpdate.mock.calls.filter(c => (c[0] as { status?: string }).status === 'done');
    expect(doneUpdates).toHaveLength(1);
  });

  it('lock race: otro cron ya tomó → mockLock devuelve null → skip', async () => {
    const job = { id: 'job-1', agent_id: 'a', attempts: 0, max_attempts: 5, source: 'x', charge_source: null, source_table: null, source_row_id: null, portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, reference_id: null, charge_label: null };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ picked: 1, done: 0, retried: 0, failed: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sin charge_source → no llama consumeAiOp aunque send sea OK', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend' });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    await GET(makeReq());

    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('sin source_table → no llama update en tabla source', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend' });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    await GET(makeReq());

    expect(mockSourceUpdate).not.toHaveBeenCalled();
  });

  it('agent_id inválido (eliminado entre enqueue y pick) → send lanza, retry pipeline lo maneja', async () => {
    const job = { id: 'job-1', agent_id: 'ghost', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockFetchAgent.mockResolvedValue({ data: null });   // agent no existe
    // sendMeerkatHtmlEmail sin agent lanza validate error
    mockSend.mockRejectedValue(new Error('agent not found for job'));
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    // No throw, retry pipeline lo captura
    expect(body).toMatchObject({ ok: true, picked: 1, done: 0 });
  });
});
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
Expected: FAIL — "Cannot find module '../route'"

- [ ] **Step 3: Implementar `route.ts` (success path + lock + auth, sin retry aún)**

Contenido de `src/app/api/cron/process-email-jobs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export const dynamic = 'force-dynamic';

interface EmailJob {
  id:              string;
  agent_id:        string;
  portal_email:    string;
  to_addr:         string;
  subject:         string;
  html:            string;
  reply_to:        string | null;
  from_addr:       string | null;
  attachment_url:  string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  source:          string;
  reference_id:    string | null;
  charge_source:   string | null;
  charge_label:    string | null;
  source_table:    string | null;
  source_row_id:   string | null;
  attempts:        number;
  max_attempts:    number;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdminClient();
  const batchSize = 20;

  const { data: pending } = await supabase
    .from('email_send_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(batchSize);

  const jobs = (pending ?? []) as EmailJob[];
  const results = { picked: jobs.length, done: 0, retried: 0, failed: 0 };

  for (const job of jobs) {
    const { data: locked } = await supabase
      .from('email_send_jobs')
      .update({
        status:        'processing',
        processing_at: new Date().toISOString(),
        attempts:      job.attempts + 1,
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select()
      .single();
    if (!locked) continue;   // otro cron ya lo tomó

    try {
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('agent_name, business_name, email_from, email_domain_verified')
        .eq('id', job.agent_id)
        .single();

      const attachment = job.attachment_url
        ? { url: job.attachment_url, name: job.attachment_name ?? 'file', mime: job.attachment_mime ?? 'application/octet-stream' }
        : undefined;

      const sendRes = await sendMeerkatHtmlEmail({
        agentId: job.agent_id,
        to:      job.to_addr,
        subject: job.subject,
        html:    job.html,
        replyTo: job.reply_to ?? undefined,
        from:    job.from_addr ?? undefined,
        attachment: attachment as never,
        agent:   agent as never,
      }, supabase);

      if (!sendRes.ok) throw new Error(`send failed: ${sendRes.error ?? 'unknown'}`);

      await supabase
        .from('email_send_jobs')
        .update({
          status:        'done',
          delivered_at:  new Date().toISOString(),
          provider:      sendRes.provider,
          provider_meta: sendRes.meta ?? null,
        })
        .eq('id', job.id)
        .select()
        .single();

      if (job.charge_source) {
        try {
          await consumeAiOp(job.agent_id, 1, {
            source:       job.charge_source,
            label:        job.charge_label ?? job.charge_source,
            reference_id: job.reference_id ?? undefined,
          });
        } catch (err) {
          console.error('[email-jobs] charge failed (deferred audit gap):', err);
        }
      }

      if (job.source_table && job.source_row_id) {
        await supabase
          .from(job.source_table)
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', job.source_row_id);
      }

      results.done++;
    } catch (err) {
      // Retry logic va en Task 6
      console.error('[email-jobs] job failed (retry en Task 6):', err);
    }
  }

  return NextResponse.json({ ok: true, ...results, latency_ms: Date.now() - started });
}
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
Expected: PASS — 6/6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/process-email-jobs/
git commit -m "feat(email-jobs): cron worker con lock optimista + success path"
```

---

### Task 6: Retry con backoff exponencial + max_attempts

**Files:**
- Modify: `src/app/api/cron/process-email-jobs/route.ts`
- Modify: `src/app/api/cron/process-email-jobs/__tests__/route.test.ts`

**Interfaces:**
- No cambia signature. Extiende catch{} para retry/failed logic.

- [ ] **Step 1: Añadir tests de retry**

Al final del describe, añadir:

```ts
describe('retry logic', () => {
  it('send throw + attempts=0 → status vuelve a pending, attempts=1, next_attempt_at futuro con backoff 30s', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockRejectedValue(new Error('smtp timeout'));
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ picked: 1, done: 0, retried: 1, failed: 0 });
    const retryUpdate = mockUpdate.mock.calls.find(c => (c[0] as { status?: string }).status === 'pending');
    expect(retryUpdate).toBeDefined();
    const patch = retryUpdate![0] as { last_error: string; next_attempt_at: string };
    expect(patch.last_error).toContain('smtp timeout');
    const delay = new Date(patch.next_attempt_at).getTime() - Date.now();
    // Backoff 30s × 2^1 = 60s (attempts es 1 tras lock)
    expect(delay).toBeGreaterThan(55_000);
    expect(delay).toBeLessThan(65_000);
  });

  it('send throw + attempts=4 (5to intento) → status=failed + failed_at', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 4, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 5 }, error: null });
    mockSend.mockRejectedValue(new Error('final fail'));
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ picked: 1, done: 0, retried: 0, failed: 1 });
    const failedUpdate = mockUpdate.mock.calls.find(c => (c[0] as { status?: string }).status === 'failed');
    expect(failedUpdate).toBeDefined();
    const patch = failedUpdate![0] as { failed_at: string; last_error: string };
    expect(patch.failed_at).toBeTruthy();
    expect(patch.last_error).toContain('final fail');
  });

  it('sendMeerkat retorna ok:false → tratado como throw, entra a retry', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: null, charge_source: null, charge_label: null, source_table: null, source_row_id: null, attempts: 1, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 2 }, error: null });
    mockSend.mockResolvedValue({ ok: false, provider: 'none', error: 'SMTP 550' });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ retried: 1 });
    const retry = mockUpdate.mock.calls.find(c => (c[0] as { status?: string }).status === 'pending');
    expect((retry![0] as { last_error: string }).last_error).toContain('SMTP 550');
  });

  it('charge deferred throw NO revierte job.done (audit gap logeado)', async () => {
    const job = { id: 'job-1', agent_id: 'a', portal_email: 'p', to_addr: 't', subject: 's', html: 'h', reply_to: null, from_addr: null, attachment_url: null, attachment_name: null, attachment_mime: null, source: 'x', reference_id: 'ref-1', charge_source: 'notif', charge_label: 'L', source_table: null, source_row_id: null, attempts: 0, max_attempts: 5 };
    mockPending.mockResolvedValue({ data: [job], error: null });
    mockLock.mockResolvedValue({ data: { ...job, attempts: 1 }, error: null });
    mockSend.mockResolvedValue({ ok: true, provider: 'resend' });
    mockUpdate.mockResolvedValue({ data: null, error: null });
    mockConsume.mockRejectedValue(new Error('pool RPC down'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({ done: 1, failed: 0 });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/charge failed/),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Correr — algunos deben fallar**

Run: `npx vitest run src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
Expected: los 4 tests de retry fallan (contador `retried`/`failed` no cambia, no hay UPDATE con `status=pending` ni `status=failed`).

- [ ] **Step 3: Implementar retry en el catch{}**

Reemplazar en `route.ts` el bloque:

```ts
    } catch (err) {
      // Retry logic va en Task 6
      console.error('[email-jobs] job failed (retry en Task 6):', err);
    }
```

con:

```ts
    } catch (err) {
      const attemptsSoFar = (locked as EmailJob).attempts;
      const isFinal = attemptsSoFar >= job.max_attempts;
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Backoff exponencial: 30s × 2^attempts (30s, 60s, 2m, 4m, 8m)
      const delayMs = 30_000 * Math.pow(2, attemptsSoFar);
      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

      await supabase
        .from('email_send_jobs')
        .update({
          status:          isFinal ? 'failed' : 'pending',
          next_attempt_at: nextAttemptAt,
          last_error:      errorMsg,
          failed_at:       isFinal ? new Date().toISOString() : null,
        })
        .eq('id', job.id)
        .select()
        .single();

      if (isFinal) {
        results.failed++;
        console.error('[email-jobs] job max_attempts reached:', { job_id: job.id, error: errorMsg });
      } else {
        results.retried++;
        console.warn('[email-jobs] job retry:', { job_id: job.id, attempt: attemptsSoFar, next_attempt_at: nextAttemptAt, error: errorMsg });
      }
    }
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
Expected: PASS — 10/10 tests green (6 anteriores + 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/process-email-jobs/
git commit -m "feat(email-jobs): retry con backoff exponencial + max_attempts=5"
```

---

### Task 7: Cron rescate `processing` stuck > 5 min

**Files:**
- Modify: `src/app/api/cron/process-email-jobs/route.ts`
- Modify: `src/app/api/cron/process-email-jobs/__tests__/route.test.ts`

**Interfaces:**
- No cambia. Antes de pick pending, hace SWEEP de `processing` viejos.

- [ ] **Step 1: Añadir test**

En el mismo test file, añadir dentro de `describe('process-email-jobs cron', ...)`:

```ts
  it('processing stuck > 5 min → devuelto a pending antes de pick nuevos', async () => {
    // El cron ejecuta 2 queries: primero un UPDATE que rescata stuck,
    // luego el SELECT de pending. El mock actual no distingue las 2
    // llamadas — extendemos el mock para trackear ambas.
    const mockRescue = vi.fn().mockResolvedValue({ data: [{ id: 'stuck-1' }], error: null });
    // Sobreescribimos el from de email_send_jobs solo para esta test para
    // añadir el UPDATE-rescue path
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === 'email_send_jobs') {
            return {
              select: () => ({
                eq: () => ({
                  lte: () => ({
                    order: () => ({ limit: async () => mockPending() }),
                  }),
                }),
              }),
              update: (patch: Record<string, unknown>) => ({
                eq: (col: string, val: string) => {
                  // Si el UPDATE lleva status='pending' + lt(processing_at, ...) es el rescue
                  if (patch.status === 'pending' && col === 'status' && val === 'processing') {
                    return {
                      lt: () => ({
                        select: async () => mockRescue(),
                      }),
                    };
                  }
                  return {
                    eq: () => ({
                      select: () => ({ single: async () => mockLock(patch) }),
                    }),
                    select: () => ({ single: async () => mockUpdate(patch) }),
                  };
                },
              }),
            };
          }
          return { update: () => ({ eq: async () => mockSourceUpdate(table) }) };
        },
      }),
    }));
    vi.resetModules();
    mockPending.mockResolvedValue({ data: [], error: null });

    const { GET } = await import('../route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(mockRescue).toHaveBeenCalled();
    expect(body).toMatchObject({ ok: true, rescued: 1 });
  });
```

Y ajustar el `describe` de retry para no romper si el archivo se re-mockea. La forma simple: mover el test de rescue a un `describe` separado con `beforeEach(() => vi.resetModules())`.

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
Expected: FAIL — `rescued` es undefined en el response.

- [ ] **Step 3: Añadir rescue al inicio del handler**

Al inicio del `GET(...)`, después de la validación de auth y ANTES del SELECT pending, añadir:

```ts
  // Rescate: jobs stuck en 'processing' > 5 min (crash del cron mid-flight).
  // UPDATE los devuelve a pending para que el siguiente ciclo los reintente.
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: rescued } = await supabase
    .from('email_send_jobs')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('processing_at', stuckCutoff)
    .select('id');
  const rescuedCount = rescued?.length ?? 0;
  if (rescuedCount > 0) {
    console.warn('[email-jobs] rescued stuck processing jobs:', rescuedCount);
  }
```

Y en el return del handler, agregar `rescued: rescuedCount`:

```ts
  return NextResponse.json({ ok: true, ...results, rescued: rescuedCount, latency_ms: Date.now() - started });
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
Expected: PASS — 11/11 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/process-email-jobs/
git commit -m "feat(email-jobs): rescate de processing stuck > 5 min"
```

---

### Task 8: Envolver `registrar_incidencia` executor + regression Tecate v2

**Files:**
- Modify: `src/lib/tools/executors/registrar-incidencia.ts`
- Modify: `src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`

**Interfaces:**
- Consumes: `isEmailJobsEnabled`, `enqueueEmailJobBatch` (Task 4, 3).

- [ ] **Step 1: Añadir test regression Tecate v2**

Al final de `src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`, dentro del `describe('registrarIncidencia', ...)`, añadir:

```ts
  describe('email_jobs feature flag ON', () => {
    it('enqueue en vez de sendMeerkatHtmlEmail inline (regression Tecate v2)', async () => {
      // Mock adicional del helper
      vi.doMock('../../../email/enqueue-email', () => ({
        enqueueEmailJobBatch: vi.fn(() => Promise.resolve([
          { ok: true, job_id: 'job-1' },
          { ok: true, job_id: 'job-2' },
        ])),
        isEmailJobsEnabled: vi.fn(() => Promise.resolve(true)),
      }));
      vi.resetModules();

      const { registrarIncidencia: fnJobs } = await import('../registrar-incidencia');
      const { enqueueEmailJobBatch } = await import('../../../email/enqueue-email');

      const ctx = makeCtx();
      // 2 recipients configurados
      ctx.org.directory = [
        { id: 'p1', name: 'A', phone: '+5281', email: 'a@x.mx', receives_incident_reports: true },
        { id: 'p2', name: 'B', phone: '+5282', email: 'b@x.mx', receives_incident_reports: true },
      ];

      const started = Date.now();
      const res = await fnJobs(ctx as any, {
        business_name: 'Tecate Six', contact_phone: '8129262462',
        address: 'Y', motivo: 'Ya tiene unos días',
      });
      const elapsed = Date.now() - started;

      expect(res.ok).toBe(true);
      expect(res.email_sent).toBe(true);   // sigue diciendo true — el email va a salir
      expect(enqueueEmailJobBatch).toHaveBeenCalledOnce();
      // sendMeerkatHtmlEmail NO debe llamarse en el path jobs
      expect(sendMeerkatHtmlEmail).not.toHaveBeenCalled();
      // El executor devuelve <500ms (el mock es sync pero validamos que no bloquea)
      expect(elapsed).toBeLessThan(500);
    });

    it('flag ON pero sin recipients → NO enqueue, email_sent=false', async () => {
      vi.doMock('../../../email/enqueue-email', () => ({
        enqueueEmailJobBatch: vi.fn(() => Promise.resolve([])),
        isEmailJobsEnabled:   vi.fn(() => Promise.resolve(true)),
      }));
      vi.resetModules();
      const { registrarIncidencia: fnJobs } = await import('../registrar-incidencia');
      const { enqueueEmailJobBatch } = await import('../../../email/enqueue-email');

      const ctx = makeCtx();
      ctx.org.directory = [];   // sin encargados

      const res = await fnJobs(ctx as any, {
        business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
      });

      expect(res.ok).toBe(true);
      expect(res.email_sent).toBe(false);
      expect(enqueueEmailJobBatch).not.toHaveBeenCalled();
    });

    it('flag ON: cobro base sí ocurre (incident_registered), pero NO se cobra incidencia_notif inline', async () => {
      vi.doMock('../../../email/enqueue-email', () => ({
        enqueueEmailJobBatch: vi.fn(() => Promise.resolve([{ ok: true, job_id: 'j1' }])),
        isEmailJobsEnabled:   vi.fn(() => Promise.resolve(true)),
      }));
      vi.resetModules();
      const { registrarIncidencia: fnJobs } = await import('../registrar-incidencia');

      const ctx = makeCtx();
      await fnJobs(ctx as any, {
        business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
      });

      const calls = (consumeAiOp as any).mock.calls;
      const sources = calls.map((c: any[]) => c[2]?.source);
      expect(sources).toContain('incident_registered');
      // El cargo de incidencia_notif ahora lo hace el cron, NO el executor
      expect(sources).not.toContain('incidencia_notif');
    });
  });
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`
Expected: FAIL — el executor sigue haciendo sendMeerkatHtmlEmail inline.

- [ ] **Step 3: Modificar `registrar-incidencia.ts` con la bifurcación**

En `src/lib/tools/executors/registrar-incidencia.ts`, después del cargo base `incident_registered` y antes del loop de `sendMeerkatHtmlEmail`, añadir la bifurcación:

Reemplazar el bloque:

```ts
  let sentCount = 0;
  if (recipients.length > 0) {
    const { subject, html } = renderIncidentCardEmail({ ... });
    for (const recipient of recipients) {
      try {
        const sendRes = await sendMeerkatHtmlEmail({ ... }, ctx.supabase);
        if (sendRes.ok) sentCount += 1;
        else console.warn(...);
      } catch (err) { ... }
    }
    if (sentCount > 0) {
      try { await consumeAiOp(ctx.agent.id, sentCount, { source: 'incidencia_notif', ... }); }
      catch (err) { console.error(...); }
      await ctx.supabase.from('client_incidents').update({ email_sent_at: ... }).eq('id', incidentId);
    }
  }
  const emailSent = sentCount > 0;
```

con:

```ts
  const useJobs = recipients.length > 0
    ? await isEmailJobsEnabled(ctx.agent.portal_email, ctx.supabase)
    : false;

  let emailSent = false;
  if (useJobs && recipients.length > 0) {
    const { subject, html } = renderIncidentCardEmail({
      businessName:     args.business_name,
      sucursal:         args.sucursal ?? null,
      contactName:      args.contact_name ?? null,
      contactPhone:     phone,
      address:          args.address,
      motivo:           args.motivo,
      capturedAt:       now,
      agentDisplayName: `${ctx.agent.agent_name} · ${ctx.agent.business_name ?? ''}`.trim(),
    });
    const enqueueResults = await enqueueEmailJobBatch(
      {
        agentId:      ctx.agent.id,
        portalEmail:  ctx.agent.portal_email,
        subject,
        html,
        source:       'incidencia_notif',
        referenceId:  incidentId,
        chargeSource: 'incidencia_notif',
        chargeLabel:  'Aviso de queja al encargado por correo',
        sourceTable:  'client_incidents',
        sourceRowId:  incidentId,
      },
      recipients.map(r => ({ to: r.email })),
      ctx.supabase,
    );
    emailSent = enqueueResults.some(r => r.ok);
  } else if (recipients.length > 0) {
    // LEGACY inline path (código actual sin cambios — copiar del bloque original)
    let sentCount = 0;
    const { subject, html } = renderIncidentCardEmail({
      businessName:     args.business_name,
      sucursal:         args.sucursal ?? null,
      contactName:      args.contact_name ?? null,
      contactPhone:     phone,
      address:          args.address,
      motivo:           args.motivo,
      capturedAt:       now,
      agentDisplayName: `${ctx.agent.agent_name} · ${ctx.agent.business_name ?? ''}`.trim(),
    });
    for (const recipient of recipients) {
      try {
        const sendRes = await sendMeerkatHtmlEmail({
          agentId: ctx.agent.id,
          to:      recipient.email,
          subject,
          html,
          agent: {
            agent_name:            ctx.agent.agent_name,
            business_name:         ctx.agent.business_name,
            email_from:            ctx.agent.email_from,
            email_domain_verified: ctx.agent.email_domain_verified,
          },
        }, ctx.supabase);
        if (sendRes.ok) sentCount += 1;
        else console.warn(`registrar_incidencia email a ${recipient.email} failed silently:`, sendRes.error);
      } catch (err) {
        console.error(`registrar_incidencia sendMeerkatHtmlEmail a ${recipient.email} threw:`, err);
      }
    }
    if (sentCount > 0) {
      try {
        await consumeAiOp(ctx.agent.id, sentCount, {
          source: 'incidencia_notif',
          label:  sentCount > 1
            ? `Aviso de queja al encargado por correo (${sentCount} recipients)`
            : 'Aviso de queja al encargado por correo',
          reference_id: incidentId,
        });
      } catch (err) {
        console.error(`registrar_incidencia consumeAiOp(${sentCount}) failed silently:`, err);
      }
      await ctx.supabase.from('client_incidents')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', incidentId);
    }
    emailSent = sentCount > 0;
  }
```

Añadir imports al top:
```ts
import { enqueueEmailJobBatch, isEmailJobsEnabled } from '../../email/enqueue-email';
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`
Expected: PASS — todos los tests verdes (los legacy siguen porque flag OFF por default en el mock; los 3 nuevos con flag ON pasan).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executors/registrar-incidencia.ts src/lib/tools/executors/__tests__/registrar-incidencia.test.ts
git commit -m "feat(email-jobs): bifurcación flag en registrar_incidencia + regression Tecate v2"
```

---

### Task 9: Envolver `registrar_cliente_nuevo` + `crear-ticket` + `enviar-correo` + `enviar-documento-oficina`

**Files:**
- Modify: `src/lib/tools/executors/registrar-cliente-nuevo.ts`
- Modify: `src/app/api/voice/tools/crear-ticket/route.ts`
- Modify: `src/app/api/voice/tools/enviar-correo/route.ts`
- Modify: `src/app/api/voice/tools/enviar-documento-oficina/route.ts`

**Interfaces:** Idem Task 8.

Cada uno sigue el patrón de Task 8 adaptado a su shape. Este task carga todos juntos porque son mecánicos y comparten el patrón: fetch agent con portal_email → si tiene `email_jobs_enabled` ON, encolar con `enqueueEmailJob` (single) o `enqueueEmailJobBatch` (multi-recipient); si OFF, path legacy inline sin cambios.

**Antes de cada aplicación**: leer el archivo completo con `Read`, identificar dónde vive el `sendEmail` / `sendMeerkatHtmlEmail` actual, envolver con la bifurcación preservando exactamente el legacy path bajo el `else`.

**Mapping detallado por tool** (para poblar los args de `enqueueEmailJob`):

| Tool | source | charge_source | charge_label | source_table | source_row_id |
|------|--------|---------------|--------------|--------------|---------------|
| `registrar-cliente-nuevo` | `cliente_nuevo_notif` | `cliente_nuevo_notif` | `'Aviso de alta al encargado'` | `'client_incidents'` | `incidentId` |
| `crear-ticket` | `ticket_email_notify` | `ticket_email_notify` | `'Correo de ticket al encargado'` | `'helpdesk_tickets'` | `folio` |
| `enviar-correo` | `enviar_correo` | `enviar_correo` | `'Envío de correo'` | `null` | `null` |
| `enviar-documento-oficina` | `enviar_doc` | `enviar_doc` | `'Envío de documento oficial'` | `null` | `null` |

- [ ] **Step 1: Escribir test de coverage estático**

Añadir a `src/lib/tools/dedup/__tests__/tool-coverage.test.ts` (extendiendo el existente):

```ts
describe('email jobs coverage', () => {
  const TOOLS_WITH_EMAIL = [
    'registrar-cliente-nuevo',
    'crear-ticket',
    'enviar-correo',
    'enviar-documento-oficina',
  ];
  for (const tool of TOOLS_WITH_EMAIL) {
    it(`${tool} tiene bifurcación isEmailJobsEnabled → enqueueEmailJob`, () => {
      // 3 lugares: routes/route.ts, executors/*.ts
      const candidates = [
        path.join(ROOT, 'src', 'app', 'api', 'voice', 'tools', tool, 'route.ts'),
        path.join(ROOT, 'src', 'lib', 'tools', 'executors', `${tool}.ts`),
      ];
      const found = candidates.filter(p => existsSync(p));
      expect(found.length, `${tool} debe existir en al menos un lugar`).toBeGreaterThan(0);
      const src = found.map(p => readFileSync(p, 'utf8')).join('\n');
      expect(src, `${tool} debe importar isEmailJobsEnabled`).toMatch(/isEmailJobsEnabled/);
      expect(src, `${tool} debe llamar enqueueEmailJob o enqueueEmailJobBatch`).toMatch(/enqueueEmailJob(Batch)?\s*\(/);
    });
  }

  // registrar-incidencia ya cubierto en Task 8 pero aseguramos
  it('registrar-incidencia executor tiene bifurcación', () => {
    const p = path.join(ROOT, 'src', 'lib', 'tools', 'executors', 'registrar-incidencia.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toMatch(/isEmailJobsEnabled/);
    expect(src).toMatch(/enqueueEmailJobBatch\s*\(/);
  });
});
```

- [ ] **Step 2: Correr — 4 tests deben fallar**

Run: `npx vitest run src/lib/tools/dedup/__tests__/tool-coverage.test.ts`
Expected: 4 FAIL (los 4 executors que aún no tienen la bifurcación).

- [ ] **Step 3: Aplicar bifurcación en `registrar-cliente-nuevo.ts`**

Patrón: mismo que Task 8. Después del cargo base y antes del loop email, checar flag, si ON enqueue batch con:
- `source: 'cliente_nuevo_notif'`
- `chargeSource: 'cliente_nuevo_notif'`
- `chargeLabel: 'Aviso de alta al encargado'`
- `sourceTable: 'client_incidents'` (usa la misma tabla, `type='alta'`)
- `sourceRowId: incidentId`

Y preservar el legacy path completo bajo el `else`. Añadir imports.

- [ ] **Step 4: Aplicar bifurcación en `crear-ticket/route.ts`**

El `sendEmail` del owner (líneas ~144-157 del route). Envolver con:
```ts
const useJobs = ownerEmail && portalToken
  ? await isEmailJobsEnabled(agent.portal_email as string, supabase)
  : false;
if (useJobs && ownerEmail && portalToken) {
  await enqueueEmailJob({
    agentId: agentId,
    portalEmail: agent.portal_email as string,
    to: ownerEmail,
    subject: `[Ticket ${folio}] ${titulo} — ${prioridad.toUpperCase()}`,
    html: ticketEmailHtml({ ... }),
    source: 'ticket_email_notify',
    referenceId: folio,
    chargeSource: 'ticket_email_notify',
    chargeLabel: 'Correo de ticket al encargado',
    sourceTable: 'helpdesk_tickets',
    sourceRowId: folio,
  }, supabase);
} else if (ownerEmail && portalToken) {
  // Legacy inline (código actual sin cambios)
  sendEmail({ ... }).then(async ok => {
    if (ok) await consumeAiOp(agentId, 1, { source: 'ticket_email_notify', ... });
  });
}
```

- [ ] **Step 5: Aplicar bifurcación en `enviar-correo/route.ts`**

El core del handler es un envío de email. Similar bifurcación al inicio del path exitoso.

- [ ] **Step 6: Aplicar bifurcación en `enviar-documento-oficina/route.ts`**

Similar, con `source: 'enviar_doc'`.

- [ ] **Step 7: Correr todos los tests para asegurar no-regresión**

Run: `npx vitest run src/lib/tools/dedup/__tests__/tool-coverage.test.ts src/lib/tools/executors/__tests__/ src/app/api/voice/tools/`
Expected: TODOS los tests verdes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tools/executors/registrar-cliente-nuevo.ts \
        src/app/api/voice/tools/crear-ticket/route.ts \
        src/app/api/voice/tools/enviar-correo/route.ts \
        src/app/api/voice/tools/enviar-documento-oficina/route.ts \
        src/lib/tools/dedup/__tests__/tool-coverage.test.ts
git commit -m "feat(email-jobs): bifurcación flag en 4 executors restantes + drift guard"
```

---

### Task 10: Cleanup cron + Vercel schedule

**Files:**
- Create: `src/app/api/cron/cleanup-email-jobs/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces: `GET /api/cron/cleanup-email-jobs` → borra done >30 días + failed/dead >90 días.

- [ ] **Step 1: Crear cleanup route**

Contenido:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const doneCutoff   = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const failedCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { count: doneDeleted } = await supabase
    .from('email_send_jobs')
    .delete({ count: 'exact' })
    .eq('status', 'done')
    .lt('delivered_at', doneCutoff);

  const { count: failedDeleted } = await supabase
    .from('email_send_jobs')
    .delete({ count: 'exact' })
    .in('status', ['failed', 'dead'])
    .lt('failed_at', failedCutoff);

  console.log('[email-jobs-cleanup] deleted:', { done: doneDeleted, failed: failedDeleted });
  return NextResponse.json({ ok: true, done_deleted: doneDeleted ?? 0, failed_deleted: failedDeleted ?? 0 });
}
```

- [ ] **Step 2: Añadir 2 crons a `vercel.json`**

Añadir al array `crons`:

```json
{
  "path": "/api/cron/process-email-jobs",
  "schedule": "* * * * *"
},
{
  "path": "/api/cron/cleanup-email-jobs",
  "schedule": "0 3 * * 0"
}
```

- [ ] **Step 3: Verificar tests no rotos**

Run: `npx vitest run src/app/api/cron/`
Expected: existing pass, new route no tiene test dedicado (trivial).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/cleanup-email-jobs/ vercel.json
git commit -m "feat(email-jobs): cleanup cron weekly + schedule cada 1 min"
```

---

### Task 11: Nash drift detector `email-jobs-drift`

**Files:**
- Create: `src/lib/monitoring/email-jobs-drift.ts`
- Test: `src/lib/monitoring/__tests__/email-jobs-drift.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EmailJobAnomalyType = 'stuck' | 'failure_spike';
  export interface EmailJobAnomaly {
    portal_email: string;
    type:         EmailJobAnomalyType;
    detail:       string;
    count:        number;
  }
  export async function detectEmailJobsAnomalies(
    supabase: SupabaseClient,
    portalEmail: string,
  ): Promise<EmailJobAnomaly[]>;
  ```

- [ ] **Step 1: Escribir tests**

Contenido de `src/lib/monitoring/__tests__/email-jobs-drift.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { detectEmailJobsAnomalies } from '../email-jobs-drift';

function mockSupa(counts: { stuck: number; failed: number; total: number }) {
  let callIdx = 0;
  const chain = {
    select: () => chain,
    eq:     () => chain,
    in:     () => chain,
    gte:    () => chain,
    lt:     () => chain,
    then:   (resolve: (v: unknown) => void) => {
      const seq = [
        // 1. agents fetch
        [{ id: 'a1' }],
        // 2. stuck count
        counts.stuck,
        // 3. agents fetch again
        [{ id: 'a1' }],
        // 4. failed count
        counts.failed,
        // 5. agents fetch again
        [{ id: 'a1' }],
        // 6. total count
        counts.total,
      ];
      const v = seq[callIdx++];
      resolve(Array.isArray(v)
        ? { data: v, count: null, error: null }
        : { data: [], count: v, error: null });
    },
  };
  return { from: () => chain } as unknown as Parameters<typeof detectEmailJobsAnomalies>[0];
}

describe('detectEmailJobsAnomalies', () => {
  it('sin jobs stuck ni failed → array vacío', async () => {
    const supa = mockSupa({ stuck: 0, failed: 0, total: 50 });
    expect(await detectEmailJobsAnomalies(supa, 'x@y.mx')).toEqual([]);
  });

  it('3+ jobs stuck > 10 min → anomaly type=stuck', async () => {
    const supa = mockSupa({ stuck: 5, failed: 0, total: 50 });
    const anomalies = await detectEmailJobsAnomalies(supa, 'x@y.mx');
    expect(anomalies).toContainEqual(expect.objectContaining({
      type: 'stuck', count: 5,
    }));
  });

  it('failure rate > 20% con total >= 5 → anomaly type=failure_spike', async () => {
    const supa = mockSupa({ stuck: 0, failed: 3, total: 10 });   // 30% failure
    const anomalies = await detectEmailJobsAnomalies(supa, 'x@y.mx');
    expect(anomalies).toContainEqual(expect.objectContaining({
      type: 'failure_spike',
    }));
  });

  it('failure rate > 20% pero total < 5 → NO anomaly (muestra chica)', async () => {
    const supa = mockSupa({ stuck: 0, failed: 2, total: 4 });   // 50% pero solo 4 totales
    const anomalies = await detectEmailJobsAnomalies(supa, 'x@y.mx');
    expect(anomalies.find(a => a.type === 'failure_spike')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr — falla**

Run: `npx vitest run src/lib/monitoring/__tests__/email-jobs-drift.test.ts`
Expected: FAIL — `Cannot find module '../email-jobs-drift'`

- [ ] **Step 3: Implementar detector**

Contenido de `src/lib/monitoring/email-jobs-drift.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export const STUCK_THRESHOLD_MIN = 10;
export const STUCK_MIN_COUNT     = 3;
export const FAILURE_RATE_THRESHOLD = 0.20;
export const FAILURE_MIN_TOTAL   = 5;

export type EmailJobAnomalyType = 'stuck' | 'failure_spike';

export interface EmailJobAnomaly {
  portal_email: string;
  type:         EmailJobAnomalyType;
  detail:       string;
  count:        number;
}

async function agentIds(supabase: SupabaseClient, portalEmail: string): Promise<string[]> {
  const { data } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail);
  return ((data as Array<{ id: string }> | null) ?? []).map(a => a.id);
}

export async function detectEmailJobsAnomalies(
  supabase:    SupabaseClient,
  portalEmail: string,
): Promise<EmailJobAnomaly[]> {
  const anomalies: EmailJobAnomaly[] = [];
  const nowMs = Date.now();
  const stuckCutoff = new Date(nowMs - STUCK_THRESHOLD_MIN * 60_000).toISOString();
  const hourAgo     = new Date(nowMs - 60 * 60_000).toISOString();

  // 1. Stuck (pending o processing con created_at antiguo)
  const ids1 = await agentIds(supabase, portalEmail);
  const { count: stuckCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', ids1)
    .in('status', ['pending', 'processing'])
    .lt('created_at', stuckCutoff);

  if ((stuckCount ?? 0) >= STUCK_MIN_COUNT) {
    anomalies.push({
      portal_email: portalEmail,
      type:         'stuck',
      detail:       `${stuckCount} jobs pending/processing con >${STUCK_THRESHOLD_MIN} min`,
      count:        stuckCount ?? 0,
    });
  }

  // 2. Failure spike (failed última hora / total última hora)
  const ids2 = await agentIds(supabase, portalEmail);
  const { count: failedCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', ids2)
    .eq('status', 'failed')
    .gte('failed_at', hourAgo);

  const ids3 = await agentIds(supabase, portalEmail);
  const { count: totalCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', ids3)
    .gte('created_at', hourAgo);

  const total = totalCount ?? 0;
  const failed = failedCount ?? 0;
  if (total >= FAILURE_MIN_TOTAL && (failed / total) > FAILURE_RATE_THRESHOLD) {
    anomalies.push({
      portal_email: portalEmail,
      type:         'failure_spike',
      detail:       `${failed}/${total} jobs failed última hora (${Math.round(failed/total*100)}%)`,
      count:        failed,
    });
  }

  return anomalies;
}
```

- [ ] **Step 4: Correr — debe pasar**

Run: `npx vitest run src/lib/monitoring/__tests__/email-jobs-drift.test.ts`
Expected: PASS — 4/4 green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/email-jobs-drift.ts src/lib/monitoring/__tests__/email-jobs-drift.test.ts
git commit -m "feat(email-jobs): Nash drift detector stuck + failure_spike"
```

---

### Task 12: Aplicar migración a prod + habilitar Tortillería (Fase 1)

**Files:** No code, ops-only.

**REQUIRE user authorization explícita antes de este task.** Toca prod DB.

- [ ] **Step 1: Verificar migration list contra remoto**

Run: `cd C:/Users/Nazre/centinelia && npx supabase migration list 2>&1 | tail -5`
Expected: mi migración `20260930000000` aparece como local sin remote.

- [ ] **Step 2: Dry-run**

Run: `npx supabase db push --dry-run 2>&1 | tail -5`
Expected: lista `20260930000000_email_send_jobs.sql` pending.

- [ ] **Step 3: Aplicar a prod**

Run: `npx supabase db push`
Expected: `Finished supabase db push.`

- [ ] **Step 4: Habilitar flag en Tortillería (one-shot script)**

```ts
// scripts/enable-email-jobs-tortilleria.ts
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenvConfig({ path: '.env.local' });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

async function main() {
  const { error } = await supa.from('organizations')
    .update({ email_jobs_enabled: true })
    .eq('portal_email', PORTAL);
  if (error) throw error;
  const { data } = await supa.from('organizations')
    .select('portal_email, email_jobs_enabled')
    .eq('portal_email', PORTAL).single();
  console.log('post-update:', data);
}
main().catch(e => { console.error(e); process.exit(1); });
```

Run: `TEST_ALLOW_PROD=true npx tsx scripts/enable-email-jobs-tortilleria.ts`
Expected: `post-update: { portal_email: '...', email_jobs_enabled: true }`

- [ ] **Step 5: Smoke test end-to-end**

Contenido de `scripts/smoke-email-jobs-tortilleria.ts`:

```ts
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenvConfig({ path: '.env.local' });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const NELIA_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL   = 'servicioalcliente@tortillasestrella.com.mx';
const TEST_TO  = 'nazre20@gmail.com';   // ver [[feedback-no-tests-a-clientes]]

async function main() {
  console.log('1. INSERT job de test');
  const { data: job, error: insErr } = await supa.from('email_send_jobs').insert({
    agent_id:     NELIA_ID,
    portal_email: PORTAL,
    to_addr:      TEST_TO,
    subject:      'Smoke test email-jobs — descartar',
    html:         '<p>Test del middleware de background jobs. Cerrar sin acción.</p>',
    source:       'smoke_test',
    reference_id: `smoke-${Date.now()}`,
    charge_source: null,
    charge_label:  null,
    source_table:  null,
    source_row_id: null,
  }).select('id').single();
  if (insErr) throw insErr;
  const jobId = (job as { id: string }).id;
  console.log('  job_id:', jobId);

  console.log('2. Trigger cron manual via API');
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/api/cron/process-email-jobs`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const body = await res.json();
  console.log('  cron response:', body);

  console.log('3. Verificar status');
  const { data: after } = await supa.from('email_send_jobs')
    .select('status, delivered_at, last_error, provider')
    .eq('id', jobId)
    .single();
  console.log('  final:', after);
  const pass = (after as { status: string })?.status === 'done';
  console.log(`  ${pass ? 'PASS' : 'FAIL'}`);

  console.log('4. Cleanup');
  await supa.from('email_send_jobs').delete().eq('id', jobId);
  console.log('  eliminado');
}
main().catch(e => { console.error(e); process.exit(1); });
```

Run: `TEST_ALLOW_PROD=true npx tsx scripts/smoke-email-jobs-tortilleria.ts`
Expected: cron devuelve `{ picked: 1, done: 1 }`, status final = `done`, correo real llega a nazre20@gmail.com.

- [ ] **Step 6: Borrar scripts one-shot**

Run: `rm scripts/enable-email-jobs-tortilleria.ts scripts/smoke-email-jobs-tortilleria.ts`

- [ ] **Step 7: Commit + push + PR**

```bash
git push -u origin design/email-jobs-background
gh pr create --title "feat(email-jobs): refactor latencia SMTP+IMAP a background" --body "..."
```

Fases 2-4 del rollout no forman parte de este plan (ver spec §8). Se ejecutan en sesiones separadas post-Fase 1 con evidencia real.

---

## Fuera de scope

- Portal admin view (`/admin/email-jobs`) — Fase 3 rollout, spec §9.2.
- Remoción del código legacy inline en executors — Fase 4, spec §8.
- WhatsApp Twilio / calendar OAuth / PDF Puppeteer — specs propios.
- `agendar-cita` WA queue — no incluido (latencia crítica es calendar OAuth, no email).
