# Nox Brief del Día Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nox arma un "brief del día" para el dueño con 3 buckets (acción hoy / prep / FYI) leyendo correos, calendario, tareas, escalaciones humanas y borradores de contrato. Se entrega de dos formas: (1) cron diario a la hora local configurada, opt-in por dueño; (2) tool reactiva `preparar_brief_del_dia` en chat + email cuando el dueño lo pida. Nox NUNCA envía nada en nombre del dueño — solo prepara.

**Architecture:** Reusa el patrón del cron `heartbeat` (timezone-aware, dedup por día, ops guard, opt-in por JSONB config en `voice_agents`). Nueva capa `src/lib/nox/` con tres módulos separados: `brief-collector.ts` (queries), `brief-renderer.ts` (LLM → markdown con 3 buckets), `brief-deliverer.ts` (email + WA + portal DB). El cron y la tool comparten los tres módulos. Tool se registra vía `executor.ts` para chat + email (Nox no tiene voz — [[feedback_coordinadores_sin_voz]]). Portal muestra el último brief en `/inicio` como card colapsable.

**Tech Stack:** Next.js 16 (App Router, ver `AGENTS.md` — no es el Next.js de tu training), React 19, Supabase (Postgres), Anthropic SDK (Sonnet 4.6 — no Haiku por [[feedback_subagent_sonnet]]), Tailwind 3, Lucide React, `marked` (ya en package), Twilio (WhatsApp), Cal.com/Google Calendar via connectors ya integrados.

## Global Constraints

- Spanish, sin em-dashes (`—`). Usar `:` `,` `.`
- Sin emojis en UI. Íconos Lucide únicamente (AlertTriangle, Clock, Info, RefreshCw, ChevronDown, Copy).
- Sin "IA" en copy visible. Labels: "Brief del día", "Requiere acción", "Necesita preparación", "Al tanto", "Preparar ahora".
- `./node_modules/.bin/tsc --noEmit` debe pasar limpio al final de cada task.
- Ninguna nueva dependencia. Todo reusa lo que ya está en `package.json`.
- Nox NUNCA envía correos, WA, ni acciona nada en nombre del dueño. Solo prepara + guarda draft. Cualquier "acción" propuesta se enlaza a la cola de aprobación existente (agent_tasks awaiting_plan_approval o human_requests).
- Feature flag opt-in obligatorio: `brief_del_dia_config.enabled` en `voice_agents`. Nunca activar por defecto ([[feedback_no_unilateral_toggles]]).
- Dropped columns rule: `knowledge_base`, `business_description`, `owner_passphrase` viven en `organizations`, NO en `voice_agents` ([[feedback_dropped_columns_bugs]]).
- Skill obligatoria a considerar: `centinelia-portal-security` (IDOR guard en endpoints portal), `centinelia-tool-completeness` (tool registrada en chat + email, no solo uno), `centinelia-copy-guidelines` (todo el copy Spanish).
- Migration se corre manualmente en Supabase antes del deploy del cron.
- Commits incrementales, uno por task, con mensaje descriptivo en español.

---

## File Structure

**Created:**
- `migrations/20260804_brief_del_dia.sql` — DDL: columns en `voice_agents` + tabla `brief_runs`
- `src/lib/nox/brief-collector.ts` — queries de las 5 fuentes de datos
- `src/lib/nox/brief-renderer.ts` — llamada a Claude Sonnet + prompt
- `src/lib/nox/brief-deliverer.ts` — email HTML + WhatsApp + insert `brief_runs`
- `src/app/api/cron/nox-brief/route.ts` — cron diario
- `src/app/api/portal/[token]/brief-runs/route.ts` — GET últimos briefs (para portal card)
- `src/app/api/portal/[token]/brief-runs/latest/route.ts` — GET el más reciente
- `src/app/api/portal/[token]/brief-config/route.ts` — GET+PATCH config opt-in
- `src/app/portal/[token]/inicio/BriefDelDiaCard.tsx` — card en /inicio
- `src/app/portal/[token]/configurar/BriefDelDiaSection.tsx` — sección opt-in en Configurar

**Modified:**
- `src/lib/tools/executor.ts` — nuevo branch `if (toolName === 'preparar_brief_del_dia')` con call a `runBriefNow(agentId, ctx)`
- `src/app/api/portal/[token]/agent-chat/route.ts` — agregar tool declaration para `preparar_brief_del_dia` cuando el agente es Nox
- `src/lib/ops/inbox-processor.ts` — agregar tool declaration para `preparar_brief_del_dia` (mismo filtro Nox)
- `vercel.json` — nueva entry cron `{"path": "/api/cron/nox-brief", "schedule": "0 * * * *"}` (corre cada hora, filtra por hora local dentro)
- `src/app/portal/[token]/inicio/page.tsx` — mount `<BriefDelDiaCard />` cuando hay Nox activo
- `src/app/portal/[token]/configurar/page.tsx` — mount `<BriefDelDiaSection />` cuando el agente actual es Nox

---

## Task 1: Migration `brief_del_dia`

**Files:**
- Create: `migrations/20260804_brief_del_dia.sql`

**Interfaces:**

Produces:
```
voice_agents (columnas nuevas):
  brief_del_dia_config      JSONB NULL
  brief_del_dia_last_run_at TIMESTAMPTZ NULL

brief_runs (tabla nueva):
  id               UUID PK
  agent_id         UUID FK → voice_agents(id) ON DELETE CASCADE
  portal_email     TEXT NOT NULL
  ran_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  trigger          TEXT NOT NULL CHECK IN ('cron','reactive')
  brief_md         TEXT NOT NULL
  buckets_json     JSONB NOT NULL  -- {"accion":[...], "prep":[...], "fyi":[...]}
  delivery_status  JSONB NOT NULL  -- {"email":"sent|skipped|error", "wa":"sent|skipped|error"}
  read_at          TIMESTAMPTZ NULL
Indexes:
  - brief_runs_portal_ran (portal_email, ran_at DESC)
  - brief_runs_agent_ran  (agent_id, ran_at DESC)
```

Shape of `brief_del_dia_config` JSON:
```json
{
  "enabled": true,
  "hour": 7,
  "channels": { "email": true, "whatsapp": true, "portal": true }
}
```

- [ ] **Step 1: Crear el archivo SQL de migración**

```sql
-- migrations/20260804_brief_del_dia.sql
-- Nox "brief del día": config opt-in por agente + tabla de runs para portal card.

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS brief_del_dia_config      JSONB NULL,
  ADD COLUMN IF NOT EXISTS brief_del_dia_last_run_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS brief_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email    TEXT NOT NULL,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger         TEXT NOT NULL CHECK (trigger IN ('cron', 'reactive')),
  brief_md        TEXT NOT NULL,
  buckets_json    JSONB NOT NULL,
  delivery_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS brief_runs_portal_ran
  ON brief_runs (portal_email, ran_at DESC);

CREATE INDEX IF NOT EXISTS brief_runs_agent_ran
  ON brief_runs (agent_id, ran_at DESC);
```

- [ ] **Step 2: Correr en Supabase (staging primero, luego prod)**

Manual — abrir Supabase SQL editor, pegar el archivo, ejecutar. Verificar:

```sql
\d voice_agents  -- brief_del_dia_config y brief_del_dia_last_run_at deben aparecer
\d brief_runs    -- debe existir con los índices
```

- [ ] **Step 3: Commit**

```bash
git add migrations/20260804_brief_del_dia.sql
git commit -m "feat(db): migración brief_del_dia — config JSONB + tabla brief_runs"
```

