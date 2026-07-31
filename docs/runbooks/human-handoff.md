# Runbook — Human Handoff

**Spec:** [docs/superpowers/specs/2026-07-30-human-handoff-design.md](../superpowers/specs/2026-07-30-human-handoff-design.md)
**Plan:** [docs/superpowers/plans/2026-07-30-human-handoff.md](../superpowers/plans/2026-07-30-human-handoff.md)

## Kill switches (hierarchical severity)

### Global panic — apagar para todos
1. Vercel → Project → Settings → Environment Variables
2. Setear `HUMAN_HANDOFF_ENABLED=false` (production + preview)
3. Redeploy latest production build (no requiere rebuild)
4. Verificar en logs: próximas llamadas a `pedir_a_humano` deben retornar `{ok: false, error: 'deshabilitado'}`

**Effect:** Tool no se registra en voz + chat + email. Agentes existing no pueden invocar.

### Per-org — apagar para un cliente específico
```sql
UPDATE organizations SET human_handoff_disabled_at = NOW()
WHERE portal_email = '<cliente@ejemplo.com>';
```
Próxima invocación de la tool para ese org retorna `{ok: false, error: 'deshabilitado para tu organización'}` inmediatamente (verifica el guard en el handler).

### Per-agent — el cliente lo elige
El cliente entra al portal → Configurar → Correo → toggle "Permitir pedir ayuda a humanos". Desactiva `features.human_handoff_enabled` para ese agente.

### Trust Stage 1 — nunca disponible
El handler verifica `agent.trust_stage < 2` y retorna `{ok: false, error: 'requiere Trust Stage 2+'}` . Tool no está registrada pero defensive double-check en código.

## Reactivación

### Global
Borrar la env `HUMAN_HANDOFF_ENABLED` o setearla a `true`. Redeploy.

### Per-org
```sql
UPDATE organizations SET human_handoff_disabled_at = NULL
WHERE portal_email = '<cliente@ejemplo.com>';
```

### Per-agent
Cliente entra al portal → Configurar → Correo → toggle de vuelta a ON. Actualiza `features.human_handoff_enabled = true`.

## Storage bucket setup (Deploy 1)

**ANTES de Deploy 1 (código), crear el bucket en Supabase:**

En Supabase → Storage → New bucket:
```
Bucket ID: human-request-files
Public: FALSE (privado)
```

O via SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('human-request-files', 'human-request-files', false)
ON CONFLICT (id) DO NOTHING;
```

Verificar:
```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'human-request-files';
-- Expected: (human-request-files, human-request-files, false)
```

**RLS policy** (se asume ya existe en Supabase schema):
- Owner/agent puede leer sus propios archivos
- Humano respondedor puede leer archivos de requests que le pertenecen (verificado via ownership)

## Monitoring semanal (primeras 2 semanas post-deploy)

Query manual a correr los lunes:

### Status overview
```sql
SELECT
  status,
  COUNT(*) AS total,
  ROUND(AVG(EXTRACT(EPOCH FROM (responded_at - created_at))/3600), 1) AS avg_hours_to_respond
FROM human_requests
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 2 DESC;
```

**Interpreta así:**
- `pending` alto + `avg_hours_to_respond` es NULL: humanos no responden rápido. Revisar canales notif y targets.
- `timeout` creciendo: feature funcionando como fallback (7d auto-cancel). Normal los primeros 7 días.
- `responded`: métrica de éxito. Target: >70% en semana 2.

### Timeout rate
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'timeout') AS timed_out,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'timeout') / NULLIF(COUNT(*), 0), 1) AS timeout_pct
FROM human_requests
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Umbrales:**
- `timeout_pct > 30%`: PROBLEMA. Los humanos no responden a tiempo. Escalar a Nazre. Causas típicas:
  - Targets sin email o correo inválido
  - Notifications no llegando (check logs en `/api/cron/human-requests-monitor`)
  - Humanos no leyendo correos (revisar copy del template)

### Response precision (golden test metric)
Correr manualmente pre-rollout:
```bash
npx tsx scripts/eval/run-pedir-a-humano.ts
```

Esperado: >=95% precision (agent llamando la tool solo cuando debe). Si baja de 95%:
- Revisar directorio interno (¿especificidades claras?)
- Revisar prompt del agent (¿directivas conflictivas?)
- Ajustar fixtures golden si context cambió significativamente

### Redirect chain depth
```sql
SELECT
  COUNT(*) FILTER (WHERE cancellation_reason LIKE 'redirected_to%') AS redirects,
  COUNT(*) AS total
