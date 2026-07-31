# Human Handoff — Design Spec

**Fecha:** 2026-07-30
**Autor:** Nazre + Claude (brainstorming session)
**Estado:** Approved for implementation planning
**Iniciativa:** Extensión natural del [Sistema Nervioso](../../../memory/project_centinelia_vision_nervous_system.md) — cómo el empleado autónomo se comunica con humanos cuando los necesita.

## 1. Problema

Durante el piloto del auto-mode classifier detectamos 3 gaps de la misma familia:

- **Q1 (ruido de modo autónomo):** Trust Stage 3 con classifier auto-enviando correos, pero TODO sigue aterrizando en la bandeja de oficina. El aprobador se satura de items que no requieren su acción.
- **Q2 (info faltante del humano):** el empleado detecta que necesita info/asset que solo un humano tiene (fotos de producto, credenciales, decisión comercial). Hoy `needs_info + escalate_to_approver` manda correo al aprobador pero cero flujo de "aprobador sube foto → empleado la incorpora → responde al cliente".
- **Q3 (acción física del humano):** el empleado necesita que un humano EJECUTE algo (llamar al cliente, revisar contrato físico, verificar stock en almacén). Zero mecanismo formal.

Los 3 requieren el mismo pattern: agent → request específica → humano correcto → respuesta → agent continúa flujo.

**Bonus problems (misma familia, se resuelven en el mismo spec):**

- **Q4 (correos irrelevantes al negocio):** promociones de Office Depot, newsletters de servicios no relacionados, spam comercial saturan la bandeja incluso con `quickClassifyEmail` actual.
- **Q5 (correos legítimos en carpeta Spam):** falsos positivos del filtro de Gmail/Outlook hacen que correos de clientes reales nunca lleguen al empleado.

## 2. Objetivo

Diseñar el mecanismo unificado de handoff empleado ↔ humano:

- Nueva tool `pedir_a_humano` disponible en 3 canales (voz, chat, email)
- Nueva tabla `human_requests` con estado + timeouts + escalación
- Portal UI para responder con archivos / texto / acciones (o redirigir a otro humano)
- Loop-close: cuando humano responde, agent retoma automáticamente con la nueva info
- Bandeja tabs (Pendientes / Auto-enviados / Todo) para separar señal de ruido
- Filtros de spam más agresivos + opt-in de revisar carpeta Spam del proveedor

Aplica a Trust Stage 2 (Supervisado) Y 3 (Autónomo). Stage 1 (Observador) queda excluido (no redacta ni pide).

## 3. Decisiones tomadas (bright lines)

| Decisión | Elección |
|---|---|
| Enfoque técnico | Tool-based: nuevo `pedir_a_humano` en el executor (consistente con `delegar_tarea`, `buscar_en_web`, etc.) |
| Canales notif | Email (día 1) + WhatsApp (stub para futuro) + Llamada telefónica vía Vapi (solo urgencia alta) |
| Response del humano | Híbrido: link a portal para forms complejos (upload archivos, acción con notas), reply-al-correo para respuestas triviales |
| Data model | Nueva tabla `human_requests` (no extender `ops_inbox` ni `agent_tasks`) |
| Loop close | Inmediato: PATCH del portal dispara re-run del agent en background via `after()` |
| Timeouts | 24h reminder → 48h escalate al owner → 7d auto-cancel |
| Bandeja | Tabs: Pendientes (default) / Auto-enviados / Todo |
| Tipos de request | 3 desde MVP: `info`, `action`, `approval` |
| Prioridad llamada telefónica | Solo si urgency='alta' Y agent tiene minutos disponibles Y target tiene phone |
| Redirect | Humano puede redirigir a otro humano (dropdown de sub-usuarios + fallback email libre) |
| Filtro spam | Endurecer `quickClassifyEmail` + prompt Haiku más agresivo + contexto de negocio en decisión |
| Carpeta Spam | Opt-in per-agente via `features.check_spam_folder`, con cost callout en UI |

## 4. Arquitectura

**Flujo end-to-end (happy path — info request):**

```
1. Correo entra → email-sync → inbox-processor
2. Haiku analiza + tool loop. Invoca:
      pedir_a_humano({ type:'info', target:'approver', description:'...' })
3. Executor crea row en human_requests + dispara notif por canal(es) prioritarios
4. Notif email/WA/call llega al humano con link al portal
5. Humano abre link → /portal/[token]/requests/[id]
   Ve la request, sube archivo o texto, PATCH /respond
6. PATCH:
   a. UPDATE human_requests.status='responded' + response_*
   b. Dispara after(): re-run del inbox-processor con original + response en context
7. Agent regenera draft con la nueva info → classifier decide → envía
8. Cliente recibe respuesta completa
```