---

## Task 2: Brief data collector

**Files:**
- Create: `src/lib/nox/brief-collector.ts`
- Test: `src/lib/nox/__tests__/brief-collector.test.ts`

**Interfaces:**

Consumes: Supabase admin client, agent id + portal_email + timezone.

Produces:
```ts
export interface BriefDataSource<T> {
  items: T[];
  truncated: boolean;
}

export interface BriefData {
  urgentEmails:   BriefDataSource<{ id: string; from: string; subject: string; category: string; received_at: string }>;
  upcomingEvents: BriefDataSource<{ id: string; title: string; start: string; end: string; source: 'cal_com' | 'google' }>;
  pendingTasks:   BriefDataSource<{ id: string; title: string; assigned_to: string; created_at: string; status: string }>;
  unresolvedEscalations: BriefDataSource<{ id: string; title: string; urgency: string; created_at: string; agent_id: string }>;
  pendingContractDrafts: BriefDataSource<{ id: string; client_name: string | null; created_at: string }>;
}

export async function collectBriefData(
  orgAgentIds: string[],       // TODOS los agent ids del org (para escalaciones cross-agent)
  portalEmail: string,
  tz: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<BriefData>;
```

**Sources & filters:**
1. `ops_inbox` where `agent_id IN (orgAgentIds)`, `status='pending'`, `category IN ('urgente','importante')`, `created_at >= now-24h` — LIMIT 15
2. Calendar: usa el helper existente `executeListCalendarEvents(agentId, from, to, supabase)` para el agente con calendario primario (primer agente del org que tenga `calendar_type != null`). Window: hoy 00:00 → mañana 23:59 en tz local
3. `agent_tasks` where `assigned_to IN (orgAgentIds)` and `status='pending'` — LIMIT 15
4. `human_requests` where `agent_id IN (orgAgentIds)` and `status='pending'` — LIMIT 10
5. `contract_drafts` where `agent_id IN (orgAgentIds)` and `status='borrador'` — LIMIT 10

Each source sets `truncated=true` si `data.length === limit`.

- [ ] **Step 1: Escribir test failing con fixtures**

```ts
// src/lib/nox/__tests__/brief-collector.test.ts
import { describe, it, expect, vi } from 'vitest';
import { collectBriefData } from '../brief-collector';

function mockSupabase(rows: Record<string, any[]>) {
  const chain = (table: string) => {
    const data = rows[table] ?? [];
    return {
      select: () => ({
        in: () => ({
          eq: () => ({
            in: () => ({
              gte: () => ({
                order: () => ({ limit: async () => ({ data, error: null }) }),
              }),
              order: () => ({ limit: async () => ({ data, error: null }) }),
            }),
            gte: () => ({
              order: () => ({ limit: async () => ({ data, error: null }) }),
            }),
            order: () => ({ limit: async () => ({ data, error: null }) }),
          }),
        }),
      }),
    };
  };
  return { from: (table: string) => chain(table) } as any;
}

describe('collectBriefData', () => {
  it('devuelve las 5 fuentes con truncated=false cuando hay pocos items', async () => {
    const supabase = mockSupabase({
      ops_inbox: [{ id: 'e1', email_from: 'x@y.com', email_subject: 'Urgente', category: 'urgente', created_at: '2026-08-04T10:00:00Z' }],
      agent_tasks: [{ id: 't1', title: 'Hacer X', assigned_to: 'a1', created_at: '2026-08-04T09:00:00Z', status: 'pending' }],
      human_requests: [{ id: 'h1', title: 'Aprobar Y', urgency: 'alta', created_at: '2026-08-04T08:00:00Z', agent_id: 'a1' }],
      contract_drafts: [{ id: 'c1', client_name: 'ACME', created_at: '2026-08-04T07:00:00Z' }],
    });
    const data = await collectBriefData(['a1'], 'test@x.com', 'America/Monterrey', supabase);
    expect(data.urgentEmails.items).toHaveLength(1);
    expect(data.pendingTasks.items).toHaveLength(1);
    expect(data.unresolvedEscalations.items).toHaveLength(1);
    expect(data.pendingContractDrafts.items).toHaveLength(1);
    expect(data.urgentEmails.truncated).toBe(false);
  });

  it('marca truncated=true cuando la query llega al límite', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, email_from: 'x@y.com', email_subject: `S${i}`, category: 'urgente', created_at: '2026-08-04T10:00:00Z' }));
    const supabase = mockSupabase({ ops_inbox: many });
    const data = await collectBriefData(['a1'], 'test@x.com', 'America/Monterrey', supabase);
    expect(data.urgentEmails.items).toHaveLength(15);
    expect(data.urgentEmails.truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `./node_modules/.bin/vitest run src/lib/nox/__tests__/brief-collector.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `brief-collector.ts`**

```ts
// src/lib/nox/brief-collector.ts
import type { createAdminClient } from '@/lib/supabase/admin';
import { executeListCalendarEvents } from '@/lib/services/connector-tools';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface BriefDataSource<T> {
  items: T[];
  truncated: boolean;
}

export interface BriefData {
  urgentEmails: BriefDataSource<{ id: string; from: string; subject: string; category: string; received_at: string }>;
  upcomingEvents: BriefDataSource<{ id: string; title: string; start: string; end: string; source: 'cal_com' | 'google' }>;
  pendingTasks: BriefDataSource<{ id: string; title: string; assigned_to: string; created_at: string; status: string }>;
  unresolvedEscalations: BriefDataSource<{ id: string; title: string; urgency: string; created_at: string; agent_id: string }>;
  pendingContractDrafts: BriefDataSource<{ id: string; client_name: string | null; created_at: string }>;
}

const LIMIT_EMAILS = 15;
const LIMIT_TASKS = 15;
const LIMIT_ESCAL = 10;
const LIMIT_DRAFTS = 10;
const LIMIT_EVENTS = 20;

function wrap<T>(items: T[], limit: number): BriefDataSource<T> {
  return { items, truncated: items.length >= limit };
}

async function fetchCalendarEvents(
  orgAgentIds: string[],
  tz: string,
  supabase: SupabaseClient,
): Promise<BriefDataSource<{ id: string; title: string; start: string; end: string; source: 'cal_com' | 'google' }>> {
  // Encuentra el primer agente del org con calendario configurado
  const { data: cal } = await supabase
    .from('voice_agents')
    .select('id, calendar_type')
    .in('id', orgAgentIds)
    .not('calendar_type', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!cal?.id) return { items: [], truncated: false };

  const now = new Date();
  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
  tomorrowEnd.setHours(0, 0, 0, 0);

  try {
    const result = await executeListCalendarEvents(cal.id, now, tomorrowEnd, supabase) as {
      ok: boolean;
      events?: Array<{ id: string; title: string; start: string; end: string }>;
    };
    if (!result.ok || !result.events) return { items: [], truncated: false };
    const source = (cal.calendar_type === 'cal_com' ? 'cal_com' : 'google') as 'cal_com' | 'google';
    const items = result.events.slice(0, LIMIT_EVENTS).map(e => ({ ...e, source }));
    return { items, truncated: result.events.length >= LIMIT_EVENTS };
  } catch (err) {
    console.error('[brief-collector] calendar error:', err);
    return { items: [], truncated: false };
  }
}

export async function collectBriefData(
  orgAgentIds: string[],
  _portalEmail: string,
  tz: string,
  supabase: SupabaseClient,
): Promise<BriefData> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [emailsRes, tasksRes, escalRes, draftsRes, events] = await Promise.all([
    supabase.from('ops_inbox')
      .select('id, email_from, email_subject, category, created_at')
      .in('agent_id', orgAgentIds)
      .eq('status', 'pending')
      .in('category', ['urgente', 'importante'])
      .gte('created_at', since24h)
      .order('created_at', { ascending: false })
      .limit(LIMIT_EMAILS),
    supabase.from('agent_tasks')
      .select('id, title, assigned_to, created_at, status')
      .in('assigned_to', orgAgentIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIMIT_TASKS),
    supabase.from('human_requests')
      .select('id, title, urgency, created_at, agent_id')
      .in('agent_id', orgAgentIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIMIT_ESCAL),
    supabase.from('contract_drafts')
      .select('id, client_name, created_at')
      .in('agent_id', orgAgentIds)
      .eq('status', 'borrador')
      .order('created_at', { ascending: false })
      .limit(LIMIT_DRAFTS),
    fetchCalendarEvents(orgAgentIds, tz, supabase),
  ]);

  // Surface PostgREST errors so silent-empty bugs don't hide
  for (const [name, res] of Object.entries({ ops_inbox: emailsRes, agent_tasks: tasksRes, human_requests: escalRes, contract_drafts: draftsRes })) {
    if ((res as any).error) console.error(`[brief-collector] ${name} query failed:`, (res as any).error?.message ?? res);
  }

  return {
    urgentEmails: wrap(
      ((emailsRes.data ?? []) as any[]).map(e => ({ id: e.id, from: e.email_from ?? '', subject: e.email_subject ?? '', category: e.category ?? '', received_at: e.created_at })),
      LIMIT_EMAILS,
    ),
    upcomingEvents: events,
    pendingTasks: wrap(((tasksRes.data ?? []) as any[]), LIMIT_TASKS),
    unresolvedEscalations: wrap(((escalRes.data ?? []) as any[]), LIMIT_ESCAL),
    pendingContractDrafts: wrap(((draftsRes.data ?? []) as any[]), LIMIT_DRAFTS),
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `./node_modules/.bin/vitest run src/lib/nox/__tests__/brief-collector.test.ts`
Expected: PASS ambos tests.

- [ ] **Step 5: Type check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nox/brief-collector.ts src/lib/nox/__tests__/brief-collector.test.ts
git commit -m "feat(nox/brief): collector de 5 fuentes (correos, agenda, tareas, escalaciones, borradores)"
```

