---
name: learnings
description: Append-only log de correcciones revisadas y lecciones extraídas. Cada entrada linkea a la capa del brain que se ajustó (policy / skill / decision) o al commit del fix.
type: learning
owner: nazre
last_verified: 2026-08-26
---

# Learnings - append-only

**Regla del archivo:** solo se **agrega** al final. Si una lección queda obsoleta, no se borra: se agrega una nueva entrada abajo que la corrige, con link a la anterior.

Formato de cada entrada:
```
## YYYY-MM-DD - <slug corto del incidente>
**Qué pasó:** ...
**Por qué pasó:** ...
**Lección:** ...
**Capa ajustada:** [[link]] o commit `<sha>`
```

---

## 2026-08-19 - Nox invoca `create_document` con `template=factura`

**Qué pasó:** En E2E chat post-eliminación del flujo manual de `solicitar_factura`, Nox recibió petición de facturar en org sin PAC configurado. En lugar de responder gate `no_pac` y llamar `crear_lead`, invocó `create_document` con `template=factura` - tool que no existe para ese template. La respuesta al usuario fue ambigua.

**Por qué pasó:** El prompt-builder de Nox tenía un fallback genérico "usa create_document para generar el archivo" que colisionaba con el gate `no_pac` de `solicitar_factura`. El modelo eligió el path aparentemente más cercano al output esperado (un documento) sin validar que el template existiera.

**Lección:** Cuando una tool queda gated (retorna `{ error: 'no_pac' }` o similar), el prompt del meerkat debe explicitar **el fallback exacto** (`crear_lead` con nota específica). Fallbacks genéricos ("intenta con otra herramienta") llevan al modelo a inventar combinaciones inválidas.

**Capa ajustada:** commits `ba88abda` + `5d8afbdd`. Prompt-builder actualizado. Escenario E2E documentado en [[../../../.claude/projects/C--Users-Nazre/memory/handoff_post_flujo_manual_pendientes]] para futura re-ejecución.

**Aplica a:** cualquier tool con gate condicional → validar que el prompt del meerkat tenga fallback explícito y probado en E2E.

---

## 2026-08-10 - `crear_contacto_saliente` shipeada solo en voz

**Qué pasó:** Tool shipeada con voice + `executor.ts` handler, pero SIN registro en `agent-chat/route.ts` (`ALL_TOOLS` / `VOICE_TO_CHAT` / `CHAT_TOOL_BY_NAME`). Email sin verificar. Sofia en chat inventó respuestas ("el contacto no existe") durante 3 turnos porque el modelo del chat nunca vio la tool. Detectado en producción con cliente real (Roberto Meireles).

**Por qué pasó:** Falta de checklist explícito para los 3 canales. El desarrollador (yo/asistente) asumió que registrar el handler en `executor.ts` bastaba porque el executor sirve chat+email, sin darse cuenta de que el session tools del chat se arma antes en `agent-chat/route.ts`.

**Lección:** Handler ≠ registro. El LLM del chat necesita ver la tool en su `tools` de la request Anthropic, y eso requiere los 3 mappings en `agent-chat/route.ts`. Sin eso, el modelo inventa.

**Capa ajustada:** hotfix commit `bacb5d2a`. Regla formalizada en [[decisions/2026-08-18-3-canales-obligatorio]]. Checklist ejecutable en [[skills/adding-a-meerkat-tool]].

**Aplica a:** toda tool nueva. Este es el bug #1 recurrente de Centinelia - si el brain solo previene esto en el próximo año, ya justificó su existencia.

---

## 2026-09-15 - Vercel cron hourly skipea slots (~25% miss-rate)

**Qué pasó:** El cron `/api/cron/bitacora-weekly` matcheaba `hour === cfg.hour` exacto (una sola ventana de 1h el sábado 14 MX). Vercel no ejecutó el slot del sábado 12-sept 20:00 UTC y Beatriz + Ramón no recibieron la bitácora de Nelia esa semana. El agente estaba vivo (4 incidencias registradas 11-12 sept); solo falló el trigger del scheduler. El commit `b4b67730` del mismo día ya lo había documentado para `nash-monitor` (~25% miss-rate observado en crons `0 * * * *`).

**Por qué pasó:** Diseño ingenuo: "corre cada hora, matchea una hora exacta". Asume que Vercel garantiza ejecución del slot. No lo garantiza. Con miss-rate 25% en un solo slot semanal, la probabilidad de perder una semana era ~25% (1 de cada 4). En una plataforma con múltiples crons hourly, cualquier cron con "un solo slot crítico" está apostando contra el scheduler.