**Componentes nuevos:**
- Tabla `human_requests` (nueva)
- Tool `pedir_a_humano` (nueva, registrada en voz + chat + email)
- Endpoint `PATCH /api/portal/[token]/requests/[id]/respond`
- Página `/portal/[token]/requests/[id]` (server component + client form)
- Cron `human-requests-monitor` (reminders + escalations + timeouts)
- Módulo `src/lib/human-handoff/notify.ts` (dispatch multi-canal)
- Módulo `src/lib/human-handoff/resume.ts` (loop-close)
- Handler `src/lib/tools/handlers/pedir-a-humano.ts`
- Storage bucket `human-request-files` (privado)

**Componentes modificados:**
- `inbox-processor.ts`: registrar tool + hook de resume
- `executor.ts`: incluir `pedir_a_humano` en el switch de tools
- `email-sync.ts`: sync opcional de carpeta Spam
- `OpsInboxSection.tsx`: tabs Pendientes / Auto-enviados / Todo
- `email-quick-classify.ts`: patrones más agresivos
- `vercel.json`: cron entry
- Prompt system del agent: incluir directorio interno

**Kill switches (hierarchical):**
1. Global env `HUMAN_HANDOFF_ENABLED=false` → tool no se registra
2. Per-org: `organizations.human_handoff_disabled_at` → force off
3. Per-agent: `features.human_handoff_enabled` (default true si trust_stage >= 2)
4. Trust Stage 1: tool NUNCA disponible

## 5. Componentes

### 5.1 Tabla `human_requests` (NUEVO — `sql/human_requests.sql`)

```sql
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

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS human_handoff_disabled_at timestamptz;

ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS source_folder text DEFAULT 'inbox'
  CHECK (source_folder IN ('inbox','spam_rescued','spam_confirmed'));
```

### 5.2 Tool `pedir_a_humano` (NUEVO handler)

**Archivo:** `src/lib/tools/handlers/pedir-a-humano.ts`

**Schema (registrada en `BASE_EMAIL_TOOLS`, `BASE_CHAT_TOOLS`, `BASE_VOICE_TOOLS`):**

```ts
{
  name: 'pedir_a_humano',
  description: `Pide a un humano del equipo del negocio: info que no tienes, una acción física, o confirmación de una decisión importante.

Úsala CUANDO:
- Necesitas datos/archivos que no están en Drive ni puedes obtener con otras tools
- Requiere una acción FÍSICA que solo un humano puede hacer
- Requiere aprobación de una decisión que excede tu autoridad

Para llamadas telefónicas:
- Si tienes minutos disponibles Y toda la info → usa trigger_outbound_call, NO pidas a humano
- Solo pide llamada a humano si: sin minutos, cliente pidió humano, o conversación delicada

NO la uses para:
- Info obtenible con search_files, buscar_en_web, o QB
- Cosas que puede hacer otro agente (usa delegate_task)
- Llamadas que puedes hacer tú (usa trigger_outbound_call primero)`,
  input_schema: {
    type: 'object',
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
}
```

**Handler** — resolve target_email, kill switches, INSERT en `human_requests`, dispatch notif (non-blocking), return `{ok, request_id, target_email}`.

**Anti-loop:** máximo 3 requests totales (activas + históricas) por `source_inbox_id`. La 4ta invocación retorna `{ok: false, error: 'Ya solicitaste ayuda 3 veces para este correo. Procede con lo que tienes o cancela.'}`. Query de verificación: `SELECT COUNT(*) FROM human_requests WHERE source_inbox_id = <id>`.

**Directorio en prompt del agent** — al construir el system prompt, generar desde `portal_users`:

```
DIRECTORIO INTERNO (para pedir_a_humano):
- Roberto Jurado (roberto@pneumastudio.mx) — Ventas
- María López (maria@pneumastudio.mx) — Diseño
- Nazre Zúñiga (nazre@centinelia.mx) — Owner

Usa target='specific' + target_email=<correo> cuando sepas quién es el mejor.
Usa target='approver' si no sabes.
```

### 5.3 Endpoint `/api/portal/[token]/requests/[id]/respond` (NUEVO)

```ts
PATCH body: {
  response_text?: string,
  response_files?: [{ name, base64, mime_type }],
  response_action?: 'done' | 'cannot_do' | 'partial',
  cancel?: boolean,
  redirect_to_email?: string,
  redirect_note?: string,
}
```