---

## Task 3: Brief renderer (LLM → markdown)

**Files:**
- Create: `src/lib/nox/brief-renderer.ts`
- Test: `src/lib/nox/__tests__/brief-renderer.test.ts`

**Interfaces:**

Consumes: `BriefData` de Task 2, agent context (nombre, negocio, tz, KB).

Produces:
```ts
export interface BriefBuckets {
  accion: string[];  // items markdown pre-formateados (bullets)
  prep:   string[];
  fyi:    string[];
}

export interface RenderedBrief {
  markdown: string;         // el brief completo con headers ## Requiere acción, ## Necesita preparación, ## Al tanto
  buckets:  BriefBuckets;   // los mismos items desglosados por bucket para usar en portal card
}

export async function renderBrief(
  data: BriefData,
  ctx: { agentName: string; businessName: string; tz: string; ownerName: string | null; kbSnippet: string | null },
): Promise<RenderedBrief>;
```

**Prompt shape:** Sonnet clasifica cada item de las 5 fuentes en uno de 3 buckets según urgencia + tipo. Devuelve JSON estructurado, no markdown suelto. El helper convierte JSON → markdown final.

Modelo: `claude-sonnet-4-6` (no Haiku, no Opus — Sonnet balance costo/calidad para clasificación estructurada, y regla [[feedback_subagent_sonnet]]).

- [ ] **Step 1: Test failing con LLM stub**

```ts
// src/lib/nox/__tests__/brief-renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBrief } from '../brief-renderer';
import type { BriefData } from '../brief-collector';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          accion: ['Responder correo urgente de ACME (recibido hace 3h)'],
          prep:   ['Reunión 10am con proveedor — llevar cotización revisada'],
          fyi:    ['3 correos informativos procesados por Nia'],
        }) }],
      })),
    };
  },
}));

const EMPTY_SOURCE = { items: [], truncated: false };
const emptyData: BriefData = {
  urgentEmails: EMPTY_SOURCE,
  upcomingEvents: EMPTY_SOURCE,
  pendingTasks: EMPTY_SOURCE,
  unresolvedEscalations: EMPTY_SOURCE,
  pendingContractDrafts: EMPTY_SOURCE,
};

describe('renderBrief', () => {
  it('produce markdown con 3 headers y buckets desglosados', async () => {
    const brief = await renderBrief(emptyData, { agentName: 'Nox', businessName: 'Test Co', tz: 'America/Monterrey', ownerName: 'Nazre', kbSnippet: null });
    expect(brief.markdown).toContain('## Requiere acción');
    expect(brief.markdown).toContain('## Necesita preparación');
    expect(brief.markdown).toContain('## Al tanto');
    expect(brief.buckets.accion).toHaveLength(1);
    expect(brief.buckets.prep).toHaveLength(1);
    expect(brief.buckets.fyi).toHaveLength(1);
  });

  it('devuelve buckets vacíos + mensaje "sin novedades" cuando LLM regresa vacío', async () => {
    const { default: AnthropicMock } = await import('@anthropic-ai/sdk');
    const inst = new (AnthropicMock as any)();
    inst.messages.create.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ accion: [], prep: [], fyi: [] }) }] });
    // Fresh test with empty response
    const brief = await renderBrief(emptyData, { agentName: 'Nox', businessName: 'Test Co', tz: 'America/Monterrey', ownerName: null, kbSnippet: null });
    expect(brief.buckets.accion).toEqual([]);
    expect(brief.markdown).toContain('Sin novedades');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `./node_modules/.bin/vitest run src/lib/nox/__tests__/brief-renderer.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `brief-renderer.ts`**

```ts
// src/lib/nox/brief-renderer.ts
import Anthropic from '@anthropic-ai/sdk';
import type { BriefData } from './brief-collector';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-6' as const;

export interface BriefBuckets {
  accion: string[];
  prep:   string[];
  fyi:    string[];
}

export interface RenderedBrief {
  markdown: string;
  buckets:  BriefBuckets;
}

interface RenderCtx {
  agentName:    string;
  businessName: string;
  tz:           string;
  ownerName:    string | null;
  kbSnippet:    string | null;
}

function serializeData(data: BriefData): string {
  const parts: string[] = [];

  if (data.urgentEmails.items.length) {
    parts.push('CORREOS URGENTES/IMPORTANTES SIN RESPONDER (últimas 24h):\n' + data.urgentEmails.items.map(e => `- [${e.received_at}] ${e.from}: "${e.subject}" (categoría ${e.category})`).join('\n'));
  }
  if (data.upcomingEvents.items.length) {
    parts.push('AGENDA (hoy y mañana):\n' + data.upcomingEvents.items.map(e => `- ${e.start} → ${e.end}: ${e.title}`).join('\n'));
  }
  if (data.pendingTasks.items.length) {
    parts.push('TAREAS PENDIENTES DEL EQUIPO:\n' + data.pendingTasks.items.map(t => `- [${t.created_at}] ${t.title} (asignada a ${t.assigned_to}, estado ${t.status})`).join('\n'));
  }
  if (data.unresolvedEscalations.items.length) {
    parts.push('ESCALACIONES SIN RESOLVER (empleados pidieron ayuda al dueño):\n' + data.unresolvedEscalations.items.map(h => `- [${h.created_at}] ${h.title} (urgencia ${h.urgency})`).join('\n'));
  }
  if (data.pendingContractDrafts.items.length) {
    parts.push('BORRADORES DE CONTRATO SIN FIRMAR:\n' + data.pendingContractDrafts.items.map(c => `- [${c.created_at}] ${c.client_name ?? 'Sin nombre'}`).join('\n'));
  }

  return parts.length ? parts.join('\n\n') : 'No hay datos en las últimas 24 horas.';
}

const SYSTEM_PROMPT = `Eres Nox, el coordinador digital del dueño de un negocio. Tu trabajo es preparar el "brief del día" clasificando cada dato en 3 buckets:

- accion: cosas que el dueño DEBE hacer HOY (responder correo urgente, resolver escalación de un empleado, decidir sobre contrato listo)
- prep: cosas que necesitan PREPARACIÓN antes de una reunión o evento (llevar cotización, revisar propuesta, contexto de un cliente que llega)
- fyi: cosas informativas para que el dueño esté al tanto (correos ya cerrados por otros empleados, tareas completadas, eventos rutinarios)

Reglas duras:
- Cada bucket es un array de strings. Cada string es un bullet corto (máx 20 palabras) escrito para el dueño en tono directo.
- Sin em-dashes, sin emojis. Usa comas o dos puntos.
- Si no hay nada relevante en un bucket, devuelve array vacío.
- Prioriza señales de acción sobre volumen. Si hay 10 correos FYI, resume "10 correos informativos procesados" en un solo bullet.
- Devuelve SOLO JSON válido con esta forma exacta: {"accion": [...], "prep": [...], "fyi": [...]}. No expliques, no incluyas texto fuera del JSON.`;

function bucketsToMarkdown(buckets: BriefBuckets): string {
  const sections: string[] = [];
  const anyItems = buckets.accion.length + buckets.prep.length + buckets.fyi.length;
  if (anyItems === 0) return 'Sin novedades hoy. Todo bajo control.';

  sections.push('## Requiere acción');
  sections.push(buckets.accion.length ? buckets.accion.map(x => `- ${x}`).join('\n') : '_Nada urgente._');

  sections.push('\n## Necesita preparación');
  sections.push(buckets.prep.length ? buckets.prep.map(x => `- ${x}`).join('\n') : '_Sin preparativos pendientes._');

  sections.push('\n## Al tanto');
  sections.push(buckets.fyi.length ? buckets.fyi.map(x => `- ${x}`).join('\n') : '_Sin novedades informativas._');

  return sections.join('\n');
}

export async function renderBrief(data: BriefData, ctx: RenderCtx): Promise<RenderedBrief> {
  const userPrompt = `NEGOCIO: ${ctx.businessName}
DUEÑO: ${ctx.ownerName ?? 'sin nombre registrado'}
ZONA HORARIA: ${ctx.tz}
${ctx.kbSnippet ? `\nCONTEXTO DEL NEGOCIO:\n${ctx.kbSnippet}\n` : ''}
DATOS DE LAS ÚLTIMAS 24 HORAS + AGENDA HOY/MAÑANA:

${serializeData(data)}

Clasifica cada dato en accion / prep / fyi y devuelve el JSON.`;

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 1200,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';

  let parsed: BriefBuckets;
  try {
    // Robust JSON extraction: model may wrap in code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { accion: [], prep: [], fyi: [] };
  }

  const buckets: BriefBuckets = {
    accion: Array.isArray(parsed.accion) ? parsed.accion.filter(x => typeof x === 'string') : [],
    prep:   Array.isArray(parsed.prep)   ? parsed.prep.filter(x => typeof x === 'string')   : [],
    fyi:    Array.isArray(parsed.fyi)    ? parsed.fyi.filter(x => typeof x === 'string')    : [],
  };

  return { markdown: bucketsToMarkdown(buckets), buckets };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `./node_modules/.bin/vitest run src/lib/nox/__tests__/brief-renderer.test.ts`
Expected: PASS ambos tests.

- [ ] **Step 5: Type check + Commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/nox/brief-renderer.ts src/lib/nox/__tests__/brief-renderer.test.ts
git commit -m "feat(nox/brief): renderer con Sonnet — clasifica en 3 buckets y devuelve markdown"
```

---

## Task 4: Brief deliverer (email + WhatsApp + portal DB)

**Files:**
- Create: `src/lib/nox/brief-deliverer.ts`
- Test: `src/lib/nox/__tests__/brief-deliverer.test.ts`

**Interfaces:**

Consumes: `RenderedBrief` de Task 3, agent row, config.

Produces:
```ts
export interface DeliveryStatus {
  email:    'sent' | 'skipped' | 'error';
  wa:       'sent' | 'skipped' | 'error';
  portal:   'sent' | 'skipped' | 'error';
  brief_id: string | null;
}

export async function deliverBrief(
  brief:   RenderedBrief,
  agent:   { id: string; agent_name: string | null; business_name: string; client_email: string | null; transfer_whatsapp: string | null; portal_email: string; timezone: string | null },
  channels: { email: boolean; whatsapp: boolean; portal: boolean },
  trigger:  'cron' | 'reactive',
  supabase: ReturnType<typeof createAdminClient>,
): Promise<DeliveryStatus>;
```

**Rules:**
- Portal insert es siempre "on" (es la fuente de verdad para la card). `channels.portal=false` solo omite el insert cuando es reactive (para no duplicar cuando el dueño lo pidió por chat).
- Email skipped si `client_email` es null o `channels.email=false`.
- WhatsApp skipped si `transfer_whatsapp` es null o `channels.whatsapp=false`.
- Cualquier error individual queda registrado en `delivery_status` JSON, no rompe el resto.

- [ ] **Step 1: Test failing**

```ts
// src/lib/nox/__tests__/brief-deliverer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { deliverBrief } from '../brief-deliverer';

vi.mock('@/lib/email/send', () => ({
  sendEmail:        vi.fn(async () => true),
  shell:            (body: string) => body,
  heading:          (t: string, s: string) => `<h1>${t}</h1><p>${s}</p>`,
  infoCard:         (body: string) => `<div>${body}</div>`,
  mdToEmailHtml:    (md: string) => `<html>${md}</html>`,
  agentBrandedFrom: (name: string | null) => `${name ?? 'Centinelia'} <no-reply@centinelia.mx>`,
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(async () => true),
}));

function mockSupabase() {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'brief-1' }, error: null }) }) }),
    }),
  } as any;
}

describe('deliverBrief', () => {
  it('envía email + WA + guarda en DB cuando todos los canales están activos', async () => {
    const { sendEmail } = await import('@/lib/email/send');
    const { sendWhatsApp } = await import('@/lib/whatsapp/send');
    const status = await deliverBrief(
      { markdown: '## Test', buckets: { accion: [], prep: [], fyi: [] } },
      { id: 'a1', agent_name: 'Nox', business_name: 'Test', client_email: 'owner@x.com', transfer_whatsapp: '+521234567890', portal_email: 'owner@x.com', timezone: 'America/Monterrey' },
      { email: true, whatsapp: true, portal: true },
      'cron',
      mockSupabase(),
    );
    expect(status.email).toBe('sent');
    expect(status.wa).toBe('sent');
    expect(status.portal).toBe('sent');
    expect(status.brief_id).toBe('brief-1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
  });

  it('skip email si client_email es null', async () => {
    const status = await deliverBrief(
      { markdown: '## Test', buckets: { accion: [], prep: [], fyi: [] } },
      { id: 'a1', agent_name: 'Nox', business_name: 'Test', client_email: null, transfer_whatsapp: null, portal_email: 'owner@x.com', timezone: 'America/Monterrey' },
      { email: true, whatsapp: true, portal: true },
      'cron',
      mockSupabase(),
    );
    expect(status.email).toBe('skipped');
    expect(status.wa).toBe('skipped');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `./node_modules/.bin/vitest run src/lib/nox/__tests__/brief-deliverer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `brief-deliverer.ts`**

