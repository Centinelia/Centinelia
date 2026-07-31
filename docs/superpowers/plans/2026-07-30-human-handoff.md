# Human Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-07-30-human-handoff-design.md`](../specs/2026-07-30-human-handoff-design.md) (commit `a7a847d`)

**Goal:** Construir el mecanismo unificado para que el empleado autónomo pida ayuda a humanos (info faltante, acción física, aprobación), maneje el loop-close cuando el humano responde, endurezca el filtro de spam, y opcionalmente rescate correos legítimos malfilteados en la carpeta Spam del proveedor.

**Architecture:** Nueva tool `pedir_a_humano` en el executor invocada por Haiku desde inbox-processor (y voz/chat). Cuando se invoca, INSERT en tabla nueva `human_requests`, dispara notif multi-canal (email + WA stub + call para urgencia alta). Portal expone página de respuesta con dropdown de sub-usuarios para redirect. Al responder, PATCH del endpoint dispara re-run del agent via `after()` con context enriquecido. Cron cada 2h maneja reminders / escalaciones / timeouts. En paralelo: bandeja tabs para separar Pendientes / Auto-enviados; filtros de spam más agresivos; toggle opt-in per-agent para carpeta Spam.

**Tech Stack:** Next.js 16, TypeScript, Anthropic SDK (Haiku), Supabase (Postgres), Vercel Cron, Vapi (llamadas), Tailwind. Sin framework de tests unitarios — smoke tests via `npx tsx` y golden tests via patrón `scripts/eval/`.

## Global Constraints

- **Fail-closed:** cualquier fallo del handoff nunca deja al empleado bloqueado indefinidamente. Timeouts + fallbacks + owner escalation.
- **Aplica a Trust Stage 2 y 3.** Stage 1 (Observador) queda excluido — tool no se registra.
- **Anti-loop:** máximo 3 requests totales por `source_inbox_id`. 4to intento retorna error y fuerza al agent a resolver.
- **Anti-redirect-loop:** máximo 3 redirects en cadena. 4to fuerza cancel.
- **Kill switches hierarchical:** env `HUMAN_HANDOFF_ENABLED`, org `human_handoff_disabled_at`, agent `features.human_handoff_enabled`, trust stage.
- **UI copy:** sin emojis (Lucide icons), sin "IA" en copy visible del portal/landing.
- **3-channel parity:** la tool se registra en voz + chat + email desde día 1 (patrón conocido, [[feedback_3channel_tools]]).
- **Testing:** integration contra Supabase real de staging (no mocks de DB). Smoke tests via `npx tsx scripts/smoke/*`. Golden tests via `scripts/eval/run-<name>.ts`.
- **SQL migrations en `sql/`** (no `supabase/migrations/`). Contract-first: NO dropear cols existentes.
- **Model:** classifier + tool handlers usan `claude-haiku-4-5-20251001` con `cache_control: ephemeral` en system prompts.
- **Commits:** conventional style. NO añadir Co-Authored-By footer en commits del implementador — cada tarea comitea explícitamente por sí sola.

---

## File Map

### Files to CREATE

| Path | Responsibility |
|---|---|
| `sql/human_requests.sql` | Migration: tabla `human_requests`, cols en `organizations`, `ops_inbox` |
| `sql/tests/human_requests.verify.sql` | Queries manuales de verificación post-migration |
| `src/lib/tools/handlers/pedir-a-humano.ts` | Handler de la tool: resolve target, insert, dispatch notif |
| `src/lib/human-handoff/notify.ts` | Dispatch multi-canal (email + WA stub + call) + reminder + escalation templates |
| `src/lib/human-handoff/resume.ts` | Loop-close: re-run del agent con response enriquecida |
| `src/lib/human-handoff/directory.ts` | Genera string del directorio interno para injectar en prompt del agent |
| `src/app/portal/[token]/requests/[id]/page.tsx` | Server component: renderiza request + contexto + form |
| `src/app/portal/[token]/requests/[id]/RespondForm.tsx` | Client component: form, upload files, redirect modal, PATCH |
| `src/app/api/portal/[token]/requests/[id]/respond/route.ts` | PATCH endpoint con ownership + redirect chain + trigger resume |
| `src/app/api/cron/human-requests-monitor/route.ts` | Cron: reminders + escalations + timeouts |
| `scripts/smoke/pedir-a-humano.ts` | Smoke test manual del handler |
| `scripts/eval/run-pedir-a-humano.ts` | Golden test runner |
| `scripts/eval/cases/pedir-a-humano/*.json` | 10 fixtures should-call vs should-not-call |
| `docs/runbooks/human-handoff.md` | Runbook operativo: kill switches, rollout, monitoring |

### Files to MODIFY

| Path | Change |
|---|---|
| `src/lib/tools/executor.ts` | Registrar `pedir_a_humano` handler en el switch/map |
| `src/lib/ops/inbox-processor.ts` | Añadir tool a `BASE_EMAIL_TOOLS` + injectar directorio interno en context |
| `src/lib/connectors/types.ts` | Extender `EmailConnector.fetchUnread(since, folder?)` + añadir `unmarkSpam` |
| `src/lib/connectors/google.ts` | Implementar fetch de folder Spam + unmarkSpam para Gmail |
| `src/lib/connectors/microsoft.ts` | Implementar fetch de JunkEmail folder + unmarkSpam para Outlook |
| `src/lib/email/email-sync.ts` | Sync opcional de Spam (guard por `features.check_spam_folder`) + rate limit |
| `src/lib/ops/email-quick-classify.ts` | Endurecer patrones (senders promocionales, retailers, headers bulk) |
| `src/app/portal/[token]/OpsInboxSection.tsx` | Tabs Pendientes / Auto-enviados / Todo |
| `src/app/api/portal/[token]/ops-inbox/route.ts` | Query extendida para incluir human_requests en Pendientes |
| `src/app/portal/[token]/configurar/page.tsx` | Toggle "Revisar carpeta Spam" con cost callout |
| `src/lib/voice/prompt-builder.ts` | Registrar tool en voice tools + directorio interno |
| `src/lib/whatsapp/prompt-builder.ts` | Registrar tool en chat tools + directorio interno |
| `vercel.json` | Añadir cron `/api/cron/human-requests-monitor` con schedule `0 */2 * * *` |

---

## Task 1: SQL Migration (schema + verification)

**Files:**
- Create: `sql/human_requests.sql`
- Create: `sql/tests/human_requests.verify.sql`

**Interfaces:**
- Produces:
  - Tabla `human_requests` con todas las cols listadas en spec §5.1
  - `organizations.human_handoff_disabled_at timestamptz NULL`
  - `ops_inbox.source_folder text DEFAULT 'inbox'` con CHECK
  - 3 índices: agent_status, target, timeout
  - Escala `ops_inbox.status` — este spec no altera el CHECK existente

**Nota:** Nazre mencionó "SQLs corridas" durante brainstorm. El archivo usa `IF NOT EXISTS` en todo, así que re-run es safe. Verificar post-apply.

- [ ] **Step 1: Escribir la migration**

Crear `sql/human_requests.sql`:

```sql
-- Human handoff — schema changes
-- Spec: docs/superpowers/specs/2026-07-30-human-handoff-design.md

BEGIN;

-- Tabla principal
CREATE TABLE IF NOT EXISTS human_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  source_channel        text NOT NULL CHECK (source_channel IN ('voice','chat','email')),
  source_inbox_id       uuid REFERENCES ops_inbox(id) ON DELETE SET NULL,
  source_call_id        uuid REFERENCES voice_calls(id) ON DELETE SET NULL,
  source_context        text,
  request_type          text NOT NULL CHECK (request_type IN ('info','action','approval')),
  title                 text NOT NULL,
  description           text NOT NULL,
  urgency               text NOT NULL DEFAULT 'media' CHECK (urgency IN ('baja','media','alta')),
  needed_by             timestamptz,
  target_email          text NOT NULL,
  target_type           text NOT NULL CHECK (target_type IN ('approver','owner','specific')),
  channels_notified     text[] DEFAULT '{}',
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','responded','escalated','cancelled','timeout')),
  response_text         text,
  response_files        jsonb DEFAULT '[]'::jsonb,
  response_action       text CHECK (response_action IS NULL OR response_action IN ('done','cannot_do','partial')),
  escalated_to_email    text,
  escalated_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz DEFAULT NOW(),
  reminded_at           timestamptz,
  responded_at          timestamptz,
  cancelled_at          timestamptz,
  resume_triggered_at   timestamptz
);

CREATE INDEX IF NOT EXISTS human_requests_agent_status_idx
  ON human_requests (agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS human_requests_target_idx
  ON human_requests (target_email, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS human_requests_timeout_idx
  ON human_requests (status, created_at) WHERE status IN ('pending','escalated');

-- Org kill switch
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS human_handoff_disabled_at timestamptz;

-- Source folder tracking (Q5 - spam rescue)
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS source_folder text DEFAULT 'inbox'
  CHECK (source_folder IS NULL OR source_folder IN ('inbox','spam_rescued','spam_confirmed'));

COMMIT;
```

- [ ] **Step 2: Escribir queries de verificación**

Crear `sql/tests/human_requests.verify.sql`:

```sql
-- Post-migration verification. Correr en Supabase SQL Editor.

-- 1. Tabla existe con 24 cols
SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'human_requests';
-- Expected: 24

-- 2. Constraints principales
SELECT conname FROM pg_constraint WHERE conrelid = 'human_requests'::regclass;
-- Expected: al menos check_source_channel, check_request_type, check_urgency, check_target_type, check_status, check_response_action

-- 3. Índices creados
SELECT indexname FROM pg_indexes WHERE tablename = 'human_requests';
-- Expected: 3 índices (agent_status, target, timeout)

-- 4. Kill switch en organizations
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name = 'human_handoff_disabled_at';
-- Expected: 1 row

-- 5. source_folder en ops_inbox
SELECT column_name, column_default FROM information_schema.columns
WHERE table_name = 'ops_inbox' AND column_name = 'source_folder';
-- Expected: 1 row, default 'inbox'

-- 6. Insert con valor inválido debe fallar
-- BEGIN;
-- INSERT INTO human_requests (agent_id, source_channel, request_type, title, description, target_email, target_type)
-- VALUES ((SELECT id FROM voice_agents LIMIT 1), 'invalid_channel', 'info', 'x', 'x', 'x@x.com', 'approver');
-- ROLLBACK;
-- Expected: ERROR check constraint violation
```

- [ ] **Step 3: Aplicar en prod**

Nazre corre en Supabase SQL Editor. Verificar con `sql/tests/human_requests.verify.sql`.

- [ ] **Step 4: Commit**

```bash
git add sql/human_requests.sql sql/tests/human_requests.verify.sql
git commit -m "feat(sql): add human_requests table + source_folder col + kill switches"
```

---

## Task 2: `pedir-a-humano` handler + directory generator

**Files:**
- Create: `src/lib/tools/handlers/pedir-a-humano.ts`
- Create: `src/lib/human-handoff/directory.ts`

**Interfaces:**
- Consumes: Task 1 schema. `dispatchHumanRequestNotification` (Task 5) — declared but not called yet en Task 2; se descubre por import path
- Produces:
  ```ts
  export interface PedirAHumanoArgs {
    type:         'info' | 'action' | 'approval';
    target:       'approver' | 'owner' | 'specific';
    target_email?: string;
    title:        string;
    description:  string;
    urgency?:     'baja' | 'media' | 'alta';
    needed_by?:   string;
  }
  export interface PedirAHumanoResult {
    ok: boolean;
    request_id?: string;
    target_email?: string;
    error?: string;
  }
  export async function pedirAHumano(args: PedirAHumanoArgs, ctx: ExecCtx): Promise<PedirAHumanoResult>;
  ```
  ```ts
  export async function buildInternalDirectoryString(portalEmail: string): Promise<string>;
  ```

- [ ] **Step 1: Crear el directory generator**

Crear `src/lib/human-handoff/directory.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Genera string del directorio interno para inyectar en el system prompt del agent.
 * Lista sub-usuarios activos (no owners) con name/email/módulo.
 * Formato compacto — se pega en el prompt junto con otras secciones.
 *
 * Ejemplo output:
 *   DIRECTORIO INTERNO (para pedir_a_humano):
 *   - Roberto Jurado (roberto@x.mx) — Ventas
 *   - María López (maria@x.mx) — Diseño
 */
export async function buildInternalDirectoryString(portalEmail: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('portal_users')
    .select('name, email, modules')
    .eq('account_id', portalEmail)
    .eq('is_owner', false)
    .order('name', { ascending: true });

  if (!data || data.length === 0) return '';

  const lines = data.map(u => {
    const name = (u.name as string | null) ?? '(sin nombre)';
    const modules = (u.modules as string[] | null) ?? [];
    const areaTag = modules.length > 0 ? ` — ${modules[0]}` : '';
    return `- ${name} (${u.email})${areaTag}`;
  });

  return `DIRECTORIO INTERNO (para pedir_a_humano si necesitas ayuda de un compañero):
${lines.join('\n')}

Usa target='specific' + target_email=<correo> cuando sepas quién es el mejor.
Usa target='approver' si no sabes o dudas.`;
}
```

- [ ] **Step 2: Crear el handler**

Crear `src/lib/tools/handlers/pedir-a-humano.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchHumanRequestNotification } from '@/lib/human-handoff/notify';

export type ExecCtx = {
  agentId:        string;
  supabase?:      ReturnType<typeof createAdminClient>;
  agent?:         Record<string, unknown>;
  channel?:       'voice' | 'chat' | 'email';
  sourceInboxId?: string;
  sourceCallId?:  string;
  userContext?:   string;
};

export interface PedirAHumanoArgs {
  type:         'info' | 'action' | 'approval';
  target:       'approver' | 'owner' | 'specific';
  target_email?: string;
  title:        string;
  description:  string;
  urgency?:     'baja' | 'media' | 'alta';
  needed_by?:   string;
}

export interface PedirAHumanoResult {
  ok:           boolean;
  request_id?:  string;
  target_email?: string;
  error?:       string;
}

const MAX_REQUESTS_PER_INBOX = 3;

export async function pedirAHumano(
  args: PedirAHumanoArgs,
  ctx:  ExecCtx,
): Promise<PedirAHumanoResult> {
  const supabase = ctx.supabase ?? createAdminClient();

  // Kill switches
  if (process.env.HUMAN_HANDOFF_ENABLED === 'false') {
    return { ok: false, error: 'Handoff a humano deshabilitado globalmente' };
  }

  const agent = ctx.agent as Record<string, unknown> | undefined;
  const trustStage = (agent?.trust_stage as number | null) ?? 3;
  if (trustStage <= 1) {
    return { ok: false, error: 'Trust Stage 1 no permite pedir a humano' };
  }

  // Feature flag per-agente (default true si trust_stage >= 2)
  const features = (agent?.features as Record<string, unknown> | undefined) ?? {};
  if (features.human_handoff_enabled === false) {
    return { ok: false, error: 'Handoff a humano deshabilitado para este empleado' };
  }

  // Anti-loop
  if (ctx.sourceInboxId) {
    const { count } = await supabase
      .from('human_requests')
      .select('*', { count: 'exact', head: true })
      .eq('source_inbox_id', ctx.sourceInboxId);
    if ((count ?? 0) >= MAX_REQUESTS_PER_INBOX) {
      return {
        ok: false,
        error: `Ya solicitaste ayuda ${MAX_REQUESTS_PER_INBOX} veces para este correo. Procede con lo que tienes o cancela.`,
      };
    }
  }

  // Resolver target_email
  let targetEmail: string | null = null;
  if (args.target === 'approver') {
    targetEmail = ((agent?.approval_email as string | null) ?? (agent?.client_email as string | null)) ?? null;
  } else if (args.target === 'owner') {
    targetEmail = (agent?.client_email as string | null) ?? null;
  } else if (args.target === 'specific' && args.target_email) {
    targetEmail = args.target_email;
  }

  if (!targetEmail) {
    return { ok: false, error: 'No hay destinatario configurado para este agente' };
  }

  // Org-level kill switch
  if (agent?.portal_email) {
    const { data: org } = await supabase
      .from('organizations')
      .select('human_handoff_disabled_at')
      .eq('portal_email', agent.portal_email as string)
      .maybeSingle();
    if (org?.human_handoff_disabled_at) {
      return { ok: false, error: 'Handoff deshabilitado para esta organización' };
    }
  }

  // INSERT
  const { data, error } = await supabase
    .from('human_requests')
    .insert({
      agent_id:        ctx.agentId,
      source_channel:  ctx.channel ?? 'email',
      source_inbox_id: ctx.sourceInboxId ?? null,
      source_call_id:  ctx.sourceCallId ?? null,
      source_context:  ctx.userContext?.slice(0, 500) ?? null,
      request_type:    args.type,
      title:           args.title.slice(0, 120),
      description:     args.description.slice(0, 2000),
      urgency:         args.urgency ?? 'media',
      needed_by:       args.needed_by ? new Date(args.needed_by).toISOString() : null,
      target_email:    targetEmail,
      target_type:     args.target,
      status:          'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[pedir_a_humano] insert failed:', error);
    return { ok: false, error: 'No se pudo registrar la solicitud' };
  }

  // Dispatch notif (non-blocking)
  void dispatchHumanRequestNotification(data.id).catch(err =>
    console.error('[pedir_a_humano] notify failed:', err)
  );

  return { ok: true, request_id: data.id, target_email: targetEmail };
}
```

- [ ] **Step 3: Crear stub temporal de notify**

Para que el import en Step 2 no rompa el typecheck antes de Task 5, crear un stub temporal:

Crear `src/lib/human-handoff/notify.ts` con solo el export:

```ts
// TEMP STUB — implementación completa en Task 5.
export async function dispatchHumanRequestNotification(_requestId: string): Promise<void> {
  console.log('[notify] STUB called for request', _requestId);
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/handlers/pedir-a-humano.ts src/lib/human-handoff/directory.ts src/lib/human-handoff/notify.ts
git commit -m "feat(tools): pedir_a_humano handler + directory generator + notify stub"
```

---

## Task 3: Registrar `pedir_a_humano` en executor + 3 canales

**Files:**
- Modify: `src/lib/tools/executor.ts` — añadir handler al switch
- Modify: `src/lib/ops/inbox-processor.ts` — añadir a `BASE_EMAIL_TOOLS` + injectar directorio
- Modify: `src/lib/voice/prompt-builder.ts` — añadir tool al Vapi assistant (via sync)
- Modify: `src/lib/whatsapp/prompt-builder.ts` — añadir tool a chat context

**Interfaces:**
- Consumes: `pedirAHumano` de Task 2, `buildInternalDirectoryString` de Task 2

- [ ] **Step 1: Registrar en `executor.ts`**

Localizar el switch de tools (`grep -n "case '" src/lib/tools/executor.ts | head`). Añadir:

```ts
case 'pedir_a_humano': {
  const { pedirAHumano } = await import('@/lib/tools/handlers/pedir-a-humano');
  return await pedirAHumano(args as Parameters<typeof pedirAHumano>[0], ctx);
}
```

- [ ] **Step 2: Añadir tool a `BASE_EMAIL_TOOLS` en inbox-processor**