- Ownership check: `portal_token → agent_id → human_requests.agent_id`
- Uploads a bucket `human-request-files` (privado)
- Si `redirect_to_email`: UPDATE current status='cancelled' + cancellation_reason='redirected_to:X', INSERT nuevo row con mismo source_* pero nuevo target
- Si `cancel`: UPDATE status='cancelled', cancellation_reason='unable_to_help'
- Si respuesta normal: UPDATE status='responded' + response_*
- Dispatch resume via `after()` (no bloquea response)

Anti-redirect-loop: máximo 3 redirects en cadena. En el 4to: force cancel con nota "límite alcanzado, requiere owner".

### 5.4 Página respond (NUEVO)

**Server component:** `src/app/portal/[token]/requests/[id]/page.tsx`
- Fetch request + source context (ops_inbox row si aplica)
- Verificar ownership
- Renderizar layout con contexto expandible

**Client form:** `src/app/portal/[token]/requests/[id]/RespondForm.tsx`
- Variantes por request_type (drop-zone / radio done-cannot-partial / radio aprobado-rechazado)
- Botón "Redirigir a alguien" → modal con dropdown de `portal_users` (fetch `/api/portal/[token]/users`) + fallback correo libre
- Botón "No puedo ayudar" → cancel
- PATCH y redirect a bandeja

### 5.5 Cron `human-requests-monitor` (NUEVO)

**Archivo:** `src/app/api/cron/human-requests-monitor/route.ts`
**Schedule:** `0 */2 * * *` (cada 2h)
**Auth:** Bearer CRON_SECRET

**Ciclo:**
1. Reminders: pending > 24h sin reminded_at → send reminder email, UPDATE reminded_at
2. Escalations: pending > 48h → send escalation al owner, UPDATE status='escalated', escalated_to_email, escalated_at
3. Timeouts: pending/escalated > 7d → UPDATE status='timeout', dispara `resumeAgentAfterHumanResponse` con context "sin respuesta"

Response: `{ reminded, escalated, timed_out, errors }`.

### 5.6 Bandeja tabs (MODIFICADO `OpsInboxSection.tsx`)

3 tabs — Pendientes (default) / Auto-enviados / Todo.

**Pendientes:** UNION de `human_requests WHERE status='pending'` + `ops_inbox WHERE status IN ('pending','escalated','info_requested')`. Ordenados por urgencia DESC + created_at DESC. Badge de origen (human_request icon vs email icon). CTA "Responder" o "Aprobar" según fuente.

**Auto-enviados:** `ops_inbox WHERE status='auto_replied' AND auto_mode_decision='send'`.

**Todo:** vista completa.

### 5.7 Notification pipeline (NUEVO `src/lib/human-handoff/notify.ts`)

**Función principal:** `dispatchHumanRequestNotification(requestId)`.

Ejecuta en cascada los canales habilitados en `voice_agents.features.notification_channels`:
- Email (siempre, default true): HTML template sin emojis, con link al portal
- WhatsApp: stub (log + mark `wa_stub` en channels_notified). Real cuando WA salga de sandbox
- Llamada: solo si urgency='alta' + agente tiene minutos + target tiene phone. Vapi outbound con prompt breve

Actualiza `human_requests.channels_notified` con los canales que sí se dispararon.

**Reminder / escalation email templates:** también en este módulo.

### 5.8 Loop-close (NUEVO `src/lib/human-handoff/resume.ts`)

**Función principal:** `resumeAgentAfterHumanResponse(requestId)`.

Detecta `source_channel`:
- `email`: fetch ops_inbox via source_inbox_id → construir enrichedContext (original + respuesta humana) → invocar `processInboxEmail` con `existingInboxId=inbox.id` (patrón Sesión 33). Response_files se referencian en attachments
- `voice`: MVP no implementa. Solo trackea para audit
- `chat`: MVP no implementa. El cliente ya recibió "voy a verificar"

Maneja también `status='cancelled'` (humano no pudo) y `status='timeout'` (auto-cancel) con context distinto ("procede sin la info").

Anti-loop: si el resume genera nuevo `pedir_a_humano` sobre mismo `source_inbox_id`, contador max 3.

### 5.9 Filtros de spam mejorados (MODIFICADO)

