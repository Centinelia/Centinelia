---
name: centinelia-reporte-semanal
description: "Genera y envía reportes semanales de métricas a todos los clientes activos de Centinelia. Dispara el cron de ops-reports o genera reportes individuales cuando no hay uno programado."
---

# Centinelia — Reporte Semanal de Clientes

## Qué hace este skill

Cuando se invoca `/centinelia-reporte-semanal`, genera y envía reportes ejecutivos de la semana a todos los clientes activos de Centinelia.

## Cómo ejecutarlo

### Opción A — Disparar el cron existente (preferida)

El cron `/api/cron/ops-reports` ya procesa todos los `ops_reports` activos con `next_run_at <= NOW()`. Para forzar su ejecución manual:

```
GET https://www.centinelia.mx/api/cron/ops-reports
Authorization: Bearer {CRON_SECRET}
```

Reporta cuántos reportes se ejecutaron y si hubo errores.

### Opción B — Generar reporte consolidado para revisión interna

Si Nazre quiere un resumen interno de todos los clientes (no enviar emails, solo ver el estado):

**1. Obtener todos los portales activos:**
```sql
SELECT DISTINCT portal_email, business_name, minutes_used, minutes_included, 
       minutes_reset_date, plan, active
FROM voice_agents
WHERE active = true
ORDER BY portal_email;
```

**2. Para cada portal, obtener métricas de la semana:**
```sql
SELECT 
  agent_id,
  COUNT(*) as total_calls,
  SUM(CASE WHEN outcome = 'lead_created' THEN 1 ELSE 0 END) as leads,
  SUM(CASE WHEN outcome = 'appointment_booked' THEN 1 ELSE 0 END) as citas,
  SUM(CASE WHEN outcome = 'order_taken' THEN 1 ELSE 0 END) as pedidos,
  ROUND(SUM(duration_seconds)::numeric / 60, 1) as minutos
FROM voice_calls
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY agent_id;
```

**3. Formato del resumen interno:**

```
CENTINELIA — RESUMEN SEMANAL INTERNO [FECHA]

CLIENTES ACTIVOS: N

[NEGOCIO] — [portal_email]
Plan: [plan] | Minutos: [used]/[included] ([%])
Llamadas: N | Leads: N | Citas: N | Pedidos: N
---

ALERTAS:
- [negocio]: uso al 90% de minutos — considerar notificación
- [negocio]: 0 llamadas esta semana — verificar número activo
```

### Si se usa con /schedule

Para automatizar: `/schedule` todos los lunes a las 8:00 AM ejecuta este skill. El goal es: generar y enviar todos los reportes pendientes en menos de 5 minutos de ejecución.

## Datos de conexión

Variables en `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## Notas

- Si un cliente no tiene `ops_reports` configurado, ofrece crearlo desde el portal admin
- Los reportes ya configurados los maneja el cron automáticamente — este skill es para forzar ejecución o generar el resumen interno
