# Opt-in Automations — Deploy 2 (Expand Sources)

**Autor:** Claude Opus 4.7 + Nazre
**Fecha:** 2026-07-30
**Estado:** Deploy 2 live 2026-07-30 (autonomy mode)
**Depende de:** Deploy 1 (spec `2026-07-29-opt-in-automations-design.md`), live desde 2026-07-29

## Contexto

Deploy 1 dejó `heartbeat` y `weekly-insights` con opt-in gating + copy honesto de scope narrow:
- Heartbeat solo lee `voice_calls`
- Weekly-insights solo lee `voice_calls`

El cliente espera que un "reporte de actividad" cubra TODO lo que hace el empleado: llamadas, correos, documentos, tareas, citas. Deploy 2 expande ambos crons a todas las fuentes de actividad relevantes y actualiza el copy del UI.

`learn` no se toca en este deploy (Deploy 3).

## Objetivo

Que el reporte diario y las recomendaciones semanales reflejen la actividad completa del empleado, no solo llamadas. Re-medir costos post-expansión y actualizar rangos en el UI.

## Decisiones clave (a aprobar por Nazre)

| # | Decisión | Elegida (propuesta) |
|---|---|---|
| D1 | Ventana de heartbeat daily vs weekly | Sin cambios — respeta `heartbeat_config.frequency` |
| D2 | Fuentes a incluir en heartbeat | voice_calls + email_messages + ops_documents + agent_tasks + appointments_voice (+ civic_reports si vertical gobierno) |
| D3 | Fuentes a incluir en weekly-insights | Mismas que heartbeat + `agent_learnings` (para ver qué reglas aprendió) |
| D4 | Formato del prompt | Estructura por bloque de fuente ("LLAMADAS:", "CORREOS:", etc.). LLM sintetiza según prioridades. |
| D5 | Cap de items por fuente | Heartbeat: top 20 items por fuente (para caber en context). Weekly-insights: top 30 (más contexto pq comparación semana vs anterior) |
| D6 | Task vacía + heartbeat (UX gap) | Rediseñar: el `task` en heartbeat_config se vuelve OPCIONAL. Si vacío, el LLM sintetiza reporte estándar de actividad. Si presente, respeta la instrucción del usuario. |
| D7 | Ajuste de costo | Re-medir con nuevos prompts. Anticipar aumento ~2-3x en tokens/run por el contexto adicional |
| D8 | Backward compat | Toggles ya activados siguen funcionando; el usuario NO tiene que re-optar-in |
| D9 | Copy del UI | Actualizar description de cada card para reflejar el scope expandido |

## Data model

Sin cambios de schema. Todas las tablas ya existen:

- `voice_calls` (llamadas atendidas)
- `email_messages` (correos manejados — puede requerir join con email_threads)
- `ops_documents` (documentos generados por el empleado)
- `agent_tasks` (tareas completadas, con `outcome` no vacío)
- `appointments_voice` (citas agendadas)
- `civic_reports` (folios en vertical gobierno)
- `agent_learnings` (aprendizajes recientes — solo para weekly-insights)

Verificar en el implementer que las columnas exactas existen antes de escribir queries.

## Cron changes

### heartbeat

Reemplazar la sección "Fetch recent calls for context" (líneas 71-85 actuales) con un fetch multi-tabla:

```typescript
const [calls, emails, docs, tasks, appts] = await Promise.all([
  supabase.from('voice_calls').select('...').eq('agent_id', agent.id).gte('created_at', windowISO).limit(20),
  supabase.from('email_messages').select('...').eq('agent_id', agent.id).gte('created_at', windowISO).limit(20),
  supabase.from('ops_documents').select('...').eq('agent_id', agent.id).gte('created_at', windowISO).limit(20),
  supabase.from('agent_tasks').select('...').eq('agent_id', agent.id).not('outcome', 'is', null).gte('created_at', windowISO).limit(20),
  supabase.from('appointments_voice').select('...').eq('agent_id', agent.id).gte('created_at', windowISO).limit(20),
]);
// + civic_reports si vertical === 'gobierno'
```