**Capa 1 — `quickClassifyEmail`:** añadir patterns:
- Senders promocionales (regex): `@(promociones|marketing|newsletter|noreply|deals|ofertas)`
- Domains de retailers (lista curada): officedepot, liverpool, amazon, mercadolibre, etc.
- Headers de bulk mail: `List-Unsubscribe`, `Precedence: bulk`, `X-Campaign-ID`
- Subject patterns: `/(oferta|descuento|% off|black friday|hot sale|promo|cupón)/i` + emojis en subject

**Capa 2 — Haiku prompt:** endurecer definición de `spam` para incluir promociones no relacionadas al negocio, newsletters, notificaciones automáticas de plataformas no operacionales. "Mejor archivar de más que llenar la bandeja."

**Capa 3 — Contexto de negocio:** aprovechar el `business_description` que ya se pasa como context, agregar instrucción explícita "evalúa relevancia contra los servicios del negocio".

Efecto: `status='skipped'` items NO aparecen en Pendientes ni Auto-enviados. Solo en tab "Todo" para transparencia.

### 5.10 Carpeta Spam opt-in (MODIFICADO `email-sync.ts`)

**Config:** `voice_agents.features.check_spam_folder = boolean` (default false).

**UI en configurar/page.tsx → sección Correo:** toggle con cost callout (~30-50 ops/mes estimado). Después de 7 días de operación con el toggle activo, mostrar una card debajo del toggle con el costo real de la semana: "47 correos revisados, 3 rescatados, 12 ops consumidas". Query: `SELECT COUNT(*) filter (WHERE source_folder = 'spam_rescued') as rescatados, COUNT(*) as revisados FROM ops_inbox WHERE agent_id = ? AND source_folder LIKE 'spam%' AND created_at > NOW() - INTERVAL '7 days'`.

**Connectors:** `fetchUnread({folder: 'inbox' | 'spam'})` en Gmail y Outlook. `unmarkSpam(messageId)` nuevo método para rescate.

**Flujo:**
- Emails de Spam saltan `quickClassifyEmail` (ya vinieron flagged) — van directo a Haiku
- Prompt enriquecido: "este correo fue marcado spam por el proveedor. Sé crítico pero justo — si es cliente conocido, RESCATA"
- Si Haiku clasifica NO spam → INSERT con `source_folder='spam_rescued'`, mover a Inbox en el proveedor, continuar flujo normal
- Si Haiku confirma spam → INSERT con `status='skipped'`, `source_folder='spam_confirmed'`, dejar en Spam del proveedor

**Rate limit safety:** sync Spam a un ritmo distinto que Inbox. Implementación: en `integration_accounts.metadata` guardar `last_spam_sync_at`. En cada run del cron, chequear delta — si `now - last_spam_sync_at < 30 min`, skip el sync de Spam para esa integración (equivale a "cada 2do run" del cron que corre cada 15 min).

## 6. Data flow

### 6.1 Happy path — info request en email

Ver Sección 4 (arquitectura).

### 6.2 Redirect flow

```
1. Humano A recibe notif, abre portal, click "Redirigir a alguien"
2. Selecciona Humano B del dropdown (portal_users) o escribe correo libre
3. PATCH /respond con { redirect_to_email: 'B@x.com', redirect_note: '...' }
4. Backend:
   a. UPDATE current row: status='cancelled', cancellation_reason='redirected_to:B@x.com'
   b. INSERT nuevo row: mismo source_*, request_type, title. Description enriquecida con "Redirigido desde A@x.com: <nota>". target_email=B
   c. Dispatch notif al nuevo target
5. UI de A: item desaparece de Pendientes
6. UI de B: nuevo item en Pendientes con header "Redirigido desde A"
7. Loop continúa desde B
```

### 6.3 Timeout flow

```
1. Cron human-requests-monitor detecta request pending/escalated > 7d
2. UPDATE status='timeout', cancelled_at=NOW(), cancellation_reason='auto_timeout_7d'
3. Dispatch resumeAgentAfterHumanResponse con context "sin respuesta en 7d"
4. Agent decide (según prompt): respuesta parcial al cliente o cancelar flow
```

### 6.4 Spam rescue flow

```
1. Cron email-sync (con features.check_spam_folder=true) fetches Spam folder
2. Cada mensaje va a Haiku con prompt "este fue flagged por Gmail/Outlook, evalúa"
3. Si Haiku clasifica no-spam:
   a. INSERT ops_inbox con source_folder='spam_rescued'
   b. conn.email.unmarkSpam(msg.id) → mueve a Inbox en el proveedor
   c. Continúa flujo normal (auto_reply o pending según trust_stage)
4. Si Haiku confirma spam:
   a. INSERT con status='skipped', source_folder='spam_confirmed'
   b. NO mover en el proveedor (queda en Spam)
```