Añadir al array (dentro de la lista de tools):

```ts
{
  name:        'pedir_a_humano',
  description: `Pide a un humano del equipo del negocio: info que no tienes, una acción física, o confirmación de una decisión importante.

Úsala CUANDO:
- Necesitas datos/archivos que no están en Drive ni puedes obtener con otras tools
- Requiere una acción FÍSICA que solo un humano puede hacer (revisar stock, firmar documento en papel)
- Requiere aprobación de una decisión que excede tu autoridad

Para llamadas telefónicas:
- Si tienes minutos disponibles Y toda la info → usa trigger_outbound_call, NO pidas a humano
- Solo pide llamada a humano si: sin minutos, cliente pidió humano, o conversación delicada

NO la uses para:
- Info obtenible con search_files, buscar_en_web, o QB
- Cosas que puede hacer otro agente (usa delegate_task)
- Llamadas que puedes hacer tú (usa trigger_outbound_call primero)`,
  input_schema: {
    type: 'object' as const,
    properties: {
      type:         { type: 'string', enum: ['info','action','approval'] },
      target:       { type: 'string', enum: ['approver','owner','specific'] },
      target_email: { type: 'string' },
      title:        { type: 'string' },
      description:  { type: 'string' },
      urgency:      { type: 'string', enum: ['baja','media','alta'] },
      needed_by:    { type: 'string' },
    },
    required: ['type','target','title','description'],
  },
},
```

- [ ] **Step 3: Injectar directorio interno en el system prompt de inbox-processor**

Localizar la construcción de `contextBlocks` en `processInboxEmail` (`grep -n "contextBlocks" src/lib/ops/inbox-processor.ts`). Añadir:

```ts
if (portalEmail) {
  const { buildInternalDirectoryString } = await import('@/lib/human-handoff/directory');
  const directory = await buildInternalDirectoryString(portalEmail);
  if (directory) contextBlocks.push(directory);
}
```

Colocar ANTES de `const contextSection = contextBlocks.length ? ...` para que quede en el prompt.

- [ ] **Step 4: Añadir tool en voz (sync a Vapi)**

Localizar `src/lib/voice/prompt-builder.ts` — específicamente el bloque que registra tools con Vapi. Añadir `pedir_a_humano` al set de tools por default (con feature flag `human_handoff_enabled`):

```ts
if (agent.features?.human_handoff_enabled !== false && (agent.trust_stage ?? 3) >= 2) {
  tools.push({
    type: 'function',
    function: {
      name: 'pedir_a_humano',
      description: '...',  // mismo prompt de inbox-processor
      parameters: { /* mismo input_schema */ }
    }
  });
}
```

Nota: la sync a Vapi (`updateVapiAssistant`) se dispara con `resync all` — el implementer no necesita corrrelo aquí, solo asegura que la tool se emita.

- [ ] **Step 5: Añadir tool en chat (WhatsApp prompt-builder)**

Localizar `src/lib/whatsapp/prompt-builder.ts` y añadir la tool al array de tools que Claude puede usar en respuestas de chat. Mismo shape que voz.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/executor.ts src/lib/ops/inbox-processor.ts src/lib/voice/prompt-builder.ts src/lib/whatsapp/prompt-builder.ts
git commit -m "feat(tools): register pedir_a_humano in 3 channels + inject directorio interno"
```

---

## Task 4: Notification pipeline (email + WA stub + call)

**Files:**
- Modify: `src/lib/human-handoff/notify.ts` — reemplazar stub con implementación real

**Interfaces:**
- Consumes: `sendEmail` (existente), Vapi client (existente)
- Produces:
  ```ts
  export async function dispatchHumanRequestNotification(requestId: string): Promise<void>;
  export async function sendReminderNotification(requestId: string): Promise<void>;
  export async function sendEscalationNotification(requestId: string, escalateToEmail: string): Promise<void>;
  ```

- [ ] **Step 1: Reemplazar el stub con implementación completa**

Reescribir `src/lib/human-handoff/notify.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

interface HumanRequest {
  id:             string;
  agent_id:       string;
  request_type:   'info' | 'action' | 'approval';
  title:          string;
  description:    string;
  urgency:        'baja' | 'media' | 'alta';
  target_email:   string;
  source_context: string | null;
  channels_notified: string[];
}

interface Agent {
  agent_name:   string;
  business_name: string;
  portal_token: string;
  features?:    Record<string, unknown> | null;
}

export async function dispatchHumanRequestNotification(requestId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from('human_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!request) { console.error('[notify] request not found', requestId); return; }
  if (request.status !== 'pending') { console.warn('[notify] non-pending, skip', requestId); return; }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, business_name, portal_token, features')
    .eq('id', request.agent_id)
    .single();
  if (!agent) { console.error('[notify] agent not found', request.agent_id); return; }

  const channels = (agent.features as Record<string, unknown> | null)?.notification_channels as Record<string, boolean> | undefined;
  const sendViaEmail = channels?.email !== false;   // default true
  const sendViaWA    = channels?.whatsapp === true;
  const sendViaCall  = channels?.call_on_high_urgency === true && request.urgency === 'alta';

  const dispatched: string[] = [];

  if (sendViaEmail) {
    try {
      await sendEmail({
        to:      request.target_email,
        subject: `[${agent.agent_name}] Necesito tu ayuda: ${request.title}`,
        html:    buildRequestEmailHtml(request as HumanRequest, agent as Agent),
      });
      dispatched.push('email');
    } catch (err) {
      console.error('[notify] email send failed:', err);
    }
  }

  if (sendViaWA) {
    // STUB: cuando WhatsApp salga de sandbox (spec §5.7)
    console.log('[notify] WA stub for request', requestId);
    dispatched.push('wa_stub');
  }

  if (sendViaCall) {
    // STUB: implementación de llamada via Vapi outbound queda para fase 2 según spec
    console.log('[notify] call stub for request', requestId);
    dispatched.push('call_stub');
  }

  await supabase
    .from('human_requests')
    .update({ channels_notified: dispatched })
    .eq('id', requestId);
}

export async function sendReminderNotification(requestId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: request } = await supabase.from('human_requests').select('*').eq('id', requestId).single();
  if (!request) return;
  const { data: agent } = await supabase.from('voice_agents').select('agent_name, portal_token').eq('id', request.agent_id).single();
  if (!agent) return;

  await sendEmail({
    to:      request.target_email,
    subject: `Recordatorio — ${agent.agent_name} sigue esperando: ${request.title}`,
    html:    buildReminderEmailHtml(request as HumanRequest, agent as Agent),
  });
}

export async function sendEscalationNotification(requestId: string, escalateToEmail: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: request } = await supabase.from('human_requests').select('*').eq('id', requestId).single();
  if (!request) return;
  const { data: agent } = await supabase.from('voice_agents').select('agent_name, business_name, portal_token').eq('id', request.agent_id).single();
  if (!agent) return;

  await sendEmail({
    to:      escalateToEmail,
    subject: `[Escalado] ${agent.agent_name} no ha recibido respuesta a: ${request.title}`,
    html:    buildEscalationEmailHtml(request as HumanRequest, agent as Agent, escalateToEmail),
  });
}

function requestUrl(portalToken: string, requestId: string): string {
  return `${BASE_URL}/portal/${portalToken}/requests/${requestId}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildRequestEmailHtml(req: HumanRequest, agent: Agent): string {
  const url = requestUrl(agent.portal_token, req.id);
  const typeLabel = { info: 'Necesita información', action: 'Necesita acción', approval: 'Necesita aprobación' }[req.request_type];
  const urgencyLabel = { baja: 'Baja', media: 'Media', alta: 'Alta' }[req.urgency];
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <p style="color:rgba(26,10,59,0.6);font-size:12px;margin:0 0 6px">${escapeHtml(agent.business_name)} · ${typeLabel} · Urgencia: ${urgencyLabel}</p>
      <h1 style="color:#1A0A3B;font-size:20px;font-weight:700;margin:0 0 16px">${escapeHtml(agent.agent_name)} necesita tu ayuda</h1>
      <div style="background:#F4F0FF;border-left:3px solid #6C3BFF;padding:16px;margin:0 0 20px">
        <p style="color:#1A0A3B;font-size:14px;font-weight:600;margin:0 0 8px">${escapeHtml(req.title)}</p>
        <p style="color:rgba(26,10,59,0.7);font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap">${escapeHtml(req.description)}</p>
      </div>
      ${req.source_context ? `<details style="margin:0 0 20px"><summary style="color:rgba(26,10,59,0.5);font-size:12px;cursor:pointer">Contexto (correo original)</summary><p style="color:rgba(26,10,59,0.6);font-size:12px;line-height:1.5;margin:8px 0 0;white-space:pre-wrap">${escapeHtml(req.source_context)}</p></details>` : ''}
      <div style="text-align:center">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Responder ahora</a>
      </div>
    </div>
  </div>
</body></html>`;
}