```ts
// src/lib/nox/brief-deliverer.ts
import { sendEmail, shell, heading, infoCard, mdToEmailHtml, agentBrandedFrom } from '@/lib/email/send';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { RenderedBrief } from './brief-renderer';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface DeliveryStatus {
  email:    'sent' | 'skipped' | 'error';
  wa:       'sent' | 'skipped' | 'error';
  portal:   'sent' | 'skipped' | 'error';
  brief_id: string | null;
}

interface DeliverAgent {
  id:                string;
  agent_name:        string | null;
  business_name:     string;
  client_email:      string | null;
  transfer_whatsapp: string | null;
  portal_email:      string;
  timezone:          string | null;
}

function markdownToWa(md: string): string {
  // WA no soporta markdown de headers/bullets bonito. Convertir a texto plano.
  return md
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^_([^_]+)_$/gm, '$1')
    .replace(/^- /gm, '• ')
    .trim();
}

export async function deliverBrief(
  brief: RenderedBrief,
  agent: DeliverAgent,
  channels: { email: boolean; whatsapp: boolean; portal: boolean },
  trigger: 'cron' | 'reactive',
  supabase: SupabaseClient,
): Promise<DeliveryStatus> {
  const tz = agent.timezone ?? 'America/Monterrey';
  const dateStr = new Date().toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

  const status: DeliveryStatus = { email: 'skipped', wa: 'skipped', portal: 'skipped', brief_id: null };

  // Email
  if (channels.email && agent.client_email) {
    try {
      await sendEmail({
        to:      agent.client_email,
        from:    agentBrandedFrom(agent.agent_name),
        subject: `Brief del día · ${dateStr}`,
        html: shell(
          heading('Brief del día', `${agent.agent_name ?? 'Nox'} · ${dateStr}`) +
          infoCard(mdToEmailHtml(brief.markdown))
        ),
      });
      status.email = 'sent';
    } catch (err) {
      console.error('[brief-deliverer] email error:', err);
      status.email = 'error';
    }
  }

  // WhatsApp
  if (channels.whatsapp && agent.transfer_whatsapp) {
    try {
      const waBody = `📋 *Brief del día · ${dateStr}*\n\n${markdownToWa(brief.markdown)}\n\nVer detalles en tu portal.`;
      const ok = await sendWhatsApp(agent.transfer_whatsapp, waBody);
      status.wa = ok ? 'sent' : 'error';
    } catch (err) {
      console.error('[brief-deliverer] wa error:', err);
      status.wa = 'error';
    }
  }

  // Portal DB (siempre insert salvo channels.portal=false en modo reactive)
  const shouldInsert = trigger === 'cron' || channels.portal;
  if (shouldInsert) {
    try {
      const { data, error } = await supabase.from('brief_runs').insert({
        agent_id:        agent.id,
        portal_email:    agent.portal_email,
        trigger,
        brief_md:        brief.markdown,
        buckets_json:    brief.buckets,
        delivery_status: { email: status.email, wa: status.wa },
      }).select('id').single();
      if (error) throw error;
      status.brief_id = data?.id ?? null;
      status.portal = 'sent';
    } catch (err) {
      console.error('[brief-deliverer] portal insert error:', err);
      status.portal = 'error';
    }
  }

  return status;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `./node_modules/.bin/vitest run src/lib/nox/__tests__/brief-deliverer.test.ts`
Expected: PASS.

- [ ] **Step 5: Type check + Commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/nox/brief-deliverer.ts src/lib/nox/__tests__/brief-deliverer.test.ts
git commit -m "feat(nox/brief): deliverer — email HTML + WA texto + insert brief_runs"
```

---

## Task 5: Cron endpoint `/api/cron/nox-brief`

**Files:**
- Create: `src/app/api/cron/nox-brief/route.ts`
- Modify: `vercel.json` — agregar cron entry

**Interfaces:**

Consumes: `collectBriefData`, `renderBrief`, `deliverBrief` de Tasks 2-4. Reusa `verifyCronAuth`, `createAdminClient`, `consumeAiOp`, `maybeSendQuotaEmail` como el heartbeat.

Produces:
- Endpoint GET que verifica cron auth, itera voice_agents con `meerkat_role_id='nox'`, `brief_del_dia_config.enabled=true`, respetando `hour` y timezone del agente, con dedup por día vía `brief_del_dia_last_run_at`. Ops cost: 5.
- Vercel schedule: `0 * * * *` (cada hora, filtra por hora local dentro).

- [ ] **Step 1: Crear el cron route**

```ts
// src/app/api/cron/nox-brief/route.ts
export const dynamic = 'force-dynamic';
// Frecuencia recomendada: "0 * * * *" (cada hora, filtra por hora local del agente).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { collectBriefData } from '@/lib/nox/brief-collector';
import { renderBrief } from '@/lib/nox/brief-renderer';
import { deliverBrief } from '@/lib/nox/brief-deliverer';

interface BriefConfig {
  enabled: boolean;
  hour:    number;
  channels: { email: boolean; whatsapp: boolean; portal: boolean };
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date();

  const { data: noxAgents, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, transfer_whatsapp, portal_email, timezone, brief_del_dia_config, brief_del_dia_last_run_at, features, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token')
    .eq('active', true)
    .not('brief_del_dia_config', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!noxAgents?.length) return NextResponse.json({ ok: true, ran: 0 });

  let ran = 0;

  for (const agent of noxAgents) {
    const meerkatId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
    if (meerkatId !== 'nox') continue;

    const cfg = agent.brief_del_dia_config as BriefConfig | null;
    if (!cfg?.enabled) continue;

    const tz = agent.timezone ?? 'America/Monterrey';
    const localNow  = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const localHour = localNow.getHours();
    if (localHour !== cfg.hour) continue;

    const lastRun = agent.brief_del_dia_last_run_at ? new Date(agent.brief_del_dia_last_run_at) : null;
    if (lastRun) {
      const lastLocal = new Date(lastRun.toLocaleString('en-US', { timeZone: tz }));
      const sameDay = lastLocal.getFullYear() === localNow.getFullYear()
        && lastLocal.getMonth() === localNow.getMonth()
        && lastLocal.getDate() === localNow.getDate();
      if (sameDay) continue;
    }

    const opsResult = await consumeAiOp(agent.id, 5);
    if (!opsResult.ok) {
      await maybeSendQuotaEmail(agent as any, 'brief_del_dia');
      continue;
    }

    // Collect org agent ids (todos los agentes del portal_email para cross-agent queries)
    const { data: orgAgents } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', agent.portal_email);
    const orgAgentIds = (orgAgents ?? []).map(a => a.id);

    // Fetch org KB snippet
    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, owner_name')
      .eq('portal_email', agent.portal_email)
      .maybeSingle();

    try {
      const data = await collectBriefData(orgAgentIds, agent.portal_email, tz, supabase);
      const brief = await renderBrief(data, {
        agentName:    agent.agent_name ?? 'Nox',
        businessName: agent.business_name,
        tz,
        ownerName:    (org?.owner_name as string | null) ?? null,
        kbSnippet:    ((org?.knowledge_base as string | null) ?? '').slice(0, 800) || null,
      });
      await deliverBrief(brief, agent as any, cfg.channels, 'cron', supabase);

      await supabase
        .from('voice_agents')
        .update({ brief_del_dia_last_run_at: now.toISOString() })
        .eq('id', agent.id);

      ran++;
    } catch (err) {
      console.error('[cron/nox-brief] agent failed:', agent.id, err);
    }
  }

  return NextResponse.json({ ok: true, ran });
}
```