## 7. Casos edge

- **Target sin email seteado:** tool retorna `{ok:false, error:'no target'}`. Agent falla gracefully, marca needs_info+escalate como fallback.
- **Trust Stage 1 llama la tool:** guard en handler rechaza. Tool no debería estar registrada, pero defensive.
- **Kill switch activado mid-flight:** requests ya pending siguen su vida (reminders/escalations/timeouts). Tool nueva no se puede invocar. Cliente que abre el link del portal antiguo puede responder — el resume respeta el original path.
- **Sub-usuario removido:** requests pending contra su email quedan huérfanas. Cron detecta email inválido (bounce) y escala al owner en próximo ciclo.
- **Redirect a sí mismo:** rechaza en el PATCH.
- **Redirect a un correo que ya recibió esta request:** rechaza (chain de 3 max, previene loops).
- **Draft eliminado durante el resume:** ops_inbox row existe pero raw_message_id inválido → resume registra error, marca request como `resume_failed`, notifica owner.
- **Múltiples requests para el mismo source_inbox_id:** aceptado hasta 3. Todas independientes con su propio loop-close. El agent ve las respuestas secuenciales.

## 8. Error handling

**Principio:** fallos del handoff nunca dejan al empleado bloqueado indefinidamente. Timeouts + fallbacks + owner escalation.

### 8.1 Tool `pedir_a_humano`

| Fallo | Comportamiento |
|---|---|
| INSERT falla | Return `{ok:false, error}` al agent. Log. Agent decide fallback |
| Target no resuelve | Return `{ok:false, error:'no target'}`. Agent marca needs_info como fallback |
| Kill switch activo | Return `{ok:false, error:'deshabilitado'}`. Agent procede sin la tool |
| Anti-loop (>3 en mismo source) | Return `{ok:false, error:'límite'}`. Force agent a resolver |

### 8.2 Notification pipeline

| Fallo | Comportamiento |
|---|---|
| Email send falla | Log. Otros canales igual disparan. Cron reintenta reminder al 24h |
| Vapi call falla | Log. Email siempre queda. No reintento (llamada es best-effort) |
| Todos los canales fallan | Log CRITICAL. Row queda pending sin channels_notified. Cron reintenta |

### 8.3 Portal respond endpoint

| Fallo | Comportamiento |
|---|---|
| Ownership mismatch | 403. Log intent |
| Request no existe | 404 |
| Request ya responded/cancelled | 409 con `{alreadyProcessed: true}` |
| Upload archivo falla | 500 con mensaje. Nada muta |
| Redirect a self | 400 |
| Redirect chain > 3 | 400 con mensaje "límite" |

### 8.4 Cron human-requests-monitor

| Fallo | Comportamiento |
|---|---|
| Query timeout | Return 500. Vercel reintenta. Idempotencia por status guards |
| Reminder send falla | Skip request, sigue con los demás. UPDATE reminded_at solo si éxito |
| Escalation send falla | Skip. Retry en próxima corrida |
| Timeout dispatch falla | Log. Row queda pending (no timeout aplicado). Owner alertado |

### 8.5 Resume

| Fallo | Comportamiento |
|---|---|
| `processInboxEmail` throws | Log. UPDATE resume_triggered_at=NULL. Notifica owner |
| Anti-loop en resume genera nueva tool call | Cap de 3 aplica. 4to falla con error explícito |

### 8.6 Observabilidad mínima MVP

- Logs con prefijos: `[human-handoff]`, `[notify]`, `[resume]`, `[hrm]`
- Métrica manual SQL:
  ```sql
  SELECT status, COUNT(*), AVG(EXTRACT(EPOCH FROM (responded_at - created_at))/3600) as avg_hours_to_respond
  FROM human_requests
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY 1;
  ```
- Alerta manual: si `timeout_rate > 30%` → problema (los humanos no responden). Revisar canal, targets, prompt.

## 9. Testing

### 9.1 Smoke test manual — `scripts/smoke/human-handoff.ts`

Fixtures inline que simulan:
- Tool call exitoso → row creada → notif disparada (mock sendEmail)
- Anti-loop: 4to intento sobre mismo source falla
- Target inválido → error
- Kill switch activo → skip

`npx tsx scripts/smoke/human-handoff.ts` → 5/5 passed.

### 9.2 Golden test — `scripts/eval/cases/pedir-a-humano/*.json`

