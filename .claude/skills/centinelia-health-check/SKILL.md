---
name: centinelia-health-check
description: "Análisis de salud de clientes de Centinelia. Detecta riesgo de churn, clientes próximos a quedarse sin minutos, cuentas sin actividad, y genera un plan de acción para retención."
---

# Centinelia — Health Check de Clientes

## Qué hace este skill

Cuando se invoca `/centinelia-health-check`, analizas el estado de todos los clientes activos y produces un semáforo de salud con acciones concretas de retención.

## Métricas a evaluar

### 1. Uso de minutos — riesgo de quedarse sin plan

```sql
SELECT 
  v.portal_email,
  v.business_name,
  v.agent_name,
  v.plan,
  v.minutes_used,
  v.minutes_included,
  ROUND(v.minutes_used::numeric / NULLIF(v.minutes_included, 0) * 100, 1) as pct_usado,
  v.minutes_reset_date,
  v.auto_refill_enabled,
  v.client_email,
  v.transfer_whatsapp
FROM voice_agents v
WHERE v.active = true
  AND v.minutes_included > 0
ORDER BY pct_usado DESC;
```

Semáforo:
- 🔴 Rojo: > 90% usado
- 🟡 Amarillo: 70-90% usado
- 🟢 Verde: < 70% usado

### 2. Clientes sin llamadas en los últimos 14 días (inactividad)

```sql
SELECT v.portal_email, v.business_name, v.client_email, MAX(c.created_at) as ultima_llamada
FROM voice_agents v
LEFT JOIN voice_calls c ON c.agent_id = v.id
WHERE v.active = true
GROUP BY v.portal_email, v.business_name, v.client_email
HAVING MAX(c.created_at) < NOW() - INTERVAL '14 days'
   OR MAX(c.created_at) IS NULL;
```

### 3. Clientes con tendencia negativa (esta semana < semana pasada)

```sql
WITH semana_actual AS (
  SELECT agent_id, COUNT(*) as calls_esta_semana
  FROM voice_calls
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY agent_id
),
semana_anterior AS (
  SELECT agent_id, COUNT(*) as calls_semana_anterior
  FROM voice_calls
  WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
  GROUP BY agent_id
)
SELECT v.business_name, v.portal_email,
       COALESCE(sa.calls_esta_semana, 0) as esta_semana,
       COALESCE(sp.calls_semana_anterior, 0) as semana_anterior
FROM voice_agents v
LEFT JOIN semana_actual sa ON sa.agent_id = v.id
LEFT JOIN semana_anterior sp ON sp.agent_id = v.id
WHERE v.active = true
  AND COALESCE(sa.calls_esta_semana, 0) < COALESCE(sp.calls_semana_anterior, 0) * 0.5
ORDER BY esta_semana ASC;
```

### 4. Clientes sin portal_email (sin acceso al portal)

```sql
SELECT business_name, agent_name, client_email
FROM voice_agents
WHERE active = true
  AND (portal_email IS NULL OR portal_email = '');
```

## Formato del reporte

```
CENTINELIA — HEALTH CHECK [FECHA]

RESUMEN: N clientes activos | N en riesgo | N críticos

🔴 CRÍTICOS (acción inmediata):
[negocio] — [issue]: [detalle]
  Acción: [qué hacer]

🟡 ATENCIÓN:
[negocio] — [issue]: [detalle]
  Acción: [qué hacer]

🟢 SALUDABLES: N clientes sin issues

PLAN DE ACCIÓN ESTA SEMANA:
1. Llamar/WA a [negocio] — minutos al 95%, vence [fecha]
2. Reactivar [negocio] — sin llamadas 21 días
3. Activar portal para [negocio] — no tienen acceso
```

## Acciones disponibles al detectar problemas

Si se detecta un cliente crítico, puedes:
1. Redactar un mensaje de WhatsApp para Nazre enviarlo al cliente
2. Redactar un email de seguimiento
3. Crear una tarea recordatorio en el sistema (anotarla en el reporte)

## Si se usa con /schedule

Ideal ejecutar los lunes a las 9 AM. El goal es: completar el análisis de todos los clientes y generar el plan de acción en menos de 10 turnos.

## Datos de conexión

Variables en `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