FROM human_requests
WHERE created_at > NOW() - INTERVAL '7 days';
```

Esperado: <20% de requests con redirect (significa humano A → B → C es raro). Si sube:
- Revisar copy de UI (¿humanos entienden qué significan los tipos?)
- Revisar directorio interno (¿targets equivocados?)

## Kill triggers automáticos

- **Timeout rate > 30%** → Revisar canales de notificación. Si emails no llegan, verificar:
  - SMTP logs en Vercel
  - Targets en `human_requests.target_email` válidos (query: `SELECT DISTINCT target_email FROM human_requests WHERE status='pending'`)
  - Si Mail provider de cliente está down, escalar manualmente al Aprobador

- **Precisión golden test < 90%** → El agent está llamando la tool en contextos invalidados. Posibles causas:
  - Directorio interno cambió (nueva persona, rol ambiguo)
  - Prompt del agent cambió de sesión anterior (revisar `git diff` del prompt-builder)
  - Contexto de negocio incompleto (`business_description` vacío)
  - Fix: iterar prompt del agent, re-run golden test, esperar >=95% antes de mergear cambios de prompt

- **Queja de cliente** ("recibí un correo que nunca pedimos") → Revisar si es la tool o auto-reply del classifier:
  - Query: `SELECT * FROM human_requests WHERE agent_id = <id> AND created_at > NOW() - INTERVAL '24 hours'`
  - Si hay requests recientes, revisar qué disparó (¿humano aprobó sin verificar?)
  - Si no hay requests, es problema del auto-classifier (otra queue)
  - **Kill trigger:** Per-org `UPDATE organizations SET human_handoff_disabled_at = NOW()`, ajustar prompt, habilitarlo de nuevo en 24h

- **Bucket lleno o upload fallando** → `human-request-files` bucket puede saturarse.
  - Query: `SELECT COUNT(*) FROM human_requests WHERE jsonb_array_length(response_files) > 0`
  - Si hay miles de archivos, implementar garbage collection (marca archivos >30d para delete)
  - Manual cleanup: `DELETE FROM storage.objects WHERE bucket_id = 'human-request-files' AND created_at < NOW() - INTERVAL '30 days'`

## Rollout escalonado (per spec §11)

### Deploy 1 Checklist (Día 0)

- [ ] **SQL:** Aplicar `sql/human_requests.sql` en Supabase (verificar con `sql/tests/human_requests.verify.sql`)
- [ ] **Storage bucket:** Crear `human-request-files` privado (ver sección anterior)
- [ ] **Código:** Mergear tasks 1-14 (SQL a runbook)
- [ ] **Feature flag:** Global `HUMAN_HANDOFF_ENABLED=false` en Vercel (default cerrado)
- [ ] **Feature flag:** Per-agent default `features.human_handoff_enabled = false` para agentes existentes
- [ ] **Cron:** Verificar en `vercel.json` que `/api/cron/human-requests-monitor` está configurado (schedule `0 */2 * * *`)
- [ ] **Smoke test:** Correr `npx tsx scripts/smoke/pedir-a-humano.ts` → 5/5 passed

### Validación Piloto (Días 1-2)

Sofía = piloto interno. Nazre (o ejecutor designado):

- [ ] **Enable Sofía:**
  ```sql
  UPDATE voice_agents SET features = jsonb_set(features, '{human_handoff_enabled}', 'true'::jsonb)
  WHERE agent_name = 'Sofía';
  ```

- [ ] **Manual E2E checklist (5-10 casos):**
  - [ ] Email de "cliente pide fotos" → Sofía invoca `pedir_a_humano` → row en `human_requests`
  - [ ] Notif llega al aprobador en <2 min
  - [ ] Click en link del correo abre portal `/portal/[token]/requests/[id]`
  - [ ] Upload de archivos → PATCH succeeds → toast de confirmación
  - [ ] En <60 seg, el ops_inbox original se regenera con foto adjunta
  - [ ] Cliente recibe respuesta con el asset incluido

  Repetir 5-10 veces con variantes: `type=info/action/approval`, `urgency=baja/media/alta`, `redirect=si/no`.

- [ ] **Golden test:** `npx tsx scripts/eval/run-pedir-a-humano.ts` → >=95% precision
- [ ] **Timeout test:** Dejar 1 request sin responder 7d, verificar que `status='timeout'` y agent resume con context "sin respuesta"
- [ ] **Logs inspection:** Verificar en Vercel logs que no hay `[ERROR]` en prefijos `[human-handoff]`, `[notify]`, `[resume]`

**Go/No-go decision:**
- Si >=8/10 casos exitosos Y golden test >=95% → **Go to rollout gradual**
- Si <8/10 → Iterar prompt del agent, ajustar templates notif, re-test

### Rollout Gradual (Día 3, Semana 1)

Habilitar para **3-5 clientes trust_stage=3** (primeros adoptadores):

```sql
UPDATE voice_agents
SET features = jsonb_set(features, '{human_handoff_enabled}', 'true'::jsonb)
WHERE agent_id IN (
  SELECT id FROM voice_agents
  WHERE trust_stage = 3
  ORDER BY created_at DESC
  LIMIT 5
);
```

- [ ] Notify a clientes via email: "Nuevo feature: puedes pedir ayuda a tu equipo directamente desde el agente"
- [ ] Monitoreo semanal §8.6: revisar status overview, timeout rate, redirect chains
- [ ] Si timeout_pct > 30%: hold en rollout, debug con Nazre

### Rollout Completo (Semana 2-3)

Default `true` para TODOS los nuevos agentes con `trust_stage >= 2`:

```sql
-- SQL migration para setup de nuevos agentes
-- En voice_agents.create(), setear features.human_handoff_enabled = (trust_stage >= 2)
```

Opcionalmente: enable para agentes existentes trust_stage=2:

```sql
UPDATE voice_agents
SET features = jsonb_set(features, '{human_handoff_enabled}', 'true'::jsonb)
WHERE trust_stage = 2;
```

- [ ] Notify todos los clientes con email sobre el cambio
- [ ] Monitor semanal dos semanas más
- [ ] Recopilar feedback via chat/email support

## Manual intervention: activar/desactivar por agente

**Activar:**
```sql
UPDATE voice_agents
SET features = jsonb_set(features, '{human_handoff_enabled}', 'true'::jsonb)
WHERE id = '<agent-uuid>';
```

Verificar:
```sql
SELECT features->>'human_handoff_enabled' FROM voice_agents WHERE id = '<agent-uuid>';
```

**Desactivar:**
```sql
UPDATE voice_agents
SET features = jsonb_set(features, '{human_handoff_enabled}', 'false'::jsonb)
WHERE id = '<agent-uuid>';
```

**Verificar per-agent status:**
```sql
SELECT
  agent_name,
  trust_stage,
  features->>'human_handoff_enabled' AS handoff_enabled,
  (SELECT COUNT(*) FROM human_requests WHERE agent_id = va.id AND status='pending') AS pending_requests
