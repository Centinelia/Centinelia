# Cost Validation — 2026-07-29

**Estado:** Diferido — medición se hará con datos reales de producción durante las primeras 2 semanas post-launch.

## Decisión

El plan original (Task 0) contemplaba correr los 3 crons manualmente en el agente demo (`DEMO_AGENT_ID = 10a70b8b-dad7-432d-bdfb-28f2876071f3`) y medir tokens en el dashboard de Anthropic. En la sesión del 2026-07-29 intentamos hacerlo pero:

1. `heartbeat` retorna `ran:0` en llamadas manuales porque tiene 3 gates: `heartbeat_config.enabled=true`, hora local del agente == `cfg.hour`, y no haber corrido hoy (`heartbeat_last_run_at`). Forzar el estado requiere modificar Supabase directamente, y aun así solo se obtiene 1 data point real por día (el cron se auto-marca como "ran" tras la primera corrida exitosa).
2. `weekly-insights` y `learn` tienen gates equivalentes (frecuencia, integración de correo requerida, etc.).
3. Forzar cada gate y restaurar estado post-medición implicaba ~30-45 min de trabajo con precisión de ±30-50% (n=1 por cron).

Decidimos publicar el UI con estimados iniciales conservadores basados en el tamaño típico de los prompts (leídos del código), marcados explícitamente como aproximados, y refinar con datos reales de producción durante las primeras 2 semanas.

## Estimados iniciales para el UI (Task 6)

Basados en inspección de los prompts en `src/app/api/cron/*/route.ts` y regla de conversión de `consumeAiOp` (aprox. 1 tarea ≈ 1000 input tokens + 250 output tokens):

| Feature | Frecuencia | Costo estimado por corrida | Rango mensual |
|---|---|---|---|
| heartbeat (daily)  | 30/mes | ~5 tareas  | **~100-200 tareas/mes** |
| weekly-insights    | 4/mes  | ~15 tareas | **~40-80 tareas/mes**   |
| learn (biweekly)   | 2/mes  | ~150 tareas| **~200-400 tareas/mes** |

Los rangos incluyen margen del 50%+ para variabilidad por volumen de actividad del cliente.

## Ajuste post-launch (2 semanas)

Consultar `ops_log` filtrado por `source` de cada cron:

```sql
SELECT source, DATE_TRUNC('day', created_at) AS day, SUM(ops_used) AS ops
FROM ops_log
WHERE source IN ('cron_heartbeat', 'cron_weekly_insights', 'cron_learn')
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY source, day
ORDER BY source, day;
```

Con 14 días de data se obtiene rango real por (feature × cliente típico). Actualizar `ESTIMATED_TAREAS_MO` en `src/app/api/portal/[token]/agentes/[agentId]/automations/route.ts` y hacer commit `docs(automations): refine cost estimates from prod data`.