10 fixtures del contexto donde el agent DEBE (o NO debe) llamar la tool:
- 5 casos SHOULD_CALL: "cliente pide fotos que no tengo", "necesito aprobación de descuento", "hay que verificar stock físico"
- 5 casos SHOULD_NOT_CALL: info disponible en Drive, llamada que el agent puede hacer, consulta rutinaria

Runner: `scripts/eval/run-pedir-a-humano.ts`. Métrica: precision del uso de la tool (no falsos positivos ni negativos).

### 9.3 Integration test contra Supabase staging

Setup: agente test con trust_stage=3. Send correo test → agent llama tool → verify row en human_requests → PATCH respond → verify resume → verify draft actualizado en ops_inbox.

### 9.4 Manual E2E checklist (runbook)

- [ ] Sofía procesa email de "cliente pide fotos SKU"
- [ ] Row aparece en human_requests con status=pending
- [ ] Email llega al aprobador con link al portal
- [ ] Click en link abre página con contexto correcto
- [ ] Upload de 2 fotos → PATCH succeeds → toast "respuesta enviada"
- [ ] En 60 seg, ops_inbox row del correo original se actualiza (draft mejorado + auto_replied o pending según classifier)
- [ ] Cliente recibe respuesta completa con fotos

### 9.5 Kill switch smoke

- [ ] `HUMAN_HANDOFF_ENABLED=false` → tool return error
- [ ] `UPDATE organizations SET human_handoff_disabled_at=NOW() WHERE portal_email=X` → force off para esa org
- [ ] `features.human_handoff_enabled=false` → tool disabled per-agent

### 9.6 Filter tests (Q4)

Fixtures: 20 correos reales (sanitizados) mezcla de negocio real + promociones + newsletters. Assert:
- ≥90% de promociones caen en `status='skipped'` (spam)
- ≤5% de correos legítimos caen erróneamente en spam (falsos positivos)

### 9.7 Spam rescue tests (Q5)

Manual: seed un correo legítimo en Spam de gmail (marcarlo como spam manually), enable toggle, correr sync, assert:
- ops_inbox row con `source_folder='spam_rescued'`
- Correo movido a Inbox en Gmail
- Flujo continúa normal

## 10. No-goals MVP

- WhatsApp real (solo stub — implementar cuando WA salga de sandbox de Twilio)
- Chat resume automático (chat solo envía mensaje al cliente "verifico")
- Voice resume automático (voz solo trackea para audit)
- UI de config per-agente para prioridad de canales (SQL manual en MVP; UI en fase 2)
- Notificación proactiva de "creemos que hay X importante en tu spam" (fase 2)
- Fase 2 UI para editar `notification_channels` desde portal (MVP: JSONB manual)
- Metadata rica sobre humanos (rol, área, expertise) para que agent pida al más adecuado — MVP usa `portal_users.modules[0]`; fase 2 podría enriquecerse
- Historial completo de handoffs en dashboard analytics (MVP: query manual)

## 11. Rollout plan

1. **Día 0 — Deploy 1:** código + migration SQL. Feature flag `features.human_handoff_enabled` default false para agentes existentes (opt-in). Nuevos agentes se crean con default true si trust_stage >= 2.
2. **Día 0-2 — Validación piloto:** UPDATE Sofía con `features.human_handoff_enabled=true`. Nazre corre 5-10 casos test manuales (checklist §9.4). Ajustar prompt del agent si falla precision.
3. **Día 3 — Rollout gradual:** enable feature para 3-5 clientes activos con trust_stage=3. Monitor semanal §8.6.
4. **Semana 2-3 — Rollout completo:** default true para todos los agentes trust_stage >= 2. Notify email a orgs afectadas.
5. **Semana 4+ — Fase 2:** WhatsApp real cuando salga de sandbox. UI de config de canales. Dashboard analytics.

## 12. Referencias

- [[project_centinelia_vision_nervous_system]] — visión que motiva
- [[decisions_centinelia_session10]] — consultar_agente, delegar_tarea, portal unificado
- [[decisions_centinelia_session14]] — Nox coordinador, agent_tasks
- [[decisions_centinelia_session33]] — email approval flow, needs_info+escalate patrón
- Spec previo: `docs/superpowers/specs/2026-07-30-email-auto-mode-classifier-design.md`
- [[feedback_no_emojis]], [[feedback_no_ia_visible]] — copy rules en UI
- [[feedback_3channel_tools]] — toda tool nueva debe estar en voz + chat + email desde el inicio