FROM voice_agents va
ORDER BY agent_name;
```

## Manual intervention: activar/desactivar por organización

**Desactivar temporalmente** (cliente reporta bug o abusan de feature):
```sql
UPDATE organizations
SET human_handoff_disabled_at = NOW()
WHERE id = '<org-uuid>';
```

**Re-habilitar:**
```sql
UPDATE organizations
SET human_handoff_disabled_at = NULL
WHERE id = '<org-uuid>';
```

**Buscar org por email:**
```sql
SELECT id, portal_email, human_handoff_disabled_at
FROM organizations
WHERE portal_email = 'cliente@ejemplo.com';
```

## Cron invocation (manual testing)

**URL:** `https://centinelia.mx/api/cron/human-requests-monitor`
**Auth:** Bearer token = `CRON_SECRET` environment variable
**Method:** GET o POST (no body required)

**Manual test (localhost):**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/human-requests-monitor
```

**Expected response:**
```json
{
  "reminded": 3,
  "escalated": 1,
  "timed_out": 0,
  "errors": 0
}
```

**Vercel trigger (una sola vez):**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<deployment>.vercel.app/api/cron/human-requests-monitor
```

## Deploy 2 Checklist (Post-piloto validado, Semana 2-3)

- [ ] Global enable: `HUMAN_HANDOFF_ENABLED=true` en Vercel (allow tool registration)
- [ ] Default true para nuevos agentes trust_stage>=2
- [ ] Rollout gradual completado (3-5 clientes)
- [ ] Monitoring semanal x2 semanas: sin anomalías críticas
- [ ] Golden test >=95%
- [ ] Timeout rate <30%
- [ ] Feedback positivo de pilotos

