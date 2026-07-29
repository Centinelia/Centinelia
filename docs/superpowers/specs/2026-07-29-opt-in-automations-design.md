# Opt-in Automations — Design

**Autor:** Claude Opus 4.7 + Nazre
**Fecha:** 2026-07-29
**Estado:** Draft — pendiente review de Nazre

## Contexto

Al activar los 24 crons de Vercel post-migración, Nazre notó que 3 crons consumen tareas del pool de cada agente sin control del cliente:

- `heartbeat` — reporte diario de actividad. YA tiene opt-in (`heartbeat_config.enabled`) y ya consume vía `consumeAiOp`.
- `weekly-insights` — recomendaciones semanales. NO tiene opt-in, corre para todos.
- `learn` — aprendizaje continuo desde correos. NO tiene opt-in, corre para todos con correo conectado.

Un cuarto cron (`batch-eval`) también consume tareas pero es análisis interno de calidad para el dashboard de Centinelia — Nazre confirmó que Centinelia lo absorbe (no se factura al cliente). Sin cambios.

Además el alcance actual de los 3 crons es limitado:
- Heartbeat + weekly-insights: solo analizan `voice_calls`
- Learn: solo lee correos

El cliente esperaría que un "reporte de actividad" cubra TODO lo que hace el empleado: llamadas, correos manejados, documentos creados, tareas completadas, citas nuevas. Similar para recomendaciones y aprendizaje.

## Objetivo

Que el cliente decida qué automatizaciones activar y pague por ellas transparentemente, con visibilidad del costo estimado. Al mismo tiempo, expandir los 3 crons a todas las fuentes de actividad del empleado (no solo llamadas o solo correos).

## Decisiones clave (aprobadas)

| # | Decisión | Elegida |
|---|---|---|
| D1 | `batch-eval` billing | Centinelia absorbe (no cambia) |
| D2 | Control de activación | Cliente self-service en portal |
| D3 | Comportamiento sin quota | Skip silencioso + email 1x/semana al cliente |
| D4 | Ubicación UI | Nueva sección `Automatizaciones` en `/portal/[token]/configurar` |
| D5 | Visibilidad de costo | Transparencia total — mostrar tareas/mes junto al toggle |
| D6 | Alcance de los crons | Expandir a todas las fuentes de actividad (calls + emails + docs + tasks + appointments) |
| D7 | Ajuste de costo por expansión | Proporcional al aumento de data procesada |
| D8 | Frecuencia de `learn` | Quincenal fijo (no selector). Reduce de ~1,400 a ~700 tareas/mes; accesible desde Jornada Completa |
| D9 | `heartbeat_config` migration | NO migrar; mantener dual con sync automático en el endpoint PATCH |
| D10 | Estimados de costo iniciales | Validar en agente demo ANTES del UI. Publicar como rango con "aprox." |
| D11 | Rollout | 3 deploys separadas: Fase 1+2 (backend + UI narrow), Fase 3 (expansión heartbeat+insights), Fase 4 (expansión learn) |

## Data model

Agregar en `voice_agents.features` (JSONB existente):

```typescript
features: {
  // ... existentes (vertical, outbound_calls, etc.)
  automations?: {
    heartbeat?: {
      enabled: boolean;
      // resto sigue en `voice_agents.heartbeat_config` (frequency, hour, task, etc.)
      last_quota_email_sent_at?: string; // ISO
    };
    weekly_insights?: {
      enabled: boolean;
      last_ran_at?: string;
      last_quota_email_sent_at?: string;
    };
    learn?: {
      enabled: boolean;
      last_ran_at?: string;
      last_quota_email_sent_at?: string;
    };
  };
}
```

**Nota de compatibilidad (D9):** `heartbeat` mantiene su config detallada en `heartbeat_config` (frecuencia, hora, día). El campo `features.automations.heartbeat.enabled` se mantiene sincronizado con `heartbeat_config.enabled` vía el endpoint PATCH `/automations` (2 líneas de código de sync). El UI toggle lee de `features.automations.heartbeat.enabled` para consistencia con los otros 2 features. El cron sigue leyendo de `heartbeat_config` sin cambios — cero riesgo para prod.

**No requiere migración SQL** — el campo `features` es JSONB, agregar sub-claves no necesita ALTER TABLE.

## UI — `/portal/[token]/configurar/automatizaciones`

Nueva sub-ruta bajo Configurar. Sidebar existente agrega item "Automatizaciones".

Layout de cada card (una por feature):

