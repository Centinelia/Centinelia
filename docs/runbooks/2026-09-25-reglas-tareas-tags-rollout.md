# Runbook de Rollout: Reglas, Tareas y Tags (Fase 9)

**Fecha:** 2026-09-25
**Autor:** Centinelia Engineering
**Feature branch mergeado:** `feat/reglas-tareas-tags`

Documento no ejecutable. Define las fases de activación, los comandos SQL de control,
los criterios de avance/retroceso y las métricas de éxito para el rollout del
subsistema Reglas + Tareas + Fichas v2.

---

## Contexto

Tres feature flags per-org en `organizations.features` (jsonb).

> **Nota sobre `setFeatureFlag` programático:** Los comandos SQL de este runbook
> son la forma atómica y preferida para activar flags en producción. La función
> `setFeatureFlag` en código es para uso programático de baja frecuencia
> (onboarding automático, tests de integración) y tiene una race condition teórica
> de lectura-modificación-escritura en el cliente JS. Para activaciones manuales
> de rollout, siempre usar SQL directo.

| Flag | Activa |
|------|--------|
| `agent_missions_enabled` | Bloque de Reglas y Tareas en prompt + cron scheduler + phrase matcher |
| `retrieval_v2_enabled` | Pre-filtro de fichas por whitelist de tags |
| `rerank_enabled` | Rerank con Haiku cuando se pasa el threshold |

Default OFF para todos los orgs. Activacion manual por Nazre, per-org.

Notas importantes:

- El executor v1 narra sin ejecutar tools reales. El cliente debe saber esto antes
  de activar `agent_missions_enabled=true`.
- Migración de `transfer_rules` legacy (Fase 8) debe completarse con `--dry-run`
  antes de activar `agent_missions_enabled` en el primer cliente real.
- Backfill de tags arranca automáticamente cuando se activa `retrieval_v2_enabled`:
  el cron `backfill-ficha-tags` procesa fichas legacy del org cada 10 min.

---

## Fases del rollout

### Fase 0: Deploy dark (sin activación)

**Duración:** 24-48h tras merge a main.

**Objetivo:** Verificar que los flujos existentes son identicos a antes. Cero regresion.

**Pasos:**

1. Merge `feat/reglas-tareas-tags` a main con todos los flags OFF.
2. Deploy a Vercel (produccion).
3. Monitorear durante 24-48h:
   - Latencia p95 de meerkats (Vapi webhook `/api/voice/webhook`).
   - Error rate de conversation endpoints (`/api/portal/[token]/agent-chat`).
   - Costo de tokens Anthropic (dashboard Claude + Nash `infra-alerts` cron).
   - Pool ledger: verificar que no hay cobros inesperados.
4. Si hay anomalia, rollback a commit anterior.

**Criterio para avanzar:** 0 errores nuevos, latencia estable.

---

### Fase 1: Cuenta interna dev (Nazre + Beatriz)

**Duración:** 3-5 días de prueba activa.

**Activar flags (SQL):**

```sql
-- Cuenta de test interna (no cliente real)
UPDATE organizations
SET features = features || '{
  "agent_missions_enabled": true,
  "retrieval_v2_enabled": true,
  "rerank_enabled": true
}'::jsonb
WHERE portal_email = 'nazre20+centinelia-test@gmail.com';
```

**Actividades de prueba:**

- Nazre + Beatriz crean 5 reglas de negocio + 3 tareas + suben 30 fichas para probar autotag.
- Verificar:
  - Tareas se disparan por cron, frase y manual.
  - Meerkats respetan reglas en conversaciones de prueba.
  - Autotag propone tags coherentes en >90% de las fichas nuevas.
  - Bloque de Reglas y Tareas aparece en el system prompt (via logs de Anthropic).
  - Retrieval filtra fichas por whitelist del rol correctamente.

**Criterio para avanzar:**

- 0 errores en ejecución de tareas.
- Reglas visibles en el prompt y respetadas en conversaciones de muestra.
- Autotag >90% coherencia (revision manual de 30 fichas).
- Sin incremento de costo > 20% en el periodo de prueba.

**Bloqueo:** Si algo falla, fix inmediato. No avanzar a Fase 2 hasta corregir.

---

### Fase 2: Santiago NL (cliente inicial con volumen)

**Duración:** 48-72h de observación post-activación.

**Comunicacion previa al cliente:**

Beatriz redacta un mensaje breve (correo o llamada) explicando la mejora en
tono no técnico. Ejemplo de tono:

> "Activamos una mejora en [nombre del empleado digital]: ahora puede seguir
> reglas específicas de su negocio y ejecutar tareas programadas de forma
> automática. La información de trámites también tiene mejor organización."

No mencionar "IA", "flags", "embeddings" ni términos técnicos.

**Activar flags (SQL):**

