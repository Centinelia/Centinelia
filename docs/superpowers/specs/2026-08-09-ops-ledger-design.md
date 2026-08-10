# Ops Ledger — Full event-sourcing con audit para stripe y annual_prepaid

**Fecha:** 2026-08-09
**Estado:** Diseño aprobado, pendiente writing-plans
**Autor:** Sesión brainstorming con Nazre

## Contexto y motivación

Hoy `voice_agents.ai_ops_used`/`ai_ops_limit` y `organizations.monthly_ops_pool`/`monthly_ops_used` son contadores directos. `/api/portal/buy-ops` genera checkouts `extra_ops` que el webhook simplemente hace `ai_ops_limit + ops` — sin cap, sin ledger, sin tracking histórico de qué se agregó/perdió.

Consecuencia inmediata: cuando un cliente enterprise (municipio con contrato annual) pregunte "¿cuántas tareas perdí este ciclo?", no tenemos respuesta con evidencia. En una auditoría formal esto es un problema mayor: no hay prueba matemática ni trazabilidad de credits, consumo y pérdidas.

**Principio establecido:** "Minutos y tareas son nuestra moneda, es lo que vendemos. Necesitamos full transparencia y control sobre lo que pasa con estos insumos." Consecuencia de diseño: full event-sourcing con paridad completa entre stripe y annual_prepaid.

Este spec **cierra la última deuda** de la iniciativa rollover-perdido (dashboard admin de minutos + card en portal + notificación event-driven ya están en producción — ver [[deuda_metrica_rollover_perdido]]).

## Objetivos

1. **Auditabilidad total de tareas** para cliente stripe y annual: una query única sobre `ops_ledger` reconstruye el historial completo (grants, credits, consumo, pérdidas).
2. **Paridad completa con minutes_ledger** en semántica, funciones SQL, cache, trigger y helpers TS.
3. **Cap 2× enforcement** para credits stripe (idéntico a minutos).
4. **Audit trail explícito** para annual: `unused_forfeited` events cuando el ciclo cierra con balance positivo.
5. **Transparencia visible** en portal cliente y en admin dashboard unificado.
6. **Sin backfill** — arranca de cero (no hay clientes reales aún, ver [[reminder_billing_pool_e2e_test]]).

## Decisiones tomadas

| Decisión | Elegido | Descartadas |
|---|---|---|
| Política de cap ops | 2× base (mismo que minutos) | Cap más generoso, sin cap, cap configurable |
| Schema | Nueva tabla `ops_ledger` espejo | Extender `minutes_ledger` con `resource_type`, rename a `pool_ledger` |
| Migración | Sin backfill | Backfill initial_state, backfill histórico Stripe |
| Alcance refactor | Full parity (credits + consumption + annual) | Solo credits, Phase 1 + documentar Phase 2 |

## Arquitectura

### Nueva tabla `ops_ledger`

Mirror exacto de `minutes_ledger`:

```sql
CREATE TABLE ops_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  TEXT REFERENCES organizations(portal_email) ON DELETE SET NULL,
  agent_id      UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
  amount        INT NOT NULL,
  kind          TEXT NOT NULL,
  source        TEXT,
  reference_id  TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ops_ledger_portal_email_idx ON ops_ledger(portal_email);
CREATE INDEX ops_ledger_reference_id_idx ON ops_ledger(reference_id);
CREATE INDEX ops_ledger_kind_created_idx ON ops_ledger(kind, created_at DESC);
```

**Kinds aceptados:**

| Kind | Sentido | Modelo | Fuente |
|---|---|---|---|
| `renewal` | Crédito mensual del plan | stripe | invoice.paid webhook |
| `extra_ops_purchase` | Cliente compró paquete extra | stripe | extra_ops checkout webhook |
| `auto_refill_ops` | Recarga automática (Stripe PI) | stripe | executeAutoRefillOps |
| `setup_new_agent` | Nuevo empleado incorporado | stripe | checkout.session.completed |
| `jornada_change` | Cambio a jornada con tareas | stripe | activate-voice + webhook |
| `admin_adjustment` | Ajuste manual admin (± amount) | ambos | admin/agentes/[id]/ops |
| `rollover_cap` | Descartado por exceder cap 2× | stripe | apply_ops_ledger_entry SQL (auto) |
| `annual_grant` | Grant mensual del contrato | annual | apply_ops_annual_grant SQL |
| `unused_forfeited` | Balance no consumido al reset | annual | apply_ops_annual_grant SQL |
| `consumption` | Cada ejecución de tool/ops | ambos | consume_pool_ops RPC |