```
┌────────────────────────────────────────────────────────┐
│ 📧 Reporte diario de actividad     [toggle: OFF]       │
│                                                         │
│ Cada mañana tu empleado te manda un email con resumen  │
│ de lo que hizo el día anterior: llamadas atendidas,    │
│ correos gestionados, documentos creados, tareas        │
│ completadas y citas agendadas.                          │
│                                                         │
│ Costo estimado: aprox. tareas/mes (medir en validación)│
│ [Configurar hora →]                                    │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 💡 Recomendaciones semanales     [toggle: OFF]         │
│                                                         │
│ Cada lunes recibes 2-4 recomendaciones accionables     │
│ basadas en el análisis de toda la actividad de tu     │
│ empleado la semana pasada.                             │
│                                                         │
│ Costo estimado: aprox. tareas/mes (medir en validación)│
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 🧠 Aprendizaje automático (quincenal) [toggle: OFF]    │
│                                                         │
│ Cada 2 semanas tu empleado aprende reglas de tu       │
│ negocio observando correos, llamadas y documentos.    │
│ Aplica lo aprendido automáticamente si tiene alta     │
│ confianza.                                              │
│                                                         │
│ Costo estimado: aprox. tareas/mes (medir en validación)│
│ Requiere: correo conectado                             │
└────────────────────────────────────────────────────────┘
```

**Nota sobre valores de costo (D10):** Los estimados finales se validan en el agente demo ANTES del launch del UI, corriendo cada cron 3-4 veces y midiendo tokens reales. Los números publicados en el UI serán rangos con "aprox." (ej: "aprox. 200-300 tareas/mes") para dar margen realista.

**Nota sobre `learn` (D8):** Fijado en frecuencia quincenal — schedule del cron `0 9 8,22 * *` (día 8 y 22 del mes a las 9am). Reduce el consumo estimado ~50% vs semanal, haciendo el feature accesible desde el plan Jornada Completa. Si algún cliente requiere semanal, se activa manualmente desde admin.

> **Nota sobre los costos en tareas:** los valores mostrados (250, 80, 1400) son estimados iniciales basados en el consumo teórico. Después del rollout, medir consumo real durante 2 semanas y ajustar copy del UI + tabla de estimados.

## Cron gating

Cada cron ops-hungry agrega filtro al query inicial:

```typescript
// Ejemplo weekly-insights
const { data: agents } = await supabase
  .from('voice_agents')
  .select('id, business_name, role, portal_email, client_email, ai_ops_used, ai_ops_limit, features')
  .eq('active', true)
  .not('portal_email', 'is', null)
  .eq('features->automations->weekly_insights->>enabled', 'true'); // ← NUEVO

for (const agent of agents ?? []) {
  const cost = ESTIMATE_COST(agent); // en tareas
  const ops = await consumeAiOp(agent.id, cost);
  if (!ops.ok) {
    await maybeSendQuotaEmail(agent, 'weekly_insights');
    continue;
  }
  await runFeature(agent);
  await markLastRun(agent.id, 'weekly_insights');
}
```

`heartbeat` ya hace esto (con `heartbeat_config` en vez de `features.automations.heartbeat`). No lo tocamos por ahora; el UI simplemente lee del campo correcto según el feature.

## Expansión de fuentes de datos (D6)

Cada cron debe consultar múltiples tablas y sintetizarlas en un solo prompt LLM:

### heartbeat (reporte diario)
Ventana: últimas 24h (daily) o 7 días (weekly).
Tablas:
- `voice_calls` — llamadas atendidas (outcome, resumen, duración)
- `email_threads` o `email_messages` — correos manejados (subject, tipo de respuesta: auto/manual)
- `ops_documents` — documentos generados (nombre, tipo)
- `agent_tasks` — tareas completadas (título, resultado)
- `appointments_voice` — citas agendadas
- `civic_reports` (si vertical gobierno) — folios creados

Prompt: "Resume la actividad de {agent_name} en las últimas {24h/7d}. Enfoca en resultados de negocio (leads, citas, ventas, escalaciones), no en métricas técnicas."

### weekly-insights (recomendaciones)
Ventana: última semana vs semana anterior (comparativa).
Mismas tablas que heartbeat + `agent_learnings` para ver qué reglas aprendió.
Prompt: "Analiza la semana vs la anterior. Genera 2-4 recomendaciones accionables para mejorar {business_name}."

### learn (aprendizaje continuo)
Ventana: últimos 7 días.
Fuentes:
- `email_messages` — correos (actual)
- **NUEVO:** `voice_calls.transcript` + `voice_calls.summary` — patrones conversacionales
- **NUEVO:** `ops_documents` con `type='decision'` — decisiones capturadas
- **NUEVO:** `agent_tasks` con `outcome` no vacío — patrones de completación

Prompt actual se extiende para procesar cada fuente y consolidar reglas.

## Quota exhausted — email

Template Resend enviado a `agent.client_email`:

**Asunto:** `Tu empleado necesita más tareas`

**Body:**
```
Hola,

{agent_name} intentó ejecutar {automation_label} pero se agotó tu pool
mensual de tareas ({ai_ops_used}/{ai_ops_limit}).

El feature se pausa automáticamente hasta que:
- El pool se resetee el {minutes_reset_date}, o
- Compres un paquete extra de tareas

[Comprar tareas extras] → https://centinelia.mx/portal/{token}/cuenta
[Configurar auto-refill] → https://centinelia.mx/portal/{token}/configurar

Si crees que esto es un error, respóndenos a hola@centinelia.mx.

— Centinelia
```

**Rate limit:** solo 1 email por (agent × automation) cada 7 días. Guardado en `features.automations.<name>.last_quota_email_sent_at`.