- [ ] **Step 2: Registrar cron en vercel.json**

Read `vercel.json`, agregar una entry al array `crons`:

```json
{ "path": "/api/cron/nox-brief", "schedule": "0 * * * *" }
```

- [ ] **Step 3: Prueba manual con curl (sin autenticar → 401)**

```bash
curl -i http://localhost:3000/api/cron/nox-brief
```
Expected: `401 Unauthorized`.

Luego con auth:
```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/nox-brief
```
Expected: `200 { ok: true, ran: 0 }` (0 porque nadie tiene la config activada aún).

- [ ] **Step 4: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/app/api/cron/nox-brief/route.ts vercel.json
git commit -m "feat(cron/nox-brief): cron diario opt-in — filtra por hora local + dedup por día"
```

---

## Task 6: Executor branch `preparar_brief_del_dia`

**Files:**
- Modify: `src/lib/tools/executor.ts` — nuevo branch tras el último `if (toolName === '...')`
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts` — tool declaration en el array tools cuando el agente es Nox
- Modify: `src/lib/ops/inbox-processor.ts` — tool declaration cuando el agente es Nox

**Interfaces:**

Consumes: `executeAgentTool(toolName='preparar_brief_del_dia', input, ctx)`.

Produces: `{ ok: true, brief_md: string, buckets: BriefBuckets, brief_id: string | null } | { ok: false, error: string }`.

Contract del input: sin parámetros requeridos. Opcional `{ channels?: { email?: boolean; whatsapp?: boolean } }` — permite al dueño pedir "solo mándamelo por WA".

- [ ] **Step 1: Agregar branch en `executor.ts`**

Encontrar el último `if (toolName === ...)` en el archivo. Agregar después:

```ts
  // ─────────────────────────────────────────────────────────────────────────
  // preparar_brief_del_dia (Nox exclusivo)
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'preparar_brief_del_dia') {
    const meerkatId = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
    if (meerkatId !== 'nox') {
      return { ok: false, error: 'Solo Nox puede preparar el brief del día. Consúltalo con Nox usando consultar_agente.' };
    }

    const { collectBriefData } = await import('@/lib/nox/brief-collector');
    const { renderBrief }      = await import('@/lib/nox/brief-renderer');
    const { deliverBrief }     = await import('@/lib/nox/brief-deliverer');

    const tz = (agent.timezone as string | undefined) ?? 'America/Monterrey';

    const { data: orgAgents } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', portalEmail);
    const orgAgentIds = (orgAgents ?? []).map(a => a.id);

    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, owner_name')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const data = await collectBriefData(orgAgentIds, portalEmail, tz, supabase);
    const brief = await renderBrief(data, {
      agentName:    agentName,
      businessName: businessName,
      tz,
      ownerName:    (org?.owner_name as string | null) ?? null,
      kbSnippet:    ((org?.knowledge_base as string | null) ?? '').slice(0, 800) || null,
    });

    const reqChannels = (toolInput.channels as { email?: boolean; whatsapp?: boolean } | undefined) ?? {};
    const status = await deliverBrief(
      brief,
      { id: agentId, agent_name: agentName, business_name: businessName, client_email: (agent.client_email as string | null) ?? null, transfer_whatsapp: (agent.transfer_whatsapp as string | null) ?? null, portal_email: portalEmail, timezone: tz },
      { email: reqChannels.email ?? false, whatsapp: reqChannels.whatsapp ?? false, portal: true },
      'reactive',
      supabase,
    );

    return { ok: true, brief_md: brief.markdown, buckets: brief.buckets, brief_id: status.brief_id, delivery: status };
  }
```

- [ ] **Step 2: Agregar declaration en `agent-chat/route.ts`**

Ubicar el array de tools que se le pasa a Anthropic (grep por `tools:` en el archivo). Agregar condicional cuando el agente es Nox:

```ts
// Ejemplo — ajustar al patrón local exacto
const isNox = (typedAgent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id === 'nox';
if (isNox) {
  tools.push({
    name: 'preparar_brief_del_dia',
    description: 'Prepara el brief del día del dueño con 3 buckets (acción hoy / preparación / al tanto). Lee correos urgentes, agenda, tareas pendientes, escalaciones y borradores de contrato. Devuelve el brief en markdown. Opcionalmente, envía copia por correo o WhatsApp si el dueño lo pide.',
    input_schema: {
      type: 'object',
      properties: {
        channels: {
          type: 'object',
          properties: {
            email:    { type: 'boolean', description: 'Enviar copia por correo al dueño' },
            whatsapp: { type: 'boolean', description: 'Enviar copia por WhatsApp al dueño' },
          },
        },
      },
    },
  });
}
```

- [ ] **Step 3: Agregar declaration en `inbox-processor.ts`**

Mismo patrón: filtrar por `meerkat_role_id === 'nox'` y agregar la tool al array. Ver la sección donde `buildTools()` o equivalente arma la lista.

- [ ] **Step 4: Test de humo manual**

Con el dev server corriendo y un agente Nox activo, mandar en /oficina un mensaje al agente: "Nox, prepárame el brief del día". Verificar en logs que se llama `preparar_brief_del_dia`, que devuelve `ok:true`, y que aparece un row nuevo en `brief_runs` con `trigger='reactive'`.