### Nueva tabla cache `account_ops`

Mirror de `account_minutes`:

```sql
CREATE TABLE account_ops (
  portal_email    TEXT PRIMARY KEY,
  ops_included    INT NOT NULL DEFAULT 0,   -- cap actual (2× stripe | grant annual)
  ops_used        INT NOT NULL DEFAULT 0,   -- consumo últimos 30 días
  ops_balance     INT NOT NULL DEFAULT 0,   -- SUM(ops_ledger.amount)
  ops_reset_date  DATE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Funciones SQL

**1. `get_ops_pool_balance(portal_email) → INT`**
```sql
SELECT COALESCE(SUM(amount), 0)::INT
FROM ops_ledger
WHERE portal_email = p_portal_email;
```

**2. `get_ops_pool_cap(portal_email) → INT`** — branchea por billing_model:
- Si `organizations.billing_model = 'annual_prepaid'`: cap = `annual_contracts.monthly_ops_pool` del contrato activo.
- Si stripe: cap = 2 × SUM(`voice_agents.ai_ops_limit`) para agentes activos con `billing_status='activo'`.

**3. `apply_ops_ledger_entry(portal_email, agent_id, amount, kind, ref_id, desc) → void`**

Mirror de `apply_ledger_entry`. Cap enforcement solo aplica a modelo stripe:
- Si stripe y `amount > 0` y `(balance + amount) > cap`:
  - `excess = balance + amount - cap`
  - INSERT `kind='rollover_cap'` amount=−excess con mismo `reference_id` (para match posterior en notify)
- INSERT del credit con `p_amount` completo.

Para annual, `apply_ops_ledger_entry` no se usa con `amount > 0` (annual usa `apply_ops_annual_grant`). Si por error se llama con annual + amount>0, no se aplica cap (grant queda intacto).

**4. `apply_ops_annual_grant(portal_email) → void`** (nueva, solo annual)
1. `unused := get_ops_pool_balance(portal_email)`
2. Si `unused > 0`: INSERT `kind='unused_forfeited'` amount=−unused con descripción `"Se pierden N tareas no consumidas del ciclo anterior"`.
3. Fetch `monthly_ops_pool` del contrato activo.
4. INSERT `kind='annual_grant'` amount=+monthly_ops_pool.

**5. `consume_pool_ops(portal_email, agent_id, ops, ref_id, desc) → INT`**
INSERT `kind='consumption'` amount=−ops. Devuelve balance nuevo. Usado tanto por stripe como annual.

**6. `refresh_ops_pool_cache(portal_email) → void`**
Recalcula `account_ops`:
- `ops_included` = `get_ops_pool_cap`
- `ops_used` = SUM(−amount) donde kind='consumption' AND created_at >= NOW() - INTERVAL '30 days'
- `ops_balance` = `get_ops_pool_balance`

**Trigger:** `auto_refresh_ops_pool_cache` AFTER INSERT ON ops_ledger FOR EACH ROW.

## Refactor de call sites

### Credit paths (7 sitios)

Reemplazar UPDATEs directos a `ai_ops_limit`/`monthly_ops_pool` con `apply_ops_ledger_entry`:

| Archivo | Punto | Kind |
|---|---|---|
| `src/app/api/billing/webhook/route.ts` | plan_upgrade (delta ops del nuevo tier) | `renewal` |
| `src/app/api/billing/webhook/route.ts` | extra_ops | `extra_ops_purchase` |
| `src/app/api/billing/webhook/route.ts` | jornada_change checkout | `jornada_change` |
| `src/app/api/billing/webhook/route.ts` | setup_new_agent (post-checkout) | `setup_new_agent` |
| `src/app/api/billing/webhook/route.ts` | invoice.paid renewal | `renewal` |
| `src/lib/billing/auto-refill.ts` | executeAutoRefillOps | `auto_refill_ops` |
| `src/app/api/admin/agentes/[id]/ops/route.ts` (nueva) | credit/debit admin manual | `admin_adjustment` |

### Consumption path

**`src/lib/ai/ops-guard.ts consumeAiOp`** colapsa a un solo path:
1. Resolve portal_email + billing_model.
2. Si `annual_prepaid` sin portal_email → error (annual siempre tiene org).
3. Si `annual_prepaid` con portal_email → `consume_pool_ops` RPC.
4. Si `stripe` con portal_email → `consume_pool_ops` RPC.
5. Si `stripe` standalone (sin portal_email) → path legacy `consume_ai_ops` RPC (agentes demo/dev, no vale reescribir).
6. `ai_ops_log` sigue capturando source/label/context (audit rico, distinto del ledger).
7. Auto-refill threshold check sigue igual, ahora lee balance del ledger.

**`src/lib/annual-contracts/pool-consume.ts consumePoolOps`** refactorizado a llamar `consume_pool_ops` RPC. Overage tracking se mantiene en `organizations.overage_ops`, actualizada por el trigger `auto_refresh_ops_pool_cache` post-INSERT cuando `balance < 0` (en `refresh_ops_pool_cache`: si annual y balance negativo, `overage_ops = -balance`). Evita que la lógica de overage viva en dos lugares.

### Cron `reset-ops-pool`

Ahora hace 2 cosas por org según billing_model:
- **stripe** con `pool_reset_date <= today` y sin invoice.paid llegando (safety net) → `apply_ops_ledger_entry` kind='renewal' amount = plan config del tier.
- **annual_prepaid** con `pool_reset_date <= today` → `apply_ops_annual_grant(portal_email)`.

### Cron `annual-contracts-lifecycle`

Al arrancar contrato nuevo, llama `apply_ops_annual_grant` para insertar el primer grant.

### Legacy columns

- `voice_agents.ai_ops_limit` — se queda (define plan base stripe para `get_ops_pool_cap`).
- `voice_agents.ai_ops_used` — deja de escribirse (todo consumo pasa por ledger). Columna queda dead, se puede borrar en cleanup posterior.
- `organizations.monthly_ops_pool`/`monthly_ops_used` — para stripe dejan de ser source of truth (cache = `account_ops`). Para annual se mantienen actualizadas por trigger (queries UI existentes no rompen).
- `organizations.overage_ops` — se mantiene, actualizada post-consumption cuando `balance < 0`.

## UI y notificaciones

### Admin dashboard — rename + tabs

`/admin/rollover-perdido/` → `/admin/pool-perdido/` con 3 tabs:

1. **Minutos** — dashboard actual sin cambios.
2. **Tareas — Rollover cap (stripe)** — agrega `ops_ledger kind='rollover_cap'` por cliente. Mismo formato que minutos.
3. **Tareas — No consumidas (annual)** — agrega `ops_ledger kind='unused_forfeited'` por cliente. Columnas: cliente, contrato folio, tareas perdidas ciclo actual, ciclos con pérdida, ciclo más reciente, total anual. **Este es el tab que responde al audit de municipio.**

Redirect 301 `/admin/rollover-perdido → /admin/pool-perdido?tab=minutos`. AdminNav label: "Rollover perdido" → "Pool perdido".

### Portal cliente

En hero de tareas del portal, agregar línea ámbar `#B45309` condicional:

- **Stripe:** "N tareas no acumuladas este ciclo por límite de rollover (2× de tu plan base)" — si hay `rollover_cap` últimos 30 días.
- **Annual:** "N tareas no consumidas del ciclo anterior — no acumulan al siguiente" — si hay `unused_forfeited` del último ciclo cerrado.

Query paralela en el mismo Promise.all de page.tsx.

### Historial descargable

Nuevo componente `OpsLedgerSection` (mirror de `MinutesLedgerSection`) en portal `/cuenta` tab.

Nueva ruta GET `/api/portal/[token]/ops-ledger.csv` → CSV con todos los rows del ledger formateados para auditoría externa.

### Notificación event-driven — extender helper

`src/lib/billing/rollover-cap-notify.ts` → `pool-loss-notify.ts` generalizado:

- Signature: `maybeNotifyPoolLoss(supabase, { portalEmail, referenceId, resource: 'minutes' | 'ops' })`.
- Query interno branchea a `minutes_ledger` o `ops_ledger`.
- Rate-limit por resource: `features.rollover_alert_sent_at_minutes` + `features.rollover_alert_sent_at_ops` (flags independientes).
- Email adaptado (tareas vs minutos). Umbrales: 20 min minutos (existente), **10 tareas** ops.
- Callers minutos actualizados (4 existentes) + 5 nuevos de ops (extra_ops_purchase, renewal, jornada_change, setup, auto_refill_ops).