```sql
UPDATE organizations
SET features = features || '{
  "agent_missions_enabled": true,
  "retrieval_v2_enabled": true
}'::jsonb
WHERE portal_email = '<portal_email de Santiago NL>';
```

Nota: `rerank_enabled` se activa en Fase 4 o cuando el cliente tenga >100 fichas.

**Post-activación:**

- El cron `backfill-ficha-tags` arranca automáticamente y procesa fichas legacy
  del org. Monitorear progreso via Nash `infra-alerts`.
- Verificar que no hay llamadas de error en el webhook de Vapi durante las
  primeras 4h.

**Metricas a monitorear (48-72h):**

- Recall de fichas: % de consultas donde la ficha correcta esta en top-3.
- Latencia de retrieval: debe mantenerse < 1s p95.
- Tasa de reglas respetadas: sin quejas del cliente sobre conductas prohibidas.
- Costo por retrieval: no debe subir > 30% respecto al promedio previo.
- Error rate: 0 errores 5xx en endpoints de chat y voz.

**Criterio para avanzar a Fase 3:**

- 0 quejas del cliente.
- Eval de recall no baja > 10% vs baseline.
- Costo por retrieval no sube > 30%.
- Backfill completo (100% de fichas legacy con autotag_status='done').

**Rollback si algo falla:**

```sql
UPDATE organizations
SET features = features - 'agent_missions_enabled' - 'retrieval_v2_enabled'
WHERE portal_email = '<portal_email de Santiago NL>';
```

---

### Fase 3: Tortilleria Estrella

**Duración:** 5-7 días de observación.

**Activar flags (SQL):**

```sql
UPDATE organizations
SET features = features || '{
  "agent_missions_enabled": true,
  "retrieval_v2_enabled": true
}'::jsonb
WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx';
```

**Atención especial:**

- Nala y Neka son las dos empleadas digitales activas en este cliente.
- Nala tiene flujo de facturacion critico. Monitorear errores en pipeline Nala
  con especial atencion.
- Neka es interna. Verificar que reglas internas no filtran a interacciones
  externas.
- Si el cron de tareas interfiere con el pipeline de facturacion, desactivar
  solo `agent_missions_enabled` para este org hasta revisar.

**Rollback rapido:**

```sql
UPDATE organizations
SET features = features - 'agent_missions_enabled'
WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx';
```

---

### Fase 4: Resto de orgs en batches

**Cadencia:** Batches de 3-5 orgs por semana.

**Programacion sugerida:**

- Activar viernes en la noche (10-11 PM hora MX).
- Monitorear sabado y domingo via Nash `infra-alerts`.
- Evaluar el lunes antes de activar el siguiente batch.

**Priorizacion de orgs:**

1. Orgs con mayor volumen de llamadas semanales.
2. Orgs con fichas_informativas ya cargadas (retrieval_v2 tiene valor inmediato).
3. Orgs con menor riesgo de pipeline critico.

**Activar flags para un org (template):**

```sql
UPDATE organizations
SET features = features || '{
  "agent_missions_enabled": true,
  "retrieval_v2_enabled": true
}'::jsonb
WHERE portal_email = '<portal_email>';

-- Verificar el update
SELECT portal_email, features->>'agent_missions_enabled' as missions,
       features->>'retrieval_v2_enabled' as retrieval
FROM organizations
WHERE portal_email = '<portal_email>';
```

**Desactivar para un org (rollback individual):**

```sql
UPDATE organizations
SET features = features - 'agent_missions_enabled' - 'retrieval_v2_enabled'
WHERE portal_email = '<portal_email>';
```

---

### Fase 5: Ship-complete

**Condicion:** Todos los orgs activos tienen los flags encendidos y sin incidentes
durante 14 días.

**Acciones:**

1. Activar `rerank_enabled` para orgs con >100 fichas:
   ```sql
   UPDATE organizations
   SET features = features || '{"rerank_enabled": true}'::jsonb
   WHERE portal_email IN (
     SELECT portal_email
     FROM fichas_informativas
     GROUP BY portal_email
     HAVING COUNT(*) > 100
   );
   ```

2. Los flags permanecen como kill switches por 60 días adicionales. No eliminar
   el código de gating hasta que pasen 60 días sin incidentes.

3. Programar la tarea de sunset del codigo legacy:
   - Fecha tentativa: 60 días post ship-complete.
   - Revisar si hay orgs con flags OFF y evaluar si ya no son necesarios.

---

## Rollback rapido por flag

### Apagar `agent_missions_enabled` para un org

```sql
UPDATE organizations
SET features = features - 'agent_missions_enabled'
WHERE portal_email = '<afectado>';
```

**Efecto:** Instantáneo en la próxima llamada (TTL de caché de org features = próxima
request o 5 min). Los bloques de Reglas y Tareas desaparecen del prompt; el executor
cancela tareas nuevas; el phrase-matcher retorna null.

### Apagar `retrieval_v2_enabled` para un org