## APIs nuevas

### `PATCH /api/portal/[token]/agentes/[agentId]/automations`

Body:
```json
{ "automation": "weekly_insights", "enabled": true }
```

- Valida token del portal + ownership del agente
- Valida dependencias: `learn` requiere al menos 1 integración de email activa
- Actualiza `voice_agents.features` con merge JSONB
- Regresa el nuevo objeto `automations` completo para que el UI actualice sin refetch

### `GET /api/portal/[token]/agentes/[agentId]/automations`

Retorna el estado actual de todas las automations + info de costo estimado (por si el frontend quiere consumir directo en vez de hardcode):

```json
{
  "automations": {
    "heartbeat":       { "enabled": false, "estimated_tareas_mo": 250 },
    "weekly_insights": { "enabled": false, "estimated_tareas_mo": 80  },
    "learn":           { "enabled": false, "estimated_tareas_mo": 1400 }
  },
  "quota": { "used": 45, "limit": 300, "resets_at": "2026-08-01" }
}
```

## Testing

**Unitarios:**
- `consumeAiOp` retorna `ok=false` cuando `ai_ops_used + cost > ai_ops_limit`
- Query builder filtra correctamente por `features->automations->{name}->>enabled = 'true'`
- Email rate limit respeta `last_quota_email_sent_at` de hace <7 días

**Integración:**
- Toggle en UI llama PATCH endpoint y refleja cambio en DB
- Activar `learn` sin correo conectado retorna 400 con mensaje claro
- Cron ejecutando después del toggle: incluye/excluye el agente correctamente

**Manual E2E:**
- Activar heartbeat en 1 agente de prueba, esperar la siguiente ejecución (o forzar cron manual con curl), verificar email llega y `ai_ops_used` incrementa
- Simular pool agotado (poner `ai_ops_used = ai_ops_limit`), correr cron, verificar skip + email recibido
- Correr cron 2 veces consecutivas con pool agotado: verificar que solo se envía 1 email (rate limit funcionando)

## Fuera de scope

- Cambiar `batch-eval` (queda igual, Centinelia absorbe)
- Migrar `heartbeat_config` bajo `features.automations.heartbeat` (compat mantenida)
- Auto-refill Stripe (ya existe `auto_refill_ops`, no se toca)
- UI para configurar horario/frecuencia de heartbeat (mantiene el existente)
- Dashboard de consumo histórico de tareas por feature (nice-to-have futuro)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cliente activa learn con pool pequeño, agota en días | Warning explícito en UI + rate-limited email si agota |
| Expansión de heartbeat sube costos LLM (más contexto) | Batch operations donde posible; usar Haiku 4.5 para heartbeat/weekly-insights (no requieren Opus) |
| Cliente no lee el email de quota agotada | Banner en portal muestra si algún feature está pausado por quota |
| Múltiples features consumen simultáneamente y no está claro cuál causó el agotamiento | Endpoint GET incluye historial últimos 30 días con desglose por feature |
| Test manual E2E requiere esperar cron real | Endpoint admin `/api/admin/cron/trigger` para disparar cualquier cron on-demand (para QA) |

## Plan de rollout (D11 — 3 deploys separadas)

### Pre-work: Validación de costos (D10)
Antes de escribir el UI, correr los 3 crons manualmente en el agente demo (`DEMO_AGENT_ID = 10a70b8b-dad7-432d-bdfb-28f2876071f3`) 3-4 veces cada uno. Medir tokens consumidos vía Anthropic dashboard. Convertir a tareas. Publicar rangos "aprox." en el UI.

### Deploy 1 — Fase 1 + Fase 2 (backend + UI narrow, 3-4 días)
- Backend: gating en los 2 crons (`weekly-insights`, `learn`) por `features.automations.<name>.enabled`
- APIs: `GET/PATCH /api/portal/[token]/agentes/[id]/automations`
- Email template quota-exhausted + rate limit 7 días
- Cambio del schedule de `learn` a quincenal (`0 9 8,22 * *`)
- UI: nueva sección Automatizaciones con toggles + rangos "aprox." validados
- Copy con alcance narrow honesto ("Reporte diario de llamadas", "Recomendaciones basadas en llamadas", "Aprendizaje desde correos")
- Tests unitarios + integración + manual E2E

### Deploy 2 — Fase 3 (expansión heartbeat + weekly-insights, 3-4 días)
- Cada cron consulta múltiples tablas y sintetiza en un prompt LLM extendido
- Ajustar prompts para el nuevo scope
- Actualizar copy del UI: "Reporte diario de actividad (llamadas + correos + documentos + tareas + citas)"
- Re-medir consumo de tareas y actualizar rangos si cambian significativamente
- Tests actualizados para nueva query

### Deploy 3 — Fase 4 (expansión de learn, 2-3 días)
- `learn` procesa correos + calls + docs + tasks
- Ajustar prompt de extracción para múltiples fuentes
- Actualizar copy del UI para reflejar el scope expandido
- Re-medir consumo

Total: ~8-11 días de desarrollo dividido en 3 despliegues. Cada uno con rollback trivial (revert de commit).