**Annual `unused_forfeited` NO dispara notify** en el momento del reset. En su lugar se incluye en `nox-monthly-report` como sección "Tareas no consumidas este mes: N". Documentado como sub-deuda pequeña.

## Testing

**Golden path E2E manual** (documentado paso a paso en el plan):
1. Cliente stripe compra `extra_ops` que excede cap 2× → verificar `rollover_cap` row + email disparado.
2. Cliente annual cierra ciclo con unused > 0 → verificar `unused_forfeited` row + nada de email.
3. Consumo desde llamada de voz → verificar `consumption` row + cache refresca.
4. Auditoría: query timeline completo para un cliente stripe y otro annual → cuadran matemáticamente.

**Unit / integration tests:**
- Tests de `apply_ops_ledger_entry` con casos borde: amount=0, balance ya en cap, primer credit sin balance previo, agente inactivo.
- Test de `apply_ops_annual_grant` con unused=0 (no forfeit row) y unused>0 (forfeit row).
- Test de `consume_pool_ops` desde ambos billing_models.

## No incluido en este scope

1. **Backfill de datos existentes** — Nazre confirmó sin backfill (no hay clientes reales). Si se decide backfillear después, es una migración one-off separada.
2. **Consolidación de `ai_ops_log` con `ops_ledger`** — `ai_ops_log` tiene metadata rica (label/context/source) útil para debugging; se mantiene como tabla separada.
3. **Merge de `minutes_ledger` + `ops_ledger` en `pool_ledger`** — no ahora. Si se agregan 2+ recursos más (tokens LLM, storage), reconsiderar entonces.
4. **UI de historial minutos** — ya existe (`MinutesLedgerSection`). Solo se replica para ops.
5. **Notify de `unused_forfeited`** — no email al momento del reset; solo en el reporte mensual.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bug en trigger causa loop infinito | Trigger no debe INSERTAR en `ops_ledger`. Solo UPDATE cache. Verificado en review. |
| Race condition con múltiples consumes concurrentes | `consume_pool_ops` usa `INSERT` que es atómico; no requiere FOR UPDATE porque cada evento es independiente. Cap check en `apply_ops_ledger_entry` sí puede tener race — mitigado con lectura fresca de balance dentro del mismo statement (STABLE function inline). |
| Refactor de `consumeAiOp` rompe consumo en producción | Feature flag `organizations.ops_ledger_enabled` para rollout gradual. Off por default; on por cliente. Fallback al path legacy si off. |
| annual_prepaid overage_ops cache desincronizado | Trigger recomputa overage post-INSERT si `balance < 0`. Test explícito. |
| Rename admin path rompe bookmarks | Redirect 301 desde ruta antigua. |

## Orden de implementación sugerido

1. SQL: tablas + funciones + trigger. Aplicar migration.
2. TS: `consume_pool_ops` en ops-guard (con feature flag off). Golden test unit.
3. TS: `apply_ops_ledger_entry` callers stripe (webhook + auto-refill). Feature flag off.
4. TS: `apply_ops_annual_grant` en cron reset-ops-pool + annual-contracts-lifecycle.
5. UI: extender `/admin/pool-perdido` con tabs.
6. UI: extender portal card con línea ámbar de ops.
7. Notify helper generalizado + hooks en credit paths.
8. Historial `OpsLedgerSection` + CSV.
9. Activar `ops_ledger_enabled` en cuenta demo + test E2E.
10. Rollout gradual a annual (municipio será el primer piloto).

## Referencias

- Patrón espejo: `minutes_ledger` + `apply_ledger_entry` + `get_pool_balance/cap` + `refresh_pool_cache` + trigger `auto_refresh_pool_cache`. Ver commit `a43b9503`.
- Vista admin actual (base para tab 1): `src/app/admin/rollover-perdido/page.tsx`.
- Notify actual (base para generalizar): `src/lib/billing/rollover-cap-notify.ts`.
- Portal card actual (base para extender): `src/app/portal/[token]/page.tsx` (buscar `rolloverLostThisCycle`).
- Deudas relacionadas: [[deuda_metrica_rollover_perdido]], [[reminder_billing_pool_e2e_test]].
- Motivación del principio: sesión brainstorming 2026-08-09, memoria `feedback_pool_transparencia`.