## Observabilidad

**Log prefixes:**
- `[human-handoff]`: handler + guard checks
- `[notify]`: dispatch notif + template rendering
- `[resume]`: loop-close + re-run agent
- `[hrm]`: cron (`human-requests-monitor`)

**Buscar errores en Vercel logs:**
```
function_logs:[human-handoff] ERROR
function_logs:[notify] ERROR
function_logs:[resume] ERROR
function_logs:[hrm] ERROR
```

**Alerts (manual setup recomendado):**
- Si logs contain `[human-handoff] ERROR` + frecuencia > 10/h en 1h window → escalate to Nazre
- Si `timeout_pct > 30%` en query semanal → revisar targets, canales
- Si bucket lleno (objetos > threshold) → cleanup automático o manual

## Common operations

### Extend timeout para un request específico
```sql
UPDATE human_requests
SET needed_by = NOW() + INTERVAL '7 days'
WHERE id = '<request-uuid>';
```

(Nota: sistema no usa `needed_by` para auto-cancel, pero visible al humano en UI.)

### Cancelar request específico (humano no puede ayudar)
**Via portal:** Humano abre link → "No puedo ayudar" → PATCH con cancel.
**Via SQL (admin):**
```sql
UPDATE human_requests
SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'manual_admin_cancel'
WHERE id = '<request-uuid>';
```

### Re-trigger resume para un request (si fell mid-flight)
```sql
UPDATE human_requests
SET resume_triggered_at = NULL
WHERE id = '<request-uuid>';
-- Cron próximo ciclo (max 2h) lo detecta y retry.
```

O manual:
```bash
# Invocar resumeAgentAfterHumanResponse(requestId) via CLI/script
npx tsx scripts/ops/resume-human-request.ts <request-uuid>
```

### Buscar requests de un agente (debugging)
```sql
SELECT
  id, title, status, urgency, created_at, responded_at,
  target_email, cancellation_reason
FROM human_requests
WHERE agent_id = (SELECT id FROM voice_agents WHERE agent_name = 'Sofía')
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

### Buscar requests by target (qué le pidieron a Juan)
```sql
SELECT
  agent_name, title, request_type, status, created_at,
  (EXTRACT(EPOCH FROM (responded_at - created_at))/3600)::int AS hours_to_respond
FROM human_requests
JOIN voice_agents ON human_requests.agent_id = voice_agents.id
WHERE target_email = 'juan@empresa.com'
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

## Rollback plan

**If critical bug found mid-piloto (Deploy 1):**

1. **Immediate:** Global disable via env
   ```
   HUMAN_HANDOFF_ENABLED=false
   Redeploy
   ```
2. **Verify:** Check logs — no new tool calls in next 5 min
3. **Assess:** Debug issue (spec mismatch, schema bug, etc.)
4. **Fix:** Patch code + SQL if needed
5. **Re-test:** Golden test + manual checklist
6. **Redeploy:** With fix

**If discovered in Deploy 2 (post-rollout gradual):**

1. **Per-org disable** for affected organizations
   ```sql
   UPDATE organizations SET human_handoff_disabled_at = NOW()
   WHERE id IN (<affected-org-uuids>);
   ```
2. **Notify** affected customers
3. **Debug** + fix
4. **Re-enable** per-org after patch validated

**Data retention post-rollback:**
- `human_requests` table and all requests preserved (no delete)
- Portal links still work for completed requests (historical view)
- Pending requests display "this feature is temporarily disabled" message

## References

- **Spec:** docs/superpowers/specs/2026-07-30-human-handoff-design.md
- **Plan:** docs/superpowers/plans/2026-07-30-human-handoff.md
- **Memory:** [Centinelia Portal Security](../../memory/centinelia-portal-security.md)
- **Auto-mode runbook:** docs/runbooks/auto-mode-classifier.md (parent pattern)
- **Monitoring guides:** Supabase SQL queries, Vercel logs, error tracking