```sql
UPDATE organizations
SET features = features - 'retrieval_v2_enabled'
WHERE portal_email = '<afectado>';
```

**Efecto:** Instantáneo. Retrieval vuelve al path sin filtro por whitelist. Backfill
se detiene automáticamente (el cron omite orgs con flag OFF).

### Apagar `rerank_enabled` para un org

```sql
UPDATE organizations
SET features = features - 'rerank_enabled'
WHERE portal_email = '<afectado>';
```

**Efecto:** Instantáneo. Rerank se salta; los resultados de retrieval se devuelven
en orden de similaridad coseno sin reorden.

### Apagar todos los flags para un org

```sql
UPDATE organizations
SET features = features
  - 'agent_missions_enabled'
  - 'retrieval_v2_enabled'
  - 'rerank_enabled'
WHERE portal_email = '<afectado>';
```

### Verificar el estado actual de los flags para todos los orgs

```sql
SELECT
  portal_email,
  features->>'agent_missions_enabled' AS missions,
  features->>'retrieval_v2_enabled'   AS retrieval_v2,
  features->>'rerank_enabled'         AS rerank
FROM organizations
WHERE features IS NOT NULL
ORDER BY portal_email;
```

---

## Metricas de exito por fase

| Fase | Metrica clave | Umbral de pase |
|------|---------------|----------------|
| Fase 0 | Error rate nuevos | 0 |
| Fase 0 | Latencia p95 meerkat | Sin incremento |
| Fase 1 | Autotag coherencia | >90% |
| Fase 1 | Tareas ejecutadas sin error | 100% |
| Fase 2-3 | Recall fichas (top-3) | No baja >10% vs baseline |
| Fase 2-3 | Costo retrieval | No sube >30% |
| Fase 2-3 | Quejas de cliente | 0 |
| Fase 4 | Error 5xx en lote | 0 |
| Fase 5 | Orgs con flags ON | 100% activos |

---

## Eval periodica (regla 8)

Para garantizar que la calidad no se degrada silenciosamente:

**Set de eval curado:**

- 20 queries reales por cliente activo con >30 días de historia.
- Queries obtenidas de conversaciones reales (anonimizadas).
- Baseline medido justo antes de Fase 4 (primer batch masivo).

**Ejecucion:**

- Semanal durante las primeras 4 semanas post Fase 4.
- Mensual despues de estabilizacion.
- Script: `pnpm tsx scripts/eval-retrieval.ts` (a crear en Fase 5 si no existe).

**Metricas:**

- Recall@3: % de queries donde la ficha correcta esta en las top-3.
- Precision@3: % de las 3 fichas devueltas que son relevantes.
- Latencia media de retrieval.

**Alerta si:**

- Recall baja >10% vs baseline.
- Latencia sube >50% vs p50 historico.

---

## Rulings del ledger relevantes al rollout

1. **Executor v1 narra sin ejecutar tools reales** (ledger ruling del spec Seccion 8.2):
   El status final de las tareas es `narrated`, no `success`. El cliente debe entender
   que las tareas describen lo que harian pero no ejecutan acciones reales aun. Comunicar
   esto antes de activar `agent_missions_enabled=true` en cualquier cliente real.

2. **Migracion de transfer_rules legacy** (Fase 8.1):
   La migración con `--dry-run` debe completarse antes del merge a main (Task 8.2).
   Activar `agent_missions_enabled` en un org que aun tiene `transfer_rules` no
   migradas genera duplicados de reglas. Verificar con:
   ```sql
   SELECT COUNT(*) FROM voice_agents
   WHERE transfer_rules IS NOT NULL
     AND length(transfer_rules) > 5;
   ```
   Si retorna > 0, correr el script de migración primero.

3. **Backfill autotag costo cero al cliente** (Global Constraint del plan):
   El backfill usa `bill_to = 'centinelia_migration'`. Verificar que el pool del
   cliente no se decremente durante el backfill con:
   ```sql
   SELECT COUNT(*), SUM(ops_used) FROM pool_ledger
   WHERE bill_to = 'centinelia_migration'
     AND created_at > NOW() - INTERVAL '24h';
   ```

4. **SMTP requiere IMAP APPEND** (feedback_smtp_imap_append):
   Si las tareas programadas incluyen envio de correo, verificar que el meerkat tiene
   IMAP APPEND configurado para que los correos aparezcan en "Enviados" del cliente.

---

## Contactos de escalacion

- **Incidente critico en produccion:** Nazre (nazre20@gmail.com)
- **Revision de eval:** Beatriz (operaciones Centinelia)
- **Rollback de emergencia:** cualquier miembro con acceso a Supabase SQL Editor

---

*Runbook generado como parte de la Fase 9 del plan Reglas, Tareas y Tags en Fichas.*
*Para la historia del plan y las decisiones de diseno, ver:*
*`docs/superpowers/plans/2026-09-24-reglas-tareas-y-tags-fichas.md`*
