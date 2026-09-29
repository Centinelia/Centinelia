# Spec — Refactor latencia email: SMTP+IMAP a background jobs

**Fecha**: 2026-09-29
**Autor**: Claude (Opus 4.7) + Nazre
**Estado**: Approved (secciones 1-3), pending plan

---

## 1. Motivación y contexto

### 1.1 Trigger

El incidente Tortillería/Tecate Six del 2026-09-29 tuvo dos capas:

- **Síntoma**: `registrar_incidencia` invocado 2 veces por Nelia con toolCallIds distintos → duplicados en `client_incidents`, doble email, doble cobro, reporte de falla falso.
- **Root cause upstream**: la tool tarda **~15 segundos** por SMTP send (~2-3s por recipient) + IMAP APPEND (~5-10s por recipient) sync. Modelo (Claude Sonnet 5.5) percibe timeout y reinvoca.

El middleware dedup universal (spec 2026-09-29 middleware, PR #81) fixea el síntoma: aunque el modelo reinvoque, no se ejecuta 2 veces. Pero el trigger raíz sigue: la tool tarda mucho, el modelo reintenta con más frecuencia, la experiencia del usuario final degrada (silencios largos en la llamada mientras Nelia "piensa").

### 1.2 Objetivo

Todos los tools con side-effect de email deben **responder al modelo en <2s** enviando el trabajo pesado a un background worker. El email sí sale, con delay <60s aceptado.

### 1.3 Decisiones tomadas en brainstorming

1. **Success criteria**: tool <2s siempre. Modelo nunca percibe timeout.
2. **Infra**: solo stack existente (tabla + cron cada 1 min). Sin dependencias nuevas. Consistente con `outbound_contacts` pattern.
3. **Scope**: solo email/IMAP side-effects. WhatsApp, calendar sync y PDF quedan fuera (task separada).

### 1.4 Fuera de scope

- WhatsApp Twilio (mismo problema, spec separado si volumen lo justifica)
- Calendar sync (`executeCreateCalendarEvent`) — task separada
- PDF generation (Puppeteer) — infra distinta
- Portal admin UI `/admin/email-jobs` — Fase 3 rollout
- QStash / Vercel Queues — descartado por evitar dependencias nuevas
- Idempotency a nivel job — ya cubierta por el middleware dedup en PR #81

---

## 2. Arquitectura

### 2.1 Flow

**Actual (bug)**:
```
executor:
  insert incident            (fast)
  charge op                  (fast)
  for each recipient:
      sendMeerkatHtmlEmail   ← 5-10s SMTP + IMAP APPEND
  upsertFollowupContact      (~1s)
  return "Listo, notifiqué"  ← total ~15s
```

**Nuevo**:
```
executor:
  insert incident            (fast)
  charge op base             (fast)
  INSERT email_send_jobs (N rows, status='pending')   ← ~50ms
  upsertFollowupContact      (~1s)
  return "Listo, notifiqué"  ← total <2s ✓

/api/cron/process-email-jobs (every 1 min):
  SELECT pending jobs WHERE next_attempt_at <= NOW() LIMIT 20
  for each:
    UPDATE status='processing' WHERE id=? AND status='pending' RETURNING *   ← lock optimista
    try {
      sendMeerkatHtmlEmail(...)
      UPDATE status='done', delivered_at=NOW(), provider, provider_meta
      consumeAiOp(agent, 1, {source: charge_source, reference_id})           ← charge deferred
      markSourceEmailSent(...)                                                ← update client_incidents.email_sent_at
    } catch {
      attempts++
      if attempts >= max_attempts: status='failed' + Nash alert
      else: next_attempt_at = NOW() + 30s * 2^attempts
    }
```

### 2.2 Cambios de responsabilidad

- **Executor**: pierde el loop de `sendMeerkatHtmlEmail` inline + el `consumeAiOp(sentCount, 'incidencia_notif')`. Solo enqueue jobs.
- **Cron**: gana esas 2 responsabilidades + `email_sent_at` update en tabla source.
- **Copy al modelo**: NO cambia. "Registrado. Correo enviado al encargado..." sigue siendo funcionalmente cierto (email sale con delay <60s).

### 2.3 Archivos afectados (~13)

**Nuevos**:
- `supabase/migrations/<ts>_email_send_jobs.sql` — tabla + índices + flag
- `src/lib/email/enqueue-email.ts` — helper compartido
- `src/lib/email/__tests__/enqueue-email.test.ts`
- `src/app/api/cron/process-email-jobs/route.ts`
- `src/app/api/cron/process-email-jobs/__tests__/route.test.ts`
- `src/lib/monitoring/email-jobs-drift.ts` — Nash detector
- `src/lib/monitoring/__tests__/email-jobs-drift.test.ts`
- `src/app/api/cron/cleanup-email-jobs/route.ts` — retention weekly

**Modificados** (5 executors + config):
- `src/lib/tools/executors/registrar-incidencia.ts`
- `src/lib/tools/executors/registrar-cliente-nuevo.ts`
- `src/app/api/voice/tools/crear-ticket/route.ts`
- `src/app/api/voice/tools/enviar-correo/route.ts`
- `src/app/api/voice/tools/enviar-documento-oficina/route.ts`
- `vercel.json` — 2 crons nuevos (process + cleanup)

`agendar-cita` NO se toca en este spec (su latencia crítica es Google Calendar OAuth, no email; WhatsApp de owner-notify va en spec propio).

### 2.4 Fail-open + reversal

Feature flag `organizations.email_jobs_enabled` (default false). Cuando OFF, el executor envía inline como hoy (código legacy preservado hasta Fase 4). Rollout gradual permite reversal instantáneo por org con un `UPDATE`.

---

## 3. Data model

### 3.1 Tabla `email_send_jobs`

```sql
CREATE TABLE email_send_jobs (
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

CREATE INDEX idx_email_jobs_pending
  ON email_send_jobs (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_email_jobs_agent_source
  ON email_send_jobs (agent_id, source, created_at DESC);

CREATE INDEX idx_email_jobs_stuck
  ON email_send_jobs (created_at)
  WHERE status IN ('pending', 'processing');
```

**`source_table` + `source_row_id`**: identifican la fila destino donde actualizar `email_sent_at` (o su equivalente) cuando el job pasa a `done`. Por ejemplo `('client_incidents', '<uuid>')`. Nullable para tools sin campo de tracking (`enviar_correo`).

### 3.2 Feature flag

```sql
ALTER TABLE organizations
  ADD COLUMN email_jobs_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.email_jobs_enabled IS
  'Refactor latencia email (spec 2026-09-29). Cuando true, los tools con side-effect de email encolan en email_send_jobs y responden al modelo <2s. Cuando false, envían inline como legacy. Default false; rollout Tortillería → pilotos → global.';
```

### 3.3 Estados y transiciones

```
pending ──(cron picks + lock)──> processing ──(SMTP+IMAP ok)──> done
                                     │
                                     └──(throw)──> pending (attempts++, next_attempt_at += backoff)
                                           │
                                           └──(attempts >= max)──> failed ──(Nash alert)──> [manual → dead]
```

- `failed` = agotó reintentos, requiere intervención manual
- `dead` = descartado manualmente (no re-procesar)

### 3.4 Backoff exponencial

`next_attempt_at = NOW() + interval '30 seconds' * 2^attempts` → 30s, 1m, 2m, 4m, 8m. Cap efectivo ~15 min (5 attempts).

### 3.5 Lock optimista

El cron hace `UPDATE ... WHERE id=? AND status='pending' RETURNING *`. Si dos crons corren en paralelo, solo uno gana el row. Sin transactions largas ni `SELECT FOR UPDATE`.

### 3.6 Retention

Cron `cleanup-email-jobs` cada semana (`0 3 * * 0`) borra:
- `status='done'` con `delivered_at < NOW() - INTERVAL '30 days'`
- `status IN ('failed','dead')` con `failed_at < NOW() - INTERVAL '90 days'`

### 3.7 Attachments

Los executors con attachment (`crear_ticket`, `enviar_documento_oficina`) suben a Supabase Storage bucket privado nuevo `email-attachments/`, guardan signed URL en `attachment_url` (TTL 24h + refresh en el cron si expira). Cron descarga al procesar. Attachments grandes NO viven inline en la row.

### 3.8 Charge deferred

El cargo por email enviado (`incidencia_notif`, `cliente_nuevo_notif`, etc.) se mueve al cron, NO al executor. Cuando job pasa a `done`, el cron llama `consumeAiOp(agent_id, 1, {source, reference_id, label})`. Si el job termina en `failed`, NO se cobra — mantiene pool accuracy [[feedback-pool-accuracy-top-priority]].

El cargo BASE del executor (ej: `incident_registered`) sigue ocurriendo síncronamente porque es trabajo del meerkat independiente del email.

---

## 4. Helper `enqueueEmailJob`

```ts
// src/lib/email/enqueue-email.ts

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
): Promise<EnqueueEmailResult>;

/**
 * Batch — inserta N jobs en 1 sola llamada. Retorna array por-recipient.
 */
export async function enqueueEmailJobBatch(
  common:      Omit<EnqueueEmailArgs, 'to'>,
  recipients:  Array<{ to: string }>,
  supabase:    SupabaseClient,
): Promise<EnqueueEmailResult[]>;

/**
 * Checkeo de feature flag para el executor decidir qué path tomar.
 * Cached por request (o por 30s en memoria) para evitar N queries.
 */
export async function isEmailJobsEnabled(
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<boolean>;
```

---

## 5. Cambios en executors

### 5.1 Patrón

Cada executor detecta el flag y bifurca:

```ts
const useJobs = await isEmailJobsEnabled(ctx.agent.portal_email, ctx.supabase);
if (useJobs) {
  await enqueueEmailJobBatch(
    {
      agentId:      ctx.agent.id,
      portalEmail:  ctx.agent.portal_email,
      subject, html, replyTo,
      source:       'incidencia_notif',
      referenceId:  incidentId,
      chargeSource: 'incidencia_notif',
      chargeLabel:  sentCountLabel,
      sourceTable:  'client_incidents',
      sourceRowId:  incidentId,
    },
    recipients.map(r => ({ to: r.email })),
    ctx.supabase,
  );
} else {
  // Path legacy inline (código actual sin cambios hasta Fase 4)
  for (const recipient of recipients) {
    const sendRes = await sendMeerkatHtmlEmail(...);
    ...
  }
  if (sentCount > 0) {
    await consumeAiOp(agent.id, sentCount, { source: 'incidencia_notif', ... });
    await supabase.from('client_incidents').update({ email_sent_at: ... }).eq('id', incidentId);
  }
}
```

### 5.2 Executores tocados

| Executor | Source | Charge | Source table |
|----------|--------|--------|--------------|
| `registrar-incidencia.ts` | `incidencia_notif` | `incidencia_notif` | `client_incidents.email_sent_at` |
| `registrar-cliente-nuevo.ts` | `cliente_nuevo_notif` | `cliente_nuevo_notif` | `client_incidents.email_sent_at` |
| `crear-ticket/route.ts` | `ticket_email_notify` | `ticket_email_notify` | `helpdesk_tickets.email_sent_at` (agregar columna si no existe) |
| `enviar-correo/route.ts` | `enviar_correo` | `enviar_correo` | — (sin tabla source) |
| `enviar-documento-oficina/route.ts` | `enviar_doc` | `enviar_doc` | — |

`agendar_cita` queda fuera de este spec — su latencia crítica es Google Calendar OAuth, no email (WhatsApp se cubrirá en spec propio).

---

## 6. Cron worker

```ts
// src/app/api/cron/process-email-jobs/route.ts

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const batchSize = 20;

  const { data: pending } = await supabase
    .from('email_send_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(batchSize);

  const results = { picked: pending?.length ?? 0, done: 0, retried: 0, failed: 0 };

  for (const job of pending ?? []) {
    // Lock optimista
    const { data: locked } = await supabase.from('email_send_jobs')
      .update({
        status:         'processing',
        processing_at:  new Date().toISOString(),
        attempts:       job.attempts + 1,
      })
      .eq('id', job.id).eq('status', 'pending')
      .select().single();
    if (!locked) continue;

    try {
      const agent = await fetchAgentFor(job.agent_id, supabase);
      const attachment = job.attachment_url
        ? await downloadAttachment(job, supabase)
        : undefined;

      const sendRes = await sendMeerkatHtmlEmail({
        agentId: job.agent_id,
        to:      job.to_addr,
        subject: job.subject,
        html:    job.html,
        replyTo: job.reply_to,
        from:    job.from_addr,
        attachment,
        agent,
      }, supabase);

      if (!sendRes.ok) throw new Error(`send failed: ${sendRes.error}`);

      await supabase.from('email_send_jobs').update({
        status:        'done',
        delivered_at:  new Date().toISOString(),
        provider:      sendRes.provider,
        provider_meta: sendRes.meta,
      }).eq('id', job.id);

      if (job.charge_source) {
        try {
          await consumeAiOp(job.agent_id, 1, {
            source:       job.charge_source,
            label:        job.charge_label ?? job.charge_source,
            reference_id: job.reference_id,
          });
        } catch (err) {
          console.error('[email-jobs] charge failed (deferred audit gap):', err);
        }
      }

      if (job.source_table && job.source_row_id) {
        await markSourceEmailSent(job, supabase);
      }
      results.done++;

    } catch (err) {
      const nextDelay = 30_000 * Math.pow(2, locked.attempts);
      const nextAttempt = new Date(Date.now() + nextDelay).toISOString();
      const isFinal = locked.attempts >= job.max_attempts;
      await supabase.from('email_send_jobs').update({
        status:          isFinal ? 'failed' : 'pending',
        next_attempt_at: nextAttempt,
        last_error:      err instanceof Error ? err.message : String(err),
        failed_at:       isFinal ? new Date().toISOString() : null,
      }).eq('id', job.id);
      if (isFinal) results.failed++; else results.retried++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

async function markSourceEmailSent(
  job:      { source_table: string; source_row_id: string },
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.from(job.source_table)
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', job.source_row_id);
}
```

### 6.1 Cron schedule

```json
{
  "path": "/api/cron/process-email-jobs",
  "schedule": "* * * * *"   // every minute
},
{
  "path": "/api/cron/cleanup-email-jobs",
  "schedule": "0 3 * * 0"   // weekly Sunday 3am
}
```

Vercel free-tier permite crons de 1 minuto. Impacto por ciclo: 1 SELECT (~5ms) + N locks + N SMTP+IMAP (async, no bloquea el cron completo).

### 6.2 Timeout del cron

Vercel functions default 30s. Con 20 jobs × ~10s cada uno = 200s → overflow. Solución:

- Batch size = 20 pero procesamiento **paralelo** con `Promise.allSettled` capping a 5 concurrentes (evitar rate-limit del proveedor SMTP/Gmail).
- Con paralelismo=5, 20 jobs / 5 × 10s = 40s promedio. Aún puede sobrar tiempo.
- Reducir batch a 10 si prod muestra timeouts consistentes.

**Concurrencia**:
```ts
const CONCURRENCY = 5;
for (let i = 0; i < pending.length; i += CONCURRENCY) {
  const chunk = pending.slice(i, i + CONCURRENCY);
  await Promise.allSettled(chunk.map(job => processJob(job, supabase)));
}
```

---

## 7. Testing

### 7.1 Unit tests

**`enqueue-email.test.ts`** (~8 casos):
- INSERT con payload correcto (todos los campos)
- Batch: N recipients → N rows en 1 INSERT
- `isEmailJobsEnabled` retorna false si flag OFF
- `isEmailJobsEnabled` retorna false si org no existe (fail-safe)
- Cache in-memory de flag (2 llamadas consecutivas = 1 query)
- Attachment URL vs sin attachment
- source_table/source_row_id opcionales

**`process-email-jobs/route.test.ts`** (~10 casos):
- Miss: sin pending → results.picked=0
- Success: 1 pending → sendMeerkat OK → status=done, charge invocada, source table updated
- Lock race: 2 crons concurrentes → solo 1 procesa
- Retry: sendMeerkat throw → status vuelve a pending, attempts++, next_attempt_at futuro con backoff
- Max attempts: attempts >= max → status=failed, failed_at seteado
- Charge deferred error: charge falla pero job queda done (audit-gap log)
- Attachment download: baja de storage y pasa a sendMeerkat
- Charge NO se llama si charge_source es null
- Source table update opcional (skip si source_table null)
- Concurrency: 15 pending con CONCURRENCY=5 → 3 chunks paralelos

**`email-jobs-drift.test.ts`** (~4 casos):
- Sin jobs stuck → no alerts
- Jobs pending >10 min → alert type='stuck'
- Failed rate última hora >20% con volumen >= 5 → alert type='failure_spike'
- Retorna array vacío si no hay actividad reciente

### 7.2 Integration test contra Supabase local

**`process-email-jobs.integration.test.ts`** con `assertNotProdOrAllowed()`:
- Setup: crear voice_agent + organization con flag ON
- Enqueue 3 jobs → correr cron → verificar 3 done + 3 rows en ai_ops_log
- Enqueue 1 job con mock SMTP que falla siempre → correr cron 6 veces → verificar status=failed después del 5to
- Cleanup: DELETE agent + org + jobs + charges

### 7.3 Regression test Tecate v2

`registrar-incidencia.test.ts` extendido:
- `useEmailJobs=true` (mock feature flag) → verificar handler retorna <500ms + hay N rows insertadas en email_send_jobs mock + NO se llama sendMeerkatHtmlEmail directo
- Verificar que el mensaje al modelo sigue siendo "Registrado. Correo enviado..."
- Verificar que el charge de `incidencia_notif` NO se cobra en el executor (queda al cron)

### 7.4 Drift detector Nash

`src/lib/monitoring/email-jobs-drift.ts` con dos checks:

```ts
export type EmailJobAnomalyType = 'stuck' | 'failure_spike';

export async function detectEmailJobsAnomalies(
  supabase: SupabaseClient,
  portalEmail: string,
): Promise<EmailJobAnomaly[]>;
```

- **stuck**: jobs en pending/processing con `created_at < NOW() - 10 min`. Umbral: 3+ jobs.
- **failure_spike**: jobs failed última hora / jobs total última hora > 20%, con total >= 5.

Nash llama `detectEmailJobsAnomaliesSafe` (throttled 60 min) desde el runner y crea `platform_incidents` si detecta.

### 7.5 Schema drift guard (futuro)

Test estático que enumera los executors con `sendMeerkatHtmlEmail` inline y verifica que TODOS tienen la bifurcación `isEmailJobsEnabled`. Falla en CI si alguien agrega un send inline sin el guard. Similar a `tool-coverage.test.ts` del middleware dedup.

---

## 8. Rollout

Idéntico al middleware dedup.

| Fase | Alcance | Duración | Criterio de éxito |
|------|---------|----------|-------------------|
| 1 | Enable `email_jobs_enabled=true` en **Tortillería** | 48 h | Latencia tool <2s p95, 0 jobs failed, cero retries por bug del executor, emails llegan al encargado en <60s p95 |
| 2 | Pilotos activos (AC, Santiago NL, Meefi) | 3-5 días | Idem por org |
| 3 | Global + `default=true` en nuevos orgs | 1 semana | Drift detector Nash sin alertas |
| 4 | DROP feature flag + código legacy inline en executors | Permanente | Cron siempre on, executor solo enqueue |

**Reversal**: `UPDATE organizations SET email_jobs_enabled=false WHERE portal_email=X`. Executor vuelve a inline sin re-deploy.

**Convivencia con middleware dedup**: son ortogonales. Dedup previene reinvocaciones duplicadas del modelo; email jobs baja la latencia que causa esas reinvocaciones. Ambos activos = defense in depth.

---

## 9. Observability

### 9.1 Logging

Cada ciclo del cron loguea:
```
[email-jobs] cycle picked=N done=X retried=Y failed=Z latency_ms=T
```

Cada fallo individual loguea:
```
[email-jobs] job=<id> attempt=<N> failed: <error>
```

### 9.2 Métricas visibles

- Portal admin (Fase 3, fuera del MVP): `/admin/email-jobs` con tabla filtrada por org, source, status, ordenada por created_at DESC. Contador de done/pending/failed última hora + gráfica.

### 9.3 Nash

Drift detector como en §7.4. Alerta al owner via `notification_events` para el daily digest.

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| Cron falla → jobs pending acumulados | Media (Vercel ~25% miss-rate hourly) | Detector Nash con umbral 10 min; catchup cron secundario (Fase 3) |
| SMTP quota exceded (Gmail 500/día) | Baja | Rate limit en el cron por integration; backoff exponencial ya cubre |
| Attachment expirado (signed URL) | Media | Refresh en el cron si URL >20h old; regenerar signed URL con TTL 24h |
| Charge deferred se pierde (cron cae después de send pero antes de charge) | Baja | Idempotent charge por reference_id: consultar-audit detecta ratio events/refs y flagea. Ya cubierto por `consumption-audit.ts` |
| Jobs stuck en `processing` (crash del cron mid-flight) | Media | Cron secundario que rescata processing > 5 min vuelve a pending |
| Cliente pierde emails porque flag no está encendido en su org tras deploy | Baja | flag default false; rollout gradual; executors legacy path siempre funciona |
| Retorno del modelo dice "correo enviado" cuando aún está en pending | Alta (esperado) | Copy explicitamente diseñado para ser cierto en horizonte de <60s; encargado recibe el email; ningún user-facing false claim. Documentado en §5 |

---

## 11. Success criteria

- [ ] `registrar-incidencia` executor con flag ON responde <500ms en tests
- [ ] Latencia p95 tool en prod <2s (medido vs baseline actual ~15s)
- [ ] Cero jobs stuck > 10 min durante 48h de Fase 1
- [ ] Emails al encargado llegan en <60s p95
- [ ] Cero pool accuracy issues detectados por consumption-audit
- [ ] Regression test Tecate v2 pasa
- [ ] Nash drift detector sin alertas durante Fase 1

---

## 12. Interacción con otros specs

- **Middleware dedup universal** (spec 2026-09-29 middleware, PR #81): ortogonal. Dedup previene 2 invocaciones del executor; este spec baja la latencia que causa las 2 invocaciones. Defense in depth.
- **Nash monitoring refactor** (task pendiente #11): el drift detector aquí propuesto debe consumir del mismo pattern que Nash monitoring — si el fix estructural cambia el patrón, adaptar.
- **Bug audit call flow 6 reglas** [[feedback-audit-call-flow-rules]]: silent DB inserts prohibidos. Este spec CUMPLE — cada estado del job es visible en la tabla, y el cron loguea cada ciclo.

---

## 13. Preguntas abiertas (resueltas)

- Concurrency en el cron: fijada en 5 (§6.2)
- Retention: 30 días done / 90 días failed (§3.6)
- Batch size: 20 con paralelismo 5 (§6.2)
- Attachment storage: bucket privado nuevo `email-attachments/` con signed URL 24h (§3.7)
- Cargo por email fallido definitivo: NO se cobra (§3.8)
