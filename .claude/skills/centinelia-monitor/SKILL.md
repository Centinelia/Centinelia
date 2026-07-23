---
name: centinelia-monitor
description: "Monitor diario de calidad de Centinelia. Revisa llamadas del día anterior, detecta fallos y bajos scores de autoevaluación, identifica agentes inactivos, y genera un reporte accionable para Nazre."
---

# Centinelia — Monitor de Calidad Diario

## Qué hace este skill

Cuando se invoca `/centinelia-monitor`, ejecutas un análisis completo de la calidad operacional de Centinelia del día anterior y notificas los problemas encontrados.

## Cómo ejecutarlo

### 1. Obtener datos de ayer

Calcula la fecha de inicio de ayer (00:00:00 UTC) y hoy (00:00:00 UTC). Luego llama a la API de Centinelia:

```
GET https://www.centinelia.mx/api/admin/monitor/quality?from=AYER_ISO&to=HOY_ISO
Authorization: Bearer {CRON_SECRET}
```

Si la ruta no existe aún, usa el cliente Supabase directamente desde el contexto del proyecto (variables en .env.local).

### 2. Métricas a revisar

Ejecuta estas consultas contra Supabase (tabla `voice_calls`):

**Llamadas sin respuesta:**
```sql
SELECT agent_id, COUNT(*) as total
FROM voice_calls
WHERE outcome = 'unanswered'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY agent_id
HAVING COUNT(*) >= 3;
```

**Scores bajos de autoevaluación:**
```sql
SELECT agent_id, AVG(self_eval_score) as avg_score, COUNT(*) as calls
FROM voice_calls
WHERE self_eval_at IS NOT NULL
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY agent_id
HAVING AVG(self_eval_score) < 0.65;
```

**Agentes sin actividad en 7 días (potencialmente inactivos):**
```sql
SELECT v.id, v.agent_name, v.business_name, v.active, MAX(c.created_at) as ultima_llamada
FROM voice_agents v
LEFT JOIN voice_calls c ON c.agent_id = v.id AND c.created_at >= NOW() - INTERVAL '7 days'
WHERE v.active = true
GROUP BY v.id, v.agent_name, v.business_name, v.active
HAVING MAX(c.created_at) IS NULL;
```

**Errores de webhook (ops fallidas):**
```sql
SELECT agent_id, COUNT(*) as ops_fallidas
FROM ops_log
WHERE status = 'error'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY agent_id;
```

### 3. Formato del reporte

Presenta los hallazgos en este formato:

```
CENTINELIA — MONITOR DIARIO [FECHA]

LLAMADAS SIN RESPUESTA (≥3):
- [agente]: N sin responder

SCORES BAJOS (<0.65):
- [agente]: X.XX avg (N llamadas)

AGENTES INACTIVOS (>7 días sin llamadas):
- [agente] — [negocio]

OPS FALLIDAS:
- [agente]: N errores

ACCIONES RECOMENDADAS:
1. [acción concreta]
2. [acción concreta]
```

Si no hay problemas, reporta: "Sin incidencias en las últimas 24 horas."

### 4. Si se usa con /loop

Cuando se combina con `/loop 24h`, ejecuta el monitor cada 24 horas automáticamente. El goal de terminación es: completar el análisis y presentar el reporte en menos de 12 turnos.

## Datos de conexión

Las variables de entorno del proyecto (`.env.local`) tienen:
- `NEXT_PUBLIC_SUPABASE_URL` — URL de Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — clave de servicio para consultas admin
- `CRON_SECRET` — para llamar rutas de cron

## Notas

- Prioridad: llamas sin responder > scores bajos > inactividad > ops errors
- Si un agente tiene múltiples problemas, agrúpalos en una sola sección
- No incluir datos de clientes sensibles en el reporte visible