function buildReminderEmailHtml(req: HumanRequest, agent: Agent): string {
  const url = requestUrl(agent.portal_token, req.id);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(245,158,11,0.24);border-radius:12px;padding:28px">
      <h1 style="color:#1A0A3B;font-size:18px;font-weight:700;margin:0 0 12px">Recordatorio</h1>
      <p style="color:rgba(26,10,59,0.7);font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(agent.agent_name)} sigue esperando tu respuesta desde hace 24 horas:</p>
      <p style="color:#1A0A3B;font-size:14px;font-weight:600;margin:0 0 16px">${escapeHtml(req.title)}</p>
      <div style="text-align:center">
        <a href="${url}" style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Responder ahora</a>
      </div>
    </div>
  </div>
</body></html>`;
}

function buildEscalationEmailHtml(req: HumanRequest, agent: Agent, escalatedTo: string): string {
  const url = requestUrl(agent.portal_token, req.id);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(239,68,68,0.24);border-radius:12px;padding:28px">
      <p style="color:#dc2626;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Escalado a ti</p>
      <h1 style="color:#1A0A3B;font-size:18px;font-weight:700;margin:0 0 12px">${escapeHtml(agent.agent_name)} no recibió respuesta en 48 horas</h1>
      <p style="color:rgba(26,10,59,0.7);font-size:14px;line-height:1.6;margin:0 0 8px">Solicitud original a ${escapeHtml(req.target_email)}:</p>
      <p style="color:#1A0A3B;font-size:14px;font-weight:600;margin:0 0 16px">${escapeHtml(req.title)}</p>
      <p style="color:rgba(26,10,59,0.7);font-size:13px;line-height:1.6;margin:0 0 20px;white-space:pre-wrap">${escapeHtml(req.description)}</p>
      <div style="text-align:center">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Responder ahora</a>
      </div>
    </div>
  </div>
</body></html>`;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/human-handoff/notify.ts
git commit -m "feat(handoff): notification pipeline (email + WA stub + call stub) with reminder/escalation templates"
```

---

## Task 5: Respond endpoint

**Files:**
- Create: `src/app/api/portal/[token]/requests/[id]/respond/route.ts`

**Interfaces:**
- Consumes: `resumeAgentAfterHumanResponse` (Task 6, se creará después — usar dynamic import para evitar dependencia circular)
- Produces: PATCH endpoint que UPDATE `human_requests`, sube archivos a Storage, dispara resume

- [ ] **Step 1: Crear el endpoint**

Crear `src/app/api/portal/[token]/requests/[id]/respond/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchHumanRequestNotification } from '@/lib/human-handoff/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Params { params: Promise<{ token: string; id: string }> }

const BUCKET = 'human-request-files';

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  // Ownership: token → agent_id → request.agent_id
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_token', token)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: request } = await supabase
    .from('human_requests')
    .select('id, agent_id, source_inbox_id, source_channel, source_call_id, source_context, request_type, title, description, urgency, needed_by, status, target_email')
    .eq('id', id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (request.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (request.status !== 'pending' && request.status !== 'escalated') {
    return NextResponse.json({ ok: true, alreadyProcessed: true, status: request.status });
  }

  const body = await req.json().catch(() => ({})) as {
    response_text?:      string;
    response_files?:     { name: string; base64: string; mime_type: string }[];
    response_action?:    'done' | 'cannot_do' | 'partial';
    cancel?:             boolean;
    redirect_to_email?:  string;
    redirect_note?:      string;
  };

  // Redirect flow
  if (body.redirect_to_email) {
    const targetNew = body.redirect_to_email.trim().toLowerCase();
    if (targetNew === request.target_email.toLowerCase()) {
      return NextResponse.json({ error: 'no_self_redirect' }, { status: 400 });
    }
    // Chain check: máx 3 redirects (misma source_inbox_id)
    if (request.source_inbox_id) {
      const { count } = await supabase
        .from('human_requests')
        .select('*', { count: 'exact', head: true })
        .eq('source_inbox_id', request.source_inbox_id);
      if ((count ?? 0) >= 3) {
        // Force cancel de la actual, no INSERT new
        await supabase.from('human_requests').update({
          status: 'cancelled',
          cancellation_reason: 'redirect_chain_limit',
          cancelled_at: new Date().toISOString(),
        }).eq('id', id);
        return NextResponse.json({ error: 'redirect_chain_limit' }, { status: 400 });
      }
    }
    // Cancel current
    await supabase.from('human_requests').update({
      status: 'cancelled',
      cancellation_reason: `redirected_to:${targetNew}`,
      cancelled_at: new Date().toISOString(),
    }).eq('id', id);

    // Insert new
    const newDescription = body.redirect_note
      ? `${request.description}\n\n--- Redirigido desde ${request.target_email} con nota:\n${body.redirect_note}`
      : `${request.description}\n\n--- Redirigido desde ${request.target_email}`;

    const { data: newRow } = await supabase.from('human_requests').insert({
      agent_id:        request.agent_id,
      source_channel:  request.source_channel,
      source_inbox_id: request.source_inbox_id,
      source_call_id:  request.source_call_id,
      source_context:  request.source_context,
      request_type:    request.request_type,
      title:           request.title,
      description:     newDescription.slice(0, 2000),
      urgency:         request.urgency,
      needed_by:       request.needed_by,
      target_email:    targetNew,
      target_type:     'specific',
      status:          'pending',
    }).select('id').single();

    if (newRow) {
      void dispatchHumanRequestNotification(newRow.id).catch(err =>
        console.error('[respond] redirect notify failed:', err)
      );
    }

    return NextResponse.json({ ok: true, redirected_to: targetNew, new_request_id: newRow?.id });
  }

  // Cancel flow
  if (body.cancel) {
    await supabase.from('human_requests').update({
      status: 'cancelled',
      cancellation_reason: 'unable_to_help',
      cancelled_at: new Date().toISOString(),
    }).eq('id', id);
    // Trigger resume with "cannot help" context
    after(async () => {
      const { resumeAgentAfterHumanResponse } = await import('@/lib/human-handoff/resume');
      await resumeAgentAfterHumanResponse(id).catch(err => console.error('[respond] resume failed:', err));
    });
    return NextResponse.json({ ok: true, cancelled: true });
  }

  // Normal response
  const responseText = typeof body.response_text === 'string' ? body.response_text.slice(0, 4000) : null;
  const responseAction = body.response_action ?? null;

  // Upload files to Storage
  const uploadedFiles: { name: string; url: string; mime_type: string; size: number }[] = [];
  for (const f of body.response_files ?? []) {
    const path = `${id}/${Date.now()}-${f.name.replace(/[^a-z0-9._-]/gi, '_')}`;
    const buffer = Buffer.from(f.base64, 'base64');
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: f.mime_type,
      upsert: false,
    });
    if (upErr) {
      console.error('[respond] upload failed:', upErr);
      return NextResponse.json({ error: 'upload_failed', detail: upErr.message }, { status: 500 });
    }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30); // 30d
    uploadedFiles.push({ name: f.name, url: signed?.signedUrl ?? path, mime_type: f.mime_type, size: buffer.length });
  }

  const { error: updErr } = await supabase.from('human_requests').update({
    status:          'responded',
    response_text:   responseText,
    response_files:  uploadedFiles,
    response_action: responseAction,
    responded_at:    new Date().toISOString(),
  }).eq('id', id);

  if (updErr) {
    console.error('[respond] update failed:', updErr);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  // Trigger resume (non-blocking, via after)
  after(async () => {
    const { resumeAgentAfterHumanResponse } = await import('@/lib/human-handoff/resume');
    await resumeAgentAfterHumanResponse(id).catch(err => console.error('[respond] resume failed:', err));
  });

  return NextResponse.json({ ok: true, uploaded: uploadedFiles.length });
}
```

- [ ] **Step 2: Crear stub temporal de resume**

Similar a Task 2 — para que la dynamic import compile:

Crear `src/lib/human-handoff/resume.ts` con stub:

```ts
// TEMP STUB — implementación completa en Task 6.
export async function resumeAgentAfterHumanResponse(_requestId: string): Promise<void> {
  console.log('[resume] STUB called for request', _requestId);
}
```

- [ ] **Step 3: Crear el bucket Storage en Supabase**

Nazre corre en Supabase SQL Editor:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('human-request-files', 'human-request-files', false)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/[token]/requests/[id]/respond/route.ts src/lib/human-handoff/resume.ts
git commit -m "feat(handoff): respond endpoint with redirect + cancel + file upload"
```

---

## Task 6: Resume module (loop-close)

**Files:**
- Modify: `src/lib/human-handoff/resume.ts` — reemplazar stub con implementación real

**Interfaces:**
- Consumes: `processInboxEmail` (existente), schema Task 1
- Produces:
  ```ts
  export async function resumeAgentAfterHumanResponse(requestId: string): Promise<void>;
  ```

- [ ] **Step 1: Reemplazar stub**