**Lección:** Ningún cron crítico debe depender de un solo slot. Dos capas obligatorias:
1. **Ventana ampliada:** matchea múltiples horas consecutivas (`hour >= cfg.hour && hour <= cfg.hour + N`) con idempotencia por (agent_id, week_start) o key análoga. N=4 baja miss-rate 25%→0.1%.
2. **Catchup día siguiente:** cron separado que corre 1-2 días después del `day_of_week` configurado y detecta ausencia de row en la tabla de deliveries. Baja miss-rate combinado a ~0.0001%.

**Capa ajustada:** commit `d54e356e` (fix bitacora-weekly). Helpers puros extraídos a `src/lib/bitacora/weekly-flow.ts` con tests en `src/lib/bitacora/__tests__/`. Nuevo cron `/api/cron/bitacora-weekly-catchup` registrado en `vercel.json`.

**Aplica a:** todo cron con envío periódico crítico (bitácoras, resúmenes, reportes ejecutivos, checkpoints de contratos). Revisar en cuanto haya reporte de "no llegó": `ops-reports`, `weekly-summary`, `weekly-insights`, `annual-contracts-payment-check`, `nox-monthly-report`, `billing-daily-report`, `csd-expiry-notify` — todos son "un solo slot semanal/diario" y potencialmente vulnerables.

---

## 2026-09-29 - Outbound de Nelia cobrado como inbound + 40 contacts stuck

**Qué pasó:** Auditoría de primer mes de Nelia @ Tortillería Estrella (primer cliente PyME recurrente pagando 2do mes) descubrió 3 bugs acoplados en el pipeline outbound:

1. `outbound_calls.scheduled_at` es NOT NULL pero `processDueOutboundContacts` no lo pasaba en el insert. El error 23502 quedaba silent (sin try/catch), dejando outbound_contacts en `status='calling'` para siempre. 40 contacts stuck para Nelia.

2. `triggerOutboundCall` en `vapi/outbound.ts` NO pasaba `serverUrl` a nivel de request en el POST a Vapi. Sin ese override, Vapi enrutaba el end-of-call-report al server URL del assistant (`/api/voice/webhook`, el inbound handler). Efecto: 18 outbound calls de Nelia se registraron en `voice_calls` como inbound; el outbound webhook nunca se activaba; los minutos se cobraban con `source='call'` en lugar de `source='llamada_saliente'`. Cero fuga de $$ pero cero visibilidad de outbound vs inbound.

3. `/api/voice/webhook` no tenía guard contra `call.type === 'outboundPhoneCall'`. Con Fix del serverUrl aplicado, si algún outbound legacy llegaba al inbound handler por fallback → doble cobro.

**Por qué pasó:**
- Silent DB inserts (patrón anti). Ningún try/catch alrededor de `.insert()` significaba que constraint violations no dejaban rastro.
- Vapi request-level `serverUrl` no estaba documentado internamente. El legacy path (`/api/outbound/cron` route) sí lo pasaba; el nuevo path (`process-due-contacts.ts` → `triggerOutboundCall`) lo omitía. Divergencia entre rutas no capturada por tests.
- Sin drift detector: 40 contacts stuck y 18 outbound mal registrados se acumularon durante 30+ días sin alerta automática. Solo un humano los detectó por casualidad en una auditoría.

**Lección:**
1. **Vapi outbound siempre requiere `serverUrl` de request-level.** Sin él, el end-of-call cae al assistant serverUrl (típicamente inbound).
2. **Todo `.insert()` en pipeline crítico debe verificar `error`.** Silent fail es inaceptable.
3. **Todo pipeline con state machine necesita drift detector.** Si un estado es "transitorio" (ej. `calling`), un monitor debe alertar si permanece más allá de una ventana razonable.
4. **Vapi API es la fuente de verdad para direction.** `voice_calls` no tiene columna direction; nunca inferir tipo por caller_number o timing.

**Capa ajustada:**
- Fix: commit `52e47b21` (3 archivos: `process-due-contacts.ts`, `vapi/outbound.ts`, `voice/webhook/route.ts`)
- Tests regression: 9 nuevos (`process-due-contacts-scheduled-at`, `outbound-serverurl`, `outbound-guard`)
- Cleanup: `scripts/cleanup-nelia-stuck-outbound.ts` (37 contacts transicionados)
- Drift detectors nuevos en `src/lib/monitoring/`: `stuck-outbound.ts` (contacts en `calling` >2h sin outbound_call) + `outbound-registration.ts` (Vapi vs DB comparando `vapi_call_id`, detecta el smoking gun del bug si vuelve).
- Wired en `/api/cron/infra-alerts` (corre diario 15:00 UTC).
- Policy: [[policies/outbound-audit-checklist]]

**Aplica a:** cualquier pipeline outbound (Nelia, Nia, Noah, Navi, futuros). Cualquier flow que use `triggerOutboundCall`. Debug de reportes tipo "el meerkat no está llamando" → primer paso es el drift detector, segundo comparar Vapi API vs DB, tercero verificar `features` del agente.