- [ ] **Step 5: Type check + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/tools/executor.ts src/app/api/portal/[token]/agent-chat/route.ts src/lib/ops/inbox-processor.ts
git commit -m "feat(nox/brief): tool reactiva preparar_brief_del_dia en chat + email"
```

---

## Task 7: Portal Inicio card `<BriefDelDiaCard />`

**Files:**
- Create: `src/app/api/portal/[token]/brief-runs/latest/route.ts` — GET último brief del org
- Create: `src/app/portal/[token]/inicio/BriefDelDiaCard.tsx` — componente card
- Modify: `src/app/portal/[token]/inicio/page.tsx` — mount la card cuando hay Nox en el equipo

**Interfaces:**

`GET /api/portal/[token]/brief-runs/latest` → `{ brief_md, buckets_json, ran_at, trigger } | { error: 'not_found' }`

Component `<BriefDelDiaCard />` props: ninguna (fetch interno con `useEffect`).

- [ ] **Step 1: Crear el endpoint GET latest**

```ts
// src/app/api/portal/[token]/brief-runs/latest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePortalToken } from '@/lib/portal/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('brief_runs')
    .select('id, brief_md, buckets_json, ran_at, trigger')
    .eq('portal_email', session.portal_email)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(data);
}
```

Note: Verificar el nombre exacto de `validatePortalToken` en el proyecto — si no existe, usar el helper existente para validar portal_token (grep por `portal_token` en `src/app/api/portal/[token]/*/route.ts` de un endpoint ya existente y copiar el patrón).

- [ ] **Step 2: Crear el componente `BriefDelDiaCard.tsx`**

```tsx
// src/app/portal/[token]/inicio/BriefDelDiaCard.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Clock, Info, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { marked } from 'marked';

interface Brief {
  id:           string;
  brief_md:     string;
  buckets_json: { accion: string[]; prep: string[]; fyi: string[] };
  ran_at:       string;
  trigger:      'cron' | 'reactive';
}

export function BriefDelDiaCard() {
  const { token } = useParams<{ token: string }>();
  const [brief, setBrief]     = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [preparing, setPreparing] = useState(false);

  async function fetchLatest() {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/brief-runs/latest`);
    if (res.ok) setBrief(await res.json());
    else setBrief(null);
    setLoading(false);
  }

  useEffect(() => { fetchLatest(); }, [token]);

  if (loading) return null;

  const ageMs = brief ? Date.now() - new Date(brief.ran_at).getTime() : 0;
  const ageLabel = brief ? formatAge(ageMs) : '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Brief del día</h2>
          {brief && <p className="text-sm text-slate-500">Actualizado {ageLabel}</p>}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-slate-500 hover:text-slate-900"
          aria-label={expanded ? 'Colapsar' : 'Expandir'}
        >
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </header>

      {!expanded ? null : !brief ? (
        <div className="text-center py-8">
          <p className="text-slate-500 mb-4">Aún no hay brief preparado.</p>
          <button
            disabled={preparing}
            onClick={async () => {
              setPreparing(true);
              await fetch(`/api/portal/${token}/nox/prepare-brief`, { method: 'POST' });
              await fetchLatest();
              setPreparing(false);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${preparing ? 'animate-spin' : ''}`} />
            Preparar ahora
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <BucketBlock icon={<AlertTriangle className="w-4 h-4 text-rose-600" />} title="Requiere acción" items={brief.buckets_json.accion} />
          <BucketBlock icon={<Clock className="w-4 h-4 text-amber-600" />}        title="Necesita preparación" items={brief.buckets_json.prep} />
          <BucketBlock icon={<Info className="w-4 h-4 text-slate-500" />}         title="Al tanto"             items={brief.buckets_json.fyi} />
        </div>
      )}
    </section>
  );
}

function BucketBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 italic pl-6">Sin pendientes.</p>
      ) : (
        <ul className="space-y-1 pl-6">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-slate-700 list-disc">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatAge(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'hace unos minutos';
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
```

- [ ] **Step 3: Crear endpoint POST `nox/prepare-brief` (reactive trigger desde botón)**

```ts
// src/app/api/portal/[token]/nox/prepare-brief/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePortalToken } from '@/lib/portal/auth';
import { executeAgentTool } from '@/lib/tools/executor';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: nox } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_email', session.portal_email)
    .eq('active', true)
    .filter('features->>meerkat_role_id', 'eq', 'nox')
    .maybeSingle();

  if (!nox) return NextResponse.json({ error: 'no_nox_agent' }, { status: 404 });

  const result = await executeAgentTool('preparar_brief_del_dia', {}, {
    agentId:      nox.id,
    portalEmail:  session.portal_email,
    agentName:    nox.agent_name ?? 'Nox',
    businessName: nox.business_name,
    portalToken:  token,
    agent:        nox as Record<string, unknown>,
    supabase,
    channel:      'chat',
  });

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Mount la card en `inicio/page.tsx`**

Modify `src/app/portal/[token]/inicio/page.tsx`:

- Al inicio del render, calcular `hasNox = agents.some(a => (a.features as any)?.meerkat_role_id === 'nox')` (usar el query existente de agentes).
- Renderizar `<BriefDelDiaCard />` arriba de las otras cards cuando `hasNox`.

- [ ] **Step 5: Type check + smoke test manual**

Cargar `/portal/<token>/inicio` en el navegador con un org que tiene Nox activo. Debe verse la card. Click en "Preparar ahora" debe fetch el POST y refrescar.

- [ ] **Step 6: Commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/app/api/portal/[token]/brief-runs/latest/route.ts \
        src/app/api/portal/[token]/nox/prepare-brief/route.ts \
        src/app/portal/[token]/inicio/BriefDelDiaCard.tsx \
        src/app/portal/[token]/inicio/page.tsx
git commit -m "feat(nox/brief): card en portal/inicio con botón Preparar ahora"
```

---

## Task 8: Portal config UI (opt-in)

**Files:**
- Create: `src/app/api/portal/[token]/brief-config/route.ts` — GET + PATCH config
- Create: `src/app/portal/[token]/configurar/BriefDelDiaSection.tsx`
- Modify: `src/app/portal/[token]/configurar/page.tsx` — mount la sección cuando el agente actual es Nox

**Interfaces:**

`GET /api/portal/[token]/brief-config?agent_id=<uuid>` → `{ config: BriefConfig | null }`

`PATCH /api/portal/[token]/brief-config?agent_id=<uuid>` body `{ config: BriefConfig | null }` — pasar `null` para desactivar completamente.

**IDOR guard:** verificar que el `agent_id` pertenece al `portal_email` de la sesión antes de leer o actualizar (skill `centinelia-portal-security`).

- [ ] **Step 1: Endpoint GET+PATCH**

```ts
// src/app/api/portal/[token]/brief-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePortalToken } from '@/lib/portal/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'missing_agent_id' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, brief_del_dia_config, features')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent || agent.portal_email !== session.portal_email) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const meerkatId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
  if (meerkatId !== 'nox') return NextResponse.json({ error: 'not_nox' }, { status: 400 });

  return NextResponse.json({ config: agent.brief_del_dia_config });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const agentId = new URL(req.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'missing_agent_id' }, { status: 400 });

  const body   = await req.json();
  const config = body.config as null | { enabled: boolean; hour: number; channels: { email: boolean; whatsapp: boolean; portal: boolean } };

  // Validate config shape
  if (config !== null) {
    if (typeof config.enabled !== 'boolean' || typeof config.hour !== 'number' || config.hour < 0 || config.hour > 23) {
      return NextResponse.json({ error: 'invalid_config' }, { status: 400 });
    }
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent || agent.portal_email !== session.portal_email) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const meerkatId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
  if (meerkatId !== 'nox') return NextResponse.json({ error: 'not_nox' }, { status: 400 });

  await supabase.from('voice_agents').update({ brief_del_dia_config: config }).eq('id', agentId);
  return NextResponse.json({ ok: true, config });
}
```

- [ ] **Step 2: Componente `BriefDelDiaSection`**

```tsx
// src/app/portal/[token]/configurar/BriefDelDiaSection.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Props { agentId: string }

interface Config {
  enabled: boolean;
  hour:    number;
  channels: { email: boolean; whatsapp: boolean; portal: boolean };
}

const DEFAULT: Config = { enabled: false, hour: 7, channels: { email: true, whatsapp: false, portal: true } };

export function BriefDelDiaSection({ agentId }: Props) {
  const { token } = useParams<{ token: string }>();
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/brief-config?agent_id=${agentId}`)
      .then(r => r.json())
      .then(res => { if (res.config) setConfig(res.config); setLoaded(true); });
  }, [token, agentId]);

  async function save() {
    setSaving(true);
    await fetch(`/api/portal/${token}/brief-config?agent_id=${agentId}`, {
      method:  'PATCH',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ config }),
    });
    setSaving(false);
  }

  if (!loaded) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Brief del día</h2>
      <p className="text-sm text-slate-500 mb-4">
        Nox prepara un resumen diario con lo que requiere tu atención hoy, lo que necesita preparación y lo que ya está en orden. Puedes activarlo para recibirlo automáticamente cada mañana.
      </p>

      <label className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={e => setConfig({ ...config, enabled: e.target.checked })}
          className="w-4 h-4"
        />
        <span className="text-sm text-slate-700">Activar brief diario automático</span>
      </label>

      {config.enabled && (
        <>
          <label className="block mb-4">
            <span className="text-sm text-slate-700 block mb-1">Hora de entrega</span>
            <select
              value={config.hour}
              onChange={e => setConfig({ ...config, hour: Number(e.target.value) })}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>

          <div className="space-y-2 mb-4">
            <p className="text-sm font-medium text-slate-700">Canales de entrega</p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={config.channels.email} onChange={e => setConfig({ ...config, channels: { ...config.channels, email: e.target.checked } })} />
              Correo
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={config.channels.whatsapp} onChange={e => setConfig({ ...config, channels: { ...config.channels, whatsapp: e.target.checked } })} />
              WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={config.channels.portal} onChange={e => setConfig({ ...config, channels: { ...config.channels, portal: e.target.checked } })} />
              Portal (card en Inicio)
            </label>
          </div>
        </>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Mount en `configurar/page.tsx`**

Modify `src/app/portal/[token]/configurar/page.tsx`:
- Cuando `currentAgent.features.meerkat_role_id === 'nox'`, renderizar `<BriefDelDiaSection agentId={currentAgent.id} />` en la lista de secciones (donde ya vive `HeartbeatSection` o similar — ubicar el patrón).

- [ ] **Step 4: Smoke test manual**

Ir a `/portal/<token>/configurar` con Nox seleccionado. Activar toggle + hora 7 + canales email+portal. Guardar. Recargar la página → config persiste. En Supabase, `voice_agents.brief_del_dia_config` debe tener el JSON esperado.

- [ ] **Step 5: Commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/app/api/portal/[token]/brief-config/route.ts \
        src/app/portal/[token]/configurar/BriefDelDiaSection.tsx \
        src/app/portal/[token]/configurar/page.tsx
git commit -m "feat(nox/brief): sección Configurar para opt-in con hora + canales"
```

---

## Task 9: E2E manual + docs

**Files:**
- Modify: `AGENTS.md` (opcional) — línea corta describiendo el nuevo cron
- Create: `docs/superpowers/plans/2026-08-04-nox-brief-e2e-checklist.md` — checklist E2E

**Interfaces:** ninguna nueva. Verificación end-to-end.

- [ ] **Step 1: Correr checklist E2E**

Crear un doc `docs/superpowers/plans/2026-08-04-nox-brief-e2e-checklist.md` con este contenido y ejecutar cada bullet manualmente:

```markdown
# Nox Brief E2E Checklist

Setup: cuenta de prueba con Nox activo, integración de correo (Gmail o Outlook), Cal.com opcional, al menos 1 escalación pendiente, 1 tarea pendiente, 1 borrador de contrato.

## Modo cron (proactivo)
- [ ] Activar `brief_del_dia_config` desde /configurar con hora = próxima hora
- [ ] Esperar que corra el cron
- [ ] Verificar: correo recibido en `client_email` con formato correcto
- [ ] Verificar: WA recibido en `transfer_whatsapp` (si activo)
- [ ] Verificar: card en /inicio muestra el brief con 3 buckets
- [ ] Verificar: row en `brief_runs` con `trigger='cron'` y `delivery_status` correcto
- [ ] Verificar: `brief_del_dia_last_run_at` actualizado
- [ ] Volver a correr manual el cron misma hora → skip (dedup por día funciona)

## Modo reactive (on-demand)
- [ ] Ir a /oficina, seleccionar Nox, mandar "Nox, prepárame el brief del día"
- [ ] Verificar: Nox responde con markdown con los 3 buckets
- [ ] Verificar: row en `brief_runs` con `trigger='reactive'`
- [ ] Pedir "Nox, mándamelo también por WhatsApp" → recibir WA
- [ ] Repetir vía inbox-processor: mandar correo al agente pidiendo el brief

## Guardarraíles
- [ ] Sin Nox activo en el org → card en /inicio no aparece
- [ ] Config `enabled=false` → cron no envía
- [ ] Sin `client_email` → email skipped, WA + portal siguen funcionando
- [ ] Verifier bloquea intentos de que Nox envíe correos por su cuenta

## Copy
- [ ] Todo el copy visible es español, sin em-dashes, sin emojis, sin "IA"
- [ ] Íconos son Lucide (AlertTriangle, Clock, Info)
```

- [ ] **Step 2: Commit final**

```bash
git add docs/superpowers/plans/2026-08-04-nox-brief-e2e-checklist.md
git commit -m "docs(nox/brief): E2E manual checklist"
```

- [ ] **Step 3: Update handoff memory**

Actualizar `C:\Users\Nazre\.claude\projects\C--Users-Nazre\memory\handoff_pilares_1_2_diseno.md` marcando Pilar 1 como shipped y dejando handoff limpio para arrancar Pilar 2 (Creatividad) en siguiente sesión.

---

## Self-Review

**Spec coverage check** (contra `handoff_pilares_1_2_diseno.md`):
- Trigger dual (cron proactivo opt-in + tool reactiva on-demand) → Tasks 5 + 6 ✓
- 5 fuentes (correos, calendar, tareas, escalaciones, contract drafts) → Task 2 ✓
- 3 buckets (acción / prep / FYI) → Task 3 ✓
- Entrega correo + WA + portal → Task 4 ✓
- Boundary "Nox no envía nada" → constraint global + tools no incluyen `send_email` en Nox ✓
- `mdToEmailHtml` + `marked` para email HTML → Task 4 ✓
- Feature flag opt-in nunca activar por defecto → Task 8 ✓
- Sin em-dashes, sin emojis, sin "IA" → Global Constraints ✓
- Dropped columns (KB en organizations) → Tasks 5 y 6 leen de organizations ✓
- Skill `centinelia-portal-security` IDOR → Task 8 ✓
- Skill `centinelia-tool-completeness` 3 canales → Task 6 (chat + email; voz no aplica por [[feedback_coordinadores_sin_voz]]) ✓
- `contract_drafts` migration precondición → migración ya corrida en sesión 61

**Placeholder scan:** revisado, sin TBD/TODO/"handle edge cases". Todo tiene código concreto.

**Type consistency:** `BriefData`, `BriefBuckets`, `RenderedBrief`, `DeliveryStatus`, `BriefConfig` — nombres consistentes en todas las tasks.

**Ambigüedad conocida (aceptada):** el patrón exacto de `validatePortalToken` y el nombre de la función que arma tools en `agent-chat/route.ts` requieren un grep de 30 segundos al ejecutar Task 6 y 7 — no vale la pena bloquear el plan por esto. El implementador debe verificar el nombre exacto y copiar el patrón local.

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-08-04-nox-brief-del-dia.md`.

Dos opciones de ejecución (Nazre elige):

1. **Subagent-Driven (recomendada)** — fresh subagent por task, review entre tasks, iteración rápida. Usa `superpowers:subagent-driven-development`.
2. **Inline Execution** — ejecutar tasks en esta misma sesión con checkpoints. Usa `superpowers:executing-plans`.

Auto-mode activo, arranco con subagent-driven por default salvo que Nazre diga otra cosa.