Reescribir `src/lib/human-handoff/resume.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';

export async function resumeAgentAfterHumanResponse(requestId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from('human_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!request) { console.error('[resume] request not found', requestId); return; }

  const validStatuses = ['responded', 'cancelled', 'timeout'];
  if (!validStatuses.includes(request.status)) {
    console.warn('[resume] status not eligible', request.status);
    return;
  }

  if (request.source_channel !== 'email') {
    // Voice/chat resume queda para fase 2 (spec §5.8 no-goal MVP)
    console.log('[resume] source_channel', request.source_channel, 'not implemented in MVP');
    await supabase.from('human_requests').update({ resume_triggered_at: new Date().toISOString() }).eq('id', requestId);
    return;
  }

  if (!request.source_inbox_id) {
    console.error('[resume] email source without source_inbox_id', requestId);
    return;
  }

  // Fetch original inbox row + agent context
  const { data: inbox } = await supabase.from('ops_inbox').select('*').eq('id', request.source_inbox_id).single();
  if (!inbox) { console.error('[resume] source inbox not found', request.source_inbox_id); return; }

  const { data: agent } = await supabase.from('voice_agents').select('*').eq('id', request.agent_id).single();
  if (!agent) { console.error('[resume] agent not found', request.agent_id); return; }

  const { data: orgData } = agent.portal_email
    ? await supabase.from('organizations').select('knowledge_base').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };

  // Build enriched context
  let humanBlock = '';
  if (request.status === 'responded') {
    humanBlock = `\n\n--- Info adicional del equipo humano ---\nSolicitud: ${request.title}\nRespuesta de ${request.target_email}:\n${request.response_text ?? '(sin texto)'}`;
    if (request.response_files && Array.isArray(request.response_files) && request.response_files.length > 0) {
      const filesList = (request.response_files as Array<{name: string; url: string}>).map(f => `- ${f.name}: ${f.url}`).join('\n');
      humanBlock += `\nArchivos adjuntos:\n${filesList}`;
    }
    if (request.response_action) humanBlock += `\nAcción confirmada: ${request.response_action}`;
  } else if (request.status === 'cancelled') {
    humanBlock = `\n\n--- El humano NO pudo ayudar ---\nSolicitud original: ${request.title}\nRazón: ${request.cancellation_reason ?? 'no puedo ayudar'}\nProcede con lo que tienes o cancela la respuesta al cliente.`;
  } else if (request.status === 'timeout') {
    humanBlock = `\n\n--- Timeout: sin respuesta en 7 días ---\nSolicitud original: ${request.title}\nEl humano ${request.target_email} no respondió. Procede con la mejor respuesta posible sin esa info, o marca al cliente que no pudimos ayudar.`;
  }

  const effectiveBody = `${inbox.email_body ?? ''}${humanBlock}`.slice(0, 20000);

  try {
    await processInboxEmail({
      agentId:            request.agent_id,
      source:             inbox.source ?? 'gmail',
      rawMessageId:       inbox.raw_message_id ?? undefined,
      threadId:           inbox.thread_id ?? undefined,
      emailFrom:          inbox.email_from,
      emailSubject:       inbox.email_subject ?? '',
      emailBody:          effectiveBody,
      attachments:        (inbox.attachments as Array<{name: string; url: string; type: string; size: number}>) ?? [],
      agentName:          (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:       agent.business_name as string,
      knowledgeBase:      (orgData?.knowledge_base as string | null) ?? null,
      roleKB:             agent.role_knowledge_base as string | null,
      agentRole:          agent.role as string | null,
      ownerEmail:         agent.client_email as string,
      portalToken:        agent.portal_token as string,
      portalEmail:        agent.portal_email as string | undefined,
      approvalEmail:      (agent as Record<string, unknown>).approval_email as string | null | undefined,
      existingInboxId:    inbox.id,          // ← reutiliza row existente
      originalEmailBody:  inbox.email_body as string | undefined,
    });

    await supabase.from('human_requests').update({ resume_triggered_at: new Date().toISOString() }).eq('id', requestId);
  } catch (err) {
    console.error('[resume] processInboxEmail failed:', err);
    // Deja resume_triggered_at NULL; cron puede reintentar
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/human-handoff/resume.ts
git commit -m "feat(handoff): resume module (loop-close) for email channel"
```

---

## Task 7: Portal page + RespondForm client

**Files:**
- Create: `src/app/portal/[token]/requests/[id]/page.tsx`
- Create: `src/app/portal/[token]/requests/[id]/RespondForm.tsx`

**Interfaces:**
- Consumes: PATCH endpoint de Task 5, `/api/portal/[token]/users` (existente para dropdown redirect)

- [ ] **Step 1: Server page**

Crear `src/app/portal/[token]/requests/[id]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ThemeProvider } from '@/components/ThemeProvider';
import PortalFooter from '../../PortalFooter';
import RespondForm from './RespondForm';

interface Props { params: Promise<{ token: string; id: string }> }

export default async function RespondRequestPage({ params }: Props) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_token')
    .eq('portal_token', token)
    .maybeSingle();
  if (!agent) notFound();

  const { data: request } = await supabase
    .from('human_requests')
    .select('id, request_type, title, description, urgency, source_context, source_inbox_id, target_email, status, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!request || request.agent_id !== agent.id) notFound();

  // Fetch original email context if exists
  let originalEmail: { from: string; subject: string; body: string } | null = null;
  if (request.source_inbox_id) {
    const { data: inbox } = await supabase
      .from('ops_inbox')
      .select('email_from, email_subject, email_body')
      .eq('id', request.source_inbox_id)
      .maybeSingle();
    if (inbox) originalEmail = {
      from:    (inbox.email_from as string) ?? '',
      subject: (inbox.email_subject as string) ?? '',
      body:    (inbox.email_body as string) ?? '',
    };
  }

  return (
    <ThemeProvider>
      <div style={{ background: 'var(--c-bg-1)', minHeight: '100vh' }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <a href={`/portal/${token}/oficina/bandeja`} className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            ← Volver a bandeja
          </a>
          <h1 className="text-xl font-bold mt-3 mb-1" style={{ color: 'var(--c-text)' }}>
            {agent.agent_name} necesita tu ayuda
          </h1>
          <p className="text-xs mb-6" style={{ color: 'var(--c-text-3)' }}>
            urgencia: {request.urgency} · {new Date(request.created_at as string).toLocaleString('es-MX')}
          </p>
          <RespondForm
            token={token}
            requestId={id}
            requestType={request.request_type as 'info' | 'action' | 'approval'}
            title={request.title as string}
            description={request.description as string}
            originalEmail={originalEmail}
            status={request.status as string}
          />
        </div>
        <PortalFooter />
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Client form**

Crear `src/app/portal/[token]/requests/[id]/RespondForm.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Upload, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface SubUser {
  id: string;
  email: string;
  name: string | null;
  modules: string[] | null;
}

interface Props {
  token:        string;
  requestId:    string;
  requestType:  'info' | 'action' | 'approval';
  title:        string;
  description:  string;
  originalEmail: { from: string; subject: string; body: string } | null;
  status:       string;
}