Nuevo prompt (esqueleto):
```
Eres {agent_name}, empleado digital de {business_name}.

TAREA DE CHECK-IN:
{cfg.task || "Resume la actividad del día y flagea lo más importante."}

ACTIVIDAD DE {periodLabel}:

LLAMADAS ({calls.length}):
{calls formatted}

CORREOS ({emails.length}):
{emails formatted}

DOCUMENTOS ({docs.length}):
{docs formatted}

TAREAS ({tasks.length}):
{tasks formatted}

CITAS ({appts.length}):
{appts formatted}

Ejecuta la tarea usando toda la información como base. Sé conciso y accionable. Máximo 400 palabras.
```

Ajustar `max_tokens` de 600 a ~800 dado el contexto ampliado.

### weekly-insights

Similar expansión en `generateLLMInsights` (en `src/lib/ai/insights-engine.ts`). Además, comparar semana actual vs anterior por fuente, no solo por métricas de llamadas.

Agregar fetch de `agent_learnings` de los últimos 7 días para incluir en el prompt: "REGLAS APRENDIDAS RECIENTEMENTE: ..."

## UI changes

`src/app/portal/[token]/configurar/AutomationsSection.tsx`:

**heartbeat card:**
- Título: "Reporte diario de actividad" (era "Reporte diario de llamadas")
- Desc: "Cada mañana tu empleado te manda un email con resumen de lo que hizo el día anterior: llamadas, correos, documentos, tareas y citas."
- Costo estimado: actualizar rango con nueva medición

**weekly_insights card:**
- Título: "Recomendaciones semanales" (sin cambio)
- Desc: "Cada lunes recibes 2 a 4 recomendaciones basadas en toda la actividad de tu empleado la semana pasada."
- Costo estimado: actualizar rango con nueva medición

## Testing

**Local E2E:**
- Verificar que un agente sin actividad reciente reciba un reporte "sin actividad" limpio, no un error
- Verificar que un agente con actividad en las 5 fuentes reciba un resumen coherente
- Weekly-insights: correr en un agente con learnings recientes y verificar que aparecen en el output

**Prod smoke:**
- Trigger manual del heartbeat en un agente demo → recibir email → verificar que menciona múltiples fuentes
- Wait 1 semana, correr weekly-insights, verificar que las recs cambian vs pre-Deploy 2

## Métricas post-launch

Actualizar `ESTIMATED_TAREAS_MO` en `automations/route.ts` con las mediciones reales:
- Heartbeat: probablemente sube de 100-200 a 300-500/mes por contexto ampliado
- Weekly-insights: probablemente sube de 40-80 a 100-200/mes

Publicar rangos nuevos y avisar a clientes por email si su costo real diverge >50% del rango publicado.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Prompt demasiado largo → error de context length | Cap 20 items por fuente + truncar campos de texto largo |
| Fuentes vacías generan ruido en el prompt | Omitir sección si count = 0 (mostrar solo secciones no vacías) |
| Costo real >>50% del rango publicado | Cron `check-costs-nightly` que compara últimas 7d con rango publicado; alerta a admin |
| Cliente confundido por copy antiguo hasta que se despliegue el UI | Rollout: backend primero, UI ~1h después |
| Agente sin correo conectado no puede recibir el email de heartbeat | Ya existe validación de `client_email` en heartbeat cron línea 121 |

## Rollout

1. **Merge PR** en `main` → Vercel builda → backend en prod
2. **Verificar 1 corrida del heartbeat cron** (siguiente ejecución en :00 de hora local del agente)
3. **Confirmar copy actualizado** en `/portal/[TOKEN]/configurar` (deploy incluye UI)
4. **Monitor 3-5 días** en `ops_log` para detectar spikes o silences
5. **T+2 semanas:** correr SQL de costos reales, actualizar `ESTIMATED_TAREAS_MO`, hacer PR de refinamiento

Rollback: `git revert` del merge commit; los toggles del usuario NO se pierden (solo el cron code cambia).

## Fuera de scope

- Expansión de `learn` (Deploy 3)
- Cambios al schema de `heartbeat_config`
- Nuevas fuentes fuera de las 5 listadas en D2/D3
- Dashboard de consumo histórico por fuente (nice-to-have)

## Estimación

3-4 días de dev + 1 día de re-medición y refinamiento.