export default function RespondForm(props: Props) {
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [action, setAction] = useState<'done' | 'cannot_do' | 'partial' | null>(null);
  const [approvalDecision, setApprovalDecision] = useState<'approved' | 'rejected' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRedirect, setShowRedirect] = useState(false);
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [redirectEmail, setRedirectEmail] = useState('');
  const [redirectNote, setRedirectNote] = useState('');
  const [redirectSearch, setRedirectSearch] = useState('');

  useEffect(() => {
    if (!showRedirect) return;
    fetch(`/api/portal/${props.token}/users`)
      .then(r => r.json())
      .then(d => setSubUsers((d.users ?? []).filter((u: SubUser & { is_owner?: boolean }) => !u.is_owner)))
      .catch(() => {});
  }, [showRedirect, props.token]);

  if (props.status !== 'pending' && props.status !== 'escalated') {
    return (
      <div className="p-6 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Esta solicitud ya fue procesada (estado: {props.status}).</p>
      </div>
    );
  }

  async function submit(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${props.token}/requests/${props.requestId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? 'Error'); }
      toast.success('Respuesta enviada');
      setTimeout(() => { window.location.href = `/portal/${props.token}/oficina/bandeja`; }, 800);
    } catch (err) {
      toast.error(`No se pudo enviar: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function submitResponse() {
    const filesPayload = await Promise.all(files.map(async f => ({
      name: f.name,
      mime_type: f.type,
      base64: await fileToBase64(f),
    })));
    await submit({
      response_text: notes.trim() || undefined,
      response_files: filesPayload,
      response_action: props.requestType === 'action' ? action : props.requestType === 'approval' ? (approvalDecision === 'approved' ? 'done' : 'cannot_do') : undefined,
    });
  }

  async function submitRedirect() {
    if (!redirectEmail.trim()) { toast.error('Ingresa un correo'); return; }
    await submit({ redirect_to_email: redirectEmail.trim(), redirect_note: redirectNote.trim() || undefined });
  }

  async function submitCancel() {
    if (!confirm('¿Marcar como "no puedo ayudar"? El empleado procederá sin esta info.')) return;
    await submit({ cancel: true });
  }

  const filteredUsers = subUsers.filter(u => {
    const q = redirectSearch.toLowerCase();
    return !q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="p-5 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--c-text)' }}>{props.title}</p>
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--c-text-2)', lineHeight: 1.6 }}>{props.description}</p>
      </div>

      {props.originalEmail && (
        <details className="p-4 rounded-xl border" style={{ background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--c-text-3)' }}>Contexto: correo original</summary>
          <p className="text-xs mt-2 mb-1" style={{ color: 'var(--c-text-3)' }}>De: {props.originalEmail.from}</p>
          <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Asunto: {props.originalEmail.subject}</p>
          <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--c-text-3)', lineHeight: 1.5 }}>{props.originalEmail.body.slice(0, 3000)}</p>
        </details>
      )}

      {!showRedirect && (
        <div className="p-5 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--c-text-4)' }}>Tu respuesta</p>

          {props.requestType === 'info' && (
            <>
              <label className="block mb-2">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Archivos (fotos, PDFs, etc.)</span>
                <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-sm" />
              </label>
              {files.length > 0 && <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>{files.length} archivo(s) seleccionado(s)</p>}
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Notas (opcional)</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} placeholder="Detalles adicionales para el empleado..." />
              </label>
            </>
          )}

          {props.requestType === 'action' && (
            <>
              <div className="flex flex-col gap-2 mb-3">
                {(['done','partial','cannot_do'] as const).map(a => (
                  <label key={a} className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text-2)' }}>
                    <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
                    {a === 'done' ? 'Ya lo hice' : a === 'partial' ? 'Solo parcialmente' : 'No pude hacerlo'}
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Resultado / notas</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} />
              </label>
            </>
          )}

          {props.requestType === 'approval' && (
            <>
              <div className="flex flex-col gap-2 mb-3">
                {(['approved','rejected'] as const).map(d => (
                  <label key={d} className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text-2)' }}>
                    <input type="radio" name="approval" value={d} checked={approvalDecision === d} onChange={() => setApprovalDecision(d)} />
                    {d === 'approved' ? 'Aprobado' : 'Rechazado'}
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Motivo / notas</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} />
              </label>
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={submitResponse} disabled={saving} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#6C3BFF', color: '#fff' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enviar respuesta
            </button>
            <button onClick={() => setShowRedirect(true)} disabled={saving} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: 'var(--c-border)', color: 'var(--c-text-2)' }}>
              Redirigir a alguien
            </button>
            <button onClick={submitCancel} disabled={saving} className="text-sm px-4 py-2 rounded-lg" style={{ color: '#dc2626' }}>
              No puedo ayudar
            </button>
          </div>
        </div>
      )}

      {showRedirect && (
        <div className="p-5 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>¿A quién redirigimos?</p>
          <input type="text" placeholder="Buscar empleado..." value={redirectSearch} onChange={e => setRedirectSearch(e.target.value)} className="w-full text-sm px-3 py-2 mb-3 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
          <div className="max-h-48 overflow-y-auto mb-3">
            {filteredUsers.map(u => (
              <label key={u.id} className="flex items-start gap-2 p-2 rounded-lg cursor-pointer hover:bg-black/5">
                <input type="radio" name="redirect_user" checked={redirectEmail === u.email} onChange={() => setRedirectEmail(u.email)} className="mt-1" />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{u.name ?? '(sin nombre)'}</div>
                  <div className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{u.email}{u.modules?.[0] ? ` · ${u.modules[0]}` : ''}</div>
                </div>
              </label>
            ))}
            {filteredUsers.length === 0 && <p className="text-xs p-2" style={{ color: 'var(--c-text-4)' }}>Sin empleados registrados. Puedes usar un correo externo abajo.</p>}
          </div>
          <div className="mb-3">
            <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>o correo externo:</p>
            <input type="email" placeholder="correo@externo.com" value={redirectEmail} onChange={e => setRedirectEmail(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
          </div>
          <label className="block mb-3">
            <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Nota (opcional):</span>
            <textarea value={redirectNote} onChange={e => setRedirectNote(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 60 }} />
          </label>
          <div className="flex gap-2">
            <button onClick={submitRedirect} disabled={saving || !redirectEmail.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#6C3BFF', color: '#fff' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Redirigir
            </button>
            <button onClick={() => setShowRedirect(false)} disabled={saving} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: 'var(--c-border)', color: 'var(--c-text-2)' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.split(',')[1] ?? '');
    };
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/\[token\]/requests/
git commit -m "feat(portal): request response page with redirect dropdown + file upload"
```

---

## Task 8: Cron `human-requests-monitor`

**Files:**
- Create: `src/app/api/cron/human-requests-monitor/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `sendReminderNotification`, `sendEscalationNotification` de Task 4; `resumeAgentAfterHumanResponse` de Task 6

- [ ] **Step 1: Crear el cron**

Crear `src/app/api/cron/human-requests-monitor/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendReminderNotification, sendEscalationNotification } from '@/lib/human-handoff/notify';
import { resumeAgentAfterHumanResponse } from '@/lib/human-handoff/resume';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = createAdminClient();
  const now = new Date();
  const dayAgo    = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const weekAgo    = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const results = { reminded: 0, escalated: 0, timed_out: 0, errors: 0 };

  // 1. Reminders
  const { data: needReminder } = await supabase
    .from('human_requests')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', dayAgo.toISOString())
    .is('reminded_at', null);

  for (const req of needReminder ?? []) {
    try {
      await sendReminderNotification(req.id as string);
      await supabase.from('human_requests').update({ reminded_at: now.toISOString() }).eq('id', req.id as string);
      results.reminded++;
    } catch (err) { console.error(`[hrm] reminder failed ${req.id}:`, err); results.errors++; }
  }

  // 2. Escalations
  const { data: needEscalation } = await supabase
    .from('human_requests')
    .select('id, agent_id')
    .eq('status', 'pending')
    .lt('created_at', twoDaysAgo.toISOString());

  for (const req of needEscalation ?? []) {
    try {
      const { data: agent } = await supabase.from('voice_agents').select('client_email').eq('id', req.agent_id as string).single();
      if (!agent?.client_email) continue;
      await sendEscalationNotification(req.id as string, agent.client_email as string);
      await supabase.from('human_requests').update({
        status: 'escalated', escalated_to_email: agent.client_email as string, escalated_at: now.toISOString(),
      }).eq('id', req.id as string);
      results.escalated++;
    } catch (err) { console.error(`[hrm] escalation failed ${req.id}:`, err); results.errors++; }
  }

  // 3. Timeouts
  const { data: needTimeout } = await supabase
    .from('human_requests')
    .select('id')
    .in('status', ['pending', 'escalated'])
    .lt('created_at', weekAgo.toISOString());

  for (const req of needTimeout ?? []) {
    try {
      await supabase.from('human_requests').update({
        status: 'timeout', cancelled_at: now.toISOString(), cancellation_reason: 'auto_timeout_7d',
      }).eq('id', req.id as string);
      await resumeAgentAfterHumanResponse(req.id as string);
      results.timed_out++;
    } catch (err) { console.error(`[hrm] timeout failed ${req.id}:`, err); results.errors++; }
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Añadir entry en `vercel.json`**

```json
{ "path": "/api/cron/human-requests-monitor", "schedule": "0 */2 * * *" }
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/api/cron/human-requests-monitor/ vercel.json
git commit -m "feat(cron): human-requests-monitor (reminders + escalations + timeouts) every 2h"
```

---

## Task 9: Bandeja tabs (Pendientes / Auto-enviados / Todo)

**Files:**
- Modify: `src/app/portal/[token]/OpsInboxSection.tsx`
- Modify: `src/app/api/portal/[token]/ops-inbox/route.ts`

**Interfaces:**
- Consumes: schema Task 1 (`human_requests`)

- [ ] **Step 1: Extender el endpoint API para incluir human_requests**

Modificar `src/app/api/portal/[token]/ops-inbox/route.ts` GET handler:

Después de fetch del `ops_inbox`, añadir:

```ts
const { data: humanReqs } = await supabase
  .from('human_requests')
  .select('id, agent_id, request_type, title, description, urgency, target_email, status, created_at')
  .in('agent_id', access.ids)
  .eq('status', 'pending')
  .order('created_at', { ascending: false });

return NextResponse.json({
  items: opsInboxItems,
  humanRequests: humanReqs ?? [],
});
```

- [ ] **Step 2: Añadir tabs al componente**

En `OpsInboxSection.tsx`, envolver el listing existente en un tab system:

```tsx
const [activeTab, setActiveTab] = useState<'pendientes' | 'auto' | 'todo'>('pendientes');

// Fetch humanRequests along with items
// ...

const filteredItems = activeTab === 'pendientes'
  ? items.filter(i => ['pending', 'escalated', 'info_requested'].includes(i.status))
  : activeTab === 'auto'
    ? items.filter(i => i.status === 'auto_replied' && i.auto_mode_decision === 'send')
    : items;

return (
  <div>
    <div className="flex gap-4 border-b mb-4">
      {(['pendientes', 'auto', 'todo'] as const).map(t => (
        <button key={t} onClick={() => setActiveTab(t)}
          className={`text-sm px-3 py-2 border-b-2 ${activeTab === t ? 'border-[#6C3BFF] font-semibold' : 'border-transparent'}`}
          style={{ color: activeTab === t ? 'var(--c-text)' : 'var(--c-text-3)' }}>
          {t === 'pendientes' ? 'Pendientes' : t === 'auto' ? 'Auto-enviados' : 'Todo'}
          {t === 'pendientes' && ` (${filteredItems.length + humanRequests.length})`}
        </button>
      ))}
    </div>

    {activeTab === 'pendientes' && humanRequests.length > 0 && (
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
          Pendientes tuyos
        </p>
        {humanRequests.map(hr => (
          <a key={hr.id} href={`/portal/${token}/requests/${hr.id}`}
            className="block p-3 rounded-lg border mb-2 hover:opacity-80"
            style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{hr.title}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{hr.request_type} · {hr.urgency}</p>
              </div>
              <span className="text-xs" style={{ color: '#6C3BFF' }}>Responder</span>
            </div>
          </a>
        ))}
      </div>
    )}

    {/* Existing ops_inbox items rendering */}
    {filteredItems.map(item => /* existing render */)}
  </div>
);
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/portal/\[token\]/OpsInboxSection.tsx src/app/api/portal/\[token\]/ops-inbox/route.ts
git commit -m "feat(bandeja): tabs Pendientes/Auto-enviados/Todo + human_requests section"
```

---

## Task 10: Spam filter enhancement (Q4)

**Files:**
- Modify: `src/lib/ops/email-quick-classify.ts` — patrones más agresivos
- Modify: `src/lib/ops/inbox-processor.ts` — Haiku prompt endurecido

- [ ] **Step 1: Endurecer `quickClassifyEmail`**

Localizar el archivo, añadir/extender patterns:

```ts
const PROMO_SENDER_REGEX = /@(promociones?|promo|marketing|newsletter|noreply|no-reply|notifications?|hello|hi|team|info|hola|ofertas?|deals?|updates?)\./i;
const BULK_SENDER_REGEX  = /@.*\.(mailchimp|sendgrid|constantcontact|hubspot|marketo|braze|iterable|klaviyo|convertkit)\./i;
const RETAILER_DOMAINS = new Set([
  'officedepot.com', 'liverpool.com.mx', 'amazon.com', 'mercadolibre.com',
  'sears.com.mx', 'walmart.com.mx', 'coppel.com', 'palacio.com.mx',
  'booking.com', 'expedia.com', 'groupon.com.mx', 'cinepolis.com',
  'grouponmx.com', 'zapatoo.com.mx', 'aeromexico.com', 'volaris.com',
]);
const SUBJECT_PROMO_REGEX = /(oferta|descuento|% off|black friday|hot sale|promo|cup[oó]n|last chance|limited time|regalo|gana|precio especial|liquidaci[oó]n)/i;
const SUBJECT_EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function quickClassifyEmail(email: { from: string; subject: string; body: string }): { category: 'spam' | null; reason?: string } {
  const from = email.from.toLowerCase();
  const subject = email.subject ?? '';
  const body = email.body ?? '';

  if (PROMO_SENDER_REGEX.test(from)) return { category: 'spam', reason: 'promo_sender' };
  if (BULK_SENDER_REGEX.test(from))  return { category: 'spam', reason: 'bulk_provider' };
  const domain = from.split('@')[1]?.split('>')[0]?.trim();
  if (domain && RETAILER_DOMAINS.has(domain)) return { category: 'spam', reason: 'retailer_domain' };
  if (SUBJECT_PROMO_REGEX.test(subject)) return { category: 'spam', reason: 'subject_promo' };
  if (SUBJECT_EMOJI_REGEX.test(subject)) return { category: 'spam', reason: 'subject_emoji' };
  if (/list-unsubscribe|precedence:\s*bulk|x-campaign-id/i.test(body.slice(0, 500))) return { category: 'spam', reason: 'bulk_headers_in_body' };

  return { category: null };
}
```

- [ ] **Step 2: Endurecer el prompt de Haiku en inbox-processor**

Localizar `systemPrompt` en `processInboxEmail`. Añadir sección:

```ts
const systemPrompt = `Eres ${agentName}, empleado de oficina de ${businessName}. Analizas emails entrantes y produces JSON con la categoría, resumen y borrador de respuesta.${contextSection}

Categorías: proveedor, cliente, urgente, factura, spam, otro.
- "urgente": emergencias, quejas graves, solicitudes de alta prioridad.
- "factura": cualquier email con factura, cargo o solicitud de pago de un proveedor.

MARCA COMO 'spam' TODO CORREO QUE NO REQUIERE ATENCIÓN DEL EQUIPO:
- Publicidad/promociones de tiendas, marcas, o servicios que NO son proveedores actuales
- Newsletters, blog updates, product announcements de servicios que NO usa el negocio
- Notificaciones automáticas de plataformas que NO son operacionales
  (LinkedIn "añade a...", Google Analytics reports, security alerts genéricas)
- Ofertas comerciales frías (cold outreach de vendedores externos)
- Contenido educativo/motivacional no solicitado

MARCA COMO 'otro' SOLO si es de trabajo pero no encaja en las otras 4 categorías.
Si dudas entre 'spam' y 'otro', piensa: "¿el equipo tiene que hacer algo con esto?".
Si no, es spam. Mejor archivar de más que llenar la bandeja con ruido.

... [resto del prompt existente]`;
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/ops/email-quick-classify.ts src/lib/ops/inbox-processor.ts
git commit -m "feat(spam): stricter quickClassify patterns + Haiku prompt more aggressive with spam"
```

---

## Task 11: Spam folder opt-in (Q5) — connectors + email-sync + inbox-processor

**Files:**
- Modify: `src/lib/connectors/types.ts` — extender interface
- Modify: `src/lib/connectors/google.ts` — implementar folder=spam + unmarkSpam
- Modify: `src/lib/connectors/microsoft.ts` — implementar folder=spam + unmarkSpam
- Modify: `src/lib/email/email-sync.ts` — sync opcional con rate limit
- Modify: `src/lib/ops/inbox-processor.ts` — handle fromSpamFolder flag

**Interfaces:**
- Consumes: nada nuevo (ya extiende existentes)

- [ ] **Step 1: Extender `EmailConnector` interface**

En `src/lib/connectors/types.ts`:

```ts
export interface EmailConnector {
  fetchUnread(since: Date, folder?: 'inbox' | 'spam'): Promise<EmailMessage[]>;
  unmarkSpam?(messageId: string): Promise<void>;  // opcional, default no-op
  // ... resto existente
}
```

- [ ] **Step 2: Implementar en Gmail (`google.ts`)**

Localizar el método `fetchUnread`. Extender:

```ts
async fetchUnread(since: Date, folder: 'inbox' | 'spam' = 'inbox'): Promise<EmailMessage[]> {
  const labelId = folder === 'spam' ? 'SPAM' : 'INBOX';
  const q = `is:unread label:${labelId} newer_than:${daysSince(since)}d`;
  // ... resto del fetch pero con q modificado
}

async unmarkSpam(messageId: string): Promise<void> {
  await this.client.users.messages.modify({
    userId: 'me',
    id:     messageId,
    requestBody: { removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] },
  });
}
```

- [ ] **Step 3: Implementar en Outlook (`microsoft.ts`)**

```ts
async fetchUnread(since: Date, folder: 'inbox' | 'spam' = 'inbox'): Promise<EmailMessage[]> {
  const folderName = folder === 'spam' ? 'JunkEmail' : 'Inbox';
  const url = `/me/mailFolders/${folderName}/messages?$filter=isRead eq false and receivedDateTime ge ${since.toISOString()}`;
  // ... resto
}

async unmarkSpam(messageId: string): Promise<void> {
  // Move from JunkEmail to Inbox
  await this.graphClient.api(`/me/messages/${messageId}/move`).post({
    destinationId: 'inbox',
  });
}
```

- [ ] **Step 4: Modificar `email-sync.ts` para sync condicional de Spam**

Después del sync de Inbox, añadir:

```ts
const features = (agent.features as Record<string, unknown> | null) ?? {};
const checkSpam = features.check_spam_folder === true;

if (checkSpam) {
  // Rate limit: check last_spam_sync_at metadata
  const lastSpamSync = (integration.metadata as Record<string, unknown> | undefined)?.last_spam_sync_at as string | undefined;
  const canSyncSpam = !lastSpamSync || (Date.now() - new Date(lastSpamSync).getTime()) > 30 * 60 * 1000;

  if (canSyncSpam) {
    const spamMessages = await conn.email.fetchUnread(since, 'spam');
    for (const msg of spamMessages) {
      // Skip if already in ops_inbox
      const { data: existing } = await supabase.from('ops_inbox').select('id').eq('agent_id', agent.id).eq('raw_message_id', msg.id).maybeSingle();
      if (existing) continue;

      await processInboxEmail({
        // ... mismos params que Inbox sync
        fromSpamFolder: true,
      });
    }
    // Update last_spam_sync_at en integration_accounts.metadata
    await supabase.from('email_integrations').update({
      metadata: { ...(integration.metadata as object), last_spam_sync_at: new Date().toISOString() },
    }).eq('id', integration.id);
  }
}
```

- [ ] **Step 5: Modificar `inbox-processor.ts` para handle `fromSpamFolder`**

Añadir param `fromSpamFolder?: boolean`. Cuando true:
- Skip `quickClassifyEmail` (ya viene flagged por proveedor)
- Prompt enriquecido con nota "este correo fue marcado spam por el proveedor, evalúa"
- Si Haiku clasifica no-spam: llamar `conn.email.unmarkSpam(rawMessageId)`, insertar con `source_folder='spam_rescued'`
- Si Haiku confirma spam: insertar con `status='skipped'`, `source_folder='spam_confirmed'`

Cambios en la lógica del router de status y el INSERT:

```ts
if (fromSpamFolder) {
  // Skip quickClassify
} else {
  // ... existing quickClassify block
}

// After Haiku, before INSERT:
const finalSourceFolder = fromSpamFolder
  ? (result.category === 'spam' ? 'spam_confirmed' : 'spam_rescued')
  : 'inbox';

// If rescued, unmark in provider (best-effort)
if (fromSpamFolder && result.category !== 'spam' && rawMessageId) {
  // Best-effort: import connector, call unmarkSpam
  // Se hace después del INSERT para no bloquear
}

// INSERT with source_folder: finalSourceFolder
```

- [ ] **Step 6: Type-check + commit**

```bash
npx tsc --noEmit
git add src/lib/connectors/ src/lib/email/email-sync.ts src/lib/ops/inbox-processor.ts
git commit -m "feat(spam): opt-in spam folder sync with unmarkSpam + rate limit + rescue tracking"
```

---

## Task 12: UI toggle para check_spam_folder + cost callout

**Files:**
- Modify: `src/app/portal/[token]/configurar/page.tsx` — añadir toggle en sección Correo
- Create: `src/app/portal/[token]/SpamFolderToggle.tsx` — client component

**Interfaces:**
- Consumes: PATCH `/api/portal/[token]/settings` (existente)

- [ ] **Step 1: Extender allowed fields en settings API si es necesario**

En `src/app/api/portal/[token]/settings/route.ts`, el toggle escribe a `features.check_spam_folder`. Como `features` es JSONB gestionado por `featureJsonKeys`, añadir `check_spam_folder` a esa lista:

```ts
const featureJsonKeys = ['outbound_calls', 'role_color', 'avatar', 'check_spam_folder'];
```

- [ ] **Step 2: Crear el componente toggle**

Crear `src/app/portal/[token]/SpamFolderToggle.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CostStats { revisados: number; rescatados: number; ops_consumidas: number }

export default function SpamFolderToggle({
  token, initial, stats,
}: {
  token: string; initial: boolean; stats: CostStats | null;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_spam_folder: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? 'Revisará también la carpeta Spam' : 'Ya no revisará Spam');
    } catch {
      setEnabled(!next);
      toast.error('No se pudo actualizar');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>Revisar carpeta de Spam</p>
        <button onClick={toggle} disabled={saving}
          className="w-10 h-6 rounded-full transition-colors relative"
          style={{ background: enabled ? '#6C3BFF' : 'var(--c-border)' }}>
          <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{ left: enabled ? '20px' : '4px' }} />
          {saving && <Loader2 size={10} className="animate-spin absolute inset-0 m-auto" style={{ color: '#fff' }} />}
        </button>
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)', lineHeight: 1.5 }}>
        Gmail/Outlook a veces marcan correos legítimos como spam por error. Activar para que tu empleado también revise esa carpeta y rescate lo importante.
      </p>
      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
        Costo estimado: ~30-50 ops adicionales/mes según volumen.
      </p>
      {enabled && stats && stats.revisados > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--c-border)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--c-text-3)' }}>Última semana:</p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {stats.revisados} correos revisados · {stats.rescatados} rescatados · {stats.ops_consumidas} ops consumidas
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrar en configurar page**

En `src/app/portal/[token]/configurar/page.tsx`, dentro de la sección Correo (después del SendAsEmailEditor), añadir:

```tsx
import SpamFolderToggle from '../SpamFolderToggle';

// En el server component, fetch stats:
const { data: spamStats } = await supabase.rpc('spam_folder_stats_7d', { p_agent_id: agent.id }).maybeSingle().catch(() => ({ data: null }));
// Alternativa sin RPC: query inline
const { count: revisados } = await supabase.from('ops_inbox').select('*', { count: 'exact', head: true })
  .eq('agent_id', agent.id).like('source_folder', 'spam%').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
const { count: rescatados } = await supabase.from('ops_inbox').select('*', { count: 'exact', head: true })
  .eq('agent_id', agent.id).eq('source_folder', 'spam_rescued').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
const spamCheckEnabled = ((agent.features as Record<string, unknown>)?.check_spam_folder) === true;

// En el render, después de SendAsEmailEditor:
<SpamFolderToggle
  token={token}
  initial={spamCheckEnabled}
  stats={{ revisados: revisados ?? 0, rescatados: rescatados ?? 0, ops_consumidas: Math.round((revisados ?? 0) * 0.3) }}
/>
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/app/portal/\[token\]/SpamFolderToggle.tsx src/app/portal/\[token\]/configurar/page.tsx src/app/api/portal/\[token\]/settings/route.ts
git commit -m "feat(portal): toggle check_spam_folder with cost callout + 7d stats"
```

---

## Task 13: Smoke test + Golden tests

**Files:**
- Create: `scripts/smoke/pedir-a-humano.ts`
- Create: `scripts/eval/cases/pedir-a-humano/*.json` (10 fixtures)
- Create: `scripts/eval/run-pedir-a-humano.ts`

**Interfaces:**
- Consumes: `pedirAHumano` de Task 2

- [ ] **Step 1: Crear smoke test**

Crear `scripts/smoke/pedir-a-humano.ts` (usa mock del Supabase — para prod-ready testing usar golden):

```ts
/**
 * Smoke test del handler pedir_a_humano.
 * Testea guards y validación básica. NO hace INSERT real.
 * Ejecutar: npx tsx scripts/smoke/pedir-a-humano.ts
 */

async function main() {
  console.log('Smoke test manual: verificar en local que:');
  console.log('1. Kill switch env HUMAN_HANDOFF_ENABLED=false → tool retorna error');
  console.log('2. Trust stage 1 → tool retorna error');
  console.log('3. Anti-loop: 4to intento sobre mismo source_inbox_id → error');
  console.log('4. Target sin email seteado → error');
  console.log('5. Happy path → row creada, notif disparada');
  console.log('');
  console.log('Este smoke es informativo. Para tests reales usar golden runner:');
  console.log('  npx tsx scripts/eval/run-pedir-a-humano.ts');
  process.exit(0);
}

void main();
```

- [ ] **Step 2: Crear fixtures golden — 10 archivos**

Crear `scripts/eval/cases/pedir-a-humano/01-cliente-pide-fotos.json`:

```json
{
  "id": "01-cliente-pide-fotos",
  "description": "Cliente pide fotos que el agente NO tiene en Drive → debe llamar pedir_a_humano",
  "should_call_tool": true,
  "email": {
    "from": "cliente@x.com",
    "subject": "Fotos del producto SKU-A214",
    "body": "Antes de decidir, ¿me pueden enviar 3 fotos del producto SKU-A214 en distintos ángulos? Gracias."
  },
  "expected_tool_args": {
    "type": "info",
    "target": "approver"
  }
}
```

Repetir para 02-10 con casos que cubran:
- 02: descuento fuera de autoridad → should_call, type='approval'
- 03: cliente pide llamada + agente sin minutos → should_call, type='action'
- 04: cliente pide llamada + agente CON minutos → should_NOT_call (usar trigger_outbound_call)
- 05: info en Drive → should_NOT_call
- 06: consulta rutinaria de horarios → should_NOT_call
- 07: reclamo grave que necesita juicio humano → should_call, type='action' o 'approval'
- 08: revisar contrato físico → should_call, type='action'
- 09: pedido con SKU no existente → should_call, type='info'
- 10: confirmación de acuse → should_NOT_call

- [ ] **Step 3: Crear runner golden**

Crear `scripts/eval/run-pedir-a-humano.ts` — similar al pattern de `run-email-classifier.ts` de la sesión anterior. Corre cada fixture contra Haiku, mide precision/recall del uso de la tool.

- [ ] **Step 4: Correr y ajustar prompt**

```bash
npx tsx scripts/eval/run-pedir-a-humano.ts
```

Metas: recall en should_call ≥ 90%, precision en should_NOT_call ≥ 85%.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke/pedir-a-humano.ts scripts/eval/cases/pedir-a-humano/ scripts/eval/run-pedir-a-humano.ts
git commit -m "test(handoff): smoke + 10 golden fixtures for pedir_a_humano"
```

---

## Task 14: Runbook + rollout ops (requiere Nazre)

**Files:**
- Create: `docs/runbooks/human-handoff.md`

Similar patrón al runbook de auto-mode-classifier. Documenta:

- Kill switches (global env, per-org, per-agent, trust stage)
- Rollout escalonado según spec §11 (Sofía piloto 48h → 3-5 clientes → default true)
- Query de monitoring semanal
- Kill triggers (timeout rate > 30%, precision < 70% en golden, quejas de clientes)
- Guía para reactivar / desactivar
- Deploy 1 checklist + Deploy 2 checklist

**Operacional (Nazre + orquestador):**

1. Deploy 1: código + migration SQL + bucket Storage
2. Piloto 48h: enable `features.human_handoff_enabled=true` en Sofía. Probar 3 flujos manualmente (info, action, approval)
3. Rollout gradual: 3-5 clientes trust_stage=3
4. Rollout completo: default true para trust_stage>=2 nuevos
5. Fase 2 (post-MVP): WhatsApp real cuando salga de sandbox, UI config canales

- [ ] **Step 1: Escribir el runbook**

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/human-handoff.md
git commit -m "docs(runbook): operational guide for human-handoff"
```

---

## Self-Review

### Spec coverage

| Spec section | Task |
|---|---|
| §5.1 human_requests table + org kill + source_folder | Task 1 |
| §5.2 pedir_a_humano tool + handler + directory | Task 2 |
| §5.2 register in 3 channels | Task 3 |
| §5.7 notify pipeline | Task 4 |
| §5.3 respond endpoint | Task 5 |
| §5.8 resume module | Task 6 |
| §5.4 portal page + form + redirect | Task 7 |
| §5.5 cron monitor | Task 8 |
| §5.6 bandeja tabs | Task 9 |
| §5.9 spam filter (Q4) | Task 10 |
| §5.10 spam folder opt-in (Q5) — connectors + sync + processor | Task 11 |
| §5.10 UI toggle + cost callout | Task 12 |
| §9 testing (smoke + golden) | Task 13 |
| §11 rollout | Task 14 |

### Placeholder scan

- No TBD/TODO markers.
- Task 11 Step 5 tiene lógica pseudo-código para "handle fromSpamFolder" — el implementer debe integrar con el flujo existente. Marcado con comentario claro.
- Task 13 Step 2 lista los 10 fixtures por descripción; el implementer los redacta con contenido realista de Pneuma Studio (o el ferretería context del spec de auto-mode). Aceptable — es contenido creativo, no hay una "verdad" del brief.

### Type consistency

- `PedirAHumanoArgs`, `PedirAHumanoResult`, `ExecCtx` — consistentes Task 2 ↔ Task 3
- `dispatchHumanRequestNotification`, `sendReminderNotification`, `sendEscalationNotification` — consistentes Task 4 ↔ Task 8
- `resumeAgentAfterHumanResponse` — consistente Task 6 ↔ Task 5 ↔ Task 8
- `EmailConnector.fetchUnread(since, folder?)` — consistente Task 11 en 3 files
- `EmailConnector.unmarkSpam(messageId)` — opcional en interface, implementado en google.ts y microsoft.ts

## Notes for implementer

- **Merge oportunidades:** Tasks 2 + 3 podrían mergearse si el reviewer prefiere atomic (el executor.ts modification depende del handler). Yo los separo porque son deliverables reviewables independientemente.
- **Task 11 tamaño:** es grande (5 archivos modificados). Si crece el diff, considera splitear en Task 11a (connectors + types) y Task 11b (email-sync + inbox-processor).
- **Task 12 depends on Task 11 landed** — si Task 11 no despliega, el toggle activa una feature no funcional.
- **Deploy order recommendation:** SQL → Task 2/3 (tool base) → Task 4 (notify) → Task 5/6/7 (respond flow) → Task 8 (cron) → Task 9 (bandeja) → Task 10 (spam filter) → Task 11 (spam folder) → Task 12 (toggle UI) → Task 13 (testing) → Task 14 (runbook + rollout).
