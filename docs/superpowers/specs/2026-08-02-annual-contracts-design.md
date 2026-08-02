# Diseño — Contratos anuales prepagados (gobierno + enterprise)

**Fecha:** 2026-08-02
**Autor:** Nazre + Claude
**Estado:** propuesta, pendiente aprobación de spec formal
**Trigger:** Municipio de Monterrey solicita contrato anual prepagado. Nazre confirma que hará muchos contratos así — se necesita proceso estandarizado.

---

## 1. Contexto

Hoy el 100% de los clientes de Centinelia paga vía Stripe (subscripción mensual, tarjeta). El modelo funciona para SMB pero no encaja con gobierno/enterprise por 3 razones:

1. **Pago fiscal**: municipios pagan por SPEI contra CFDI, no tarjeta recurrente.
2. **Ciclo fiscal**: contratos son anuales (Ene-Dic o año fiscal del municipio), no mensuales.
3. **Pool compartido**: gobierno licita por servicio integral, no por empleado individual.

El sistema actual (con `voice_agents.minutes_included`, crons de payment-failed, grace period) no maneja este modelo sin conflictos.

### Restricción crítica

**Ningún cliente Stripe existente debe cambiar de comportamiento sin acción explícita de Nazre.** Los ~40 clientes actuales tienen que seguir funcionando idénticamente.

---

## 2. Objetivos

1. Coexistencia sana Stripe ↔ Contrato anual en el mismo schema.
2. Admin UI para crear, activar, renovar y expirar contratos anuales.
3. Bloqueo (UI + backend) para que clientes annual no puedan disparar cobros Stripe accidentalmente.
4. Lifecycle automático: pool reset mensual, recordatorios de renovación (60d/15d), auto-expiración.
5. Correos consistentes con el sistema visual de la sesión anterior (dark shell + meerkat identity).

### Non-goals

- Auto-generar CFDIs (Nazre los emite fuera del sistema, sube el PDF/XML al contrato).
- Auto-cobrar SPEI (el municipio hace transferencia manual, Nazre marca "recibido").
- Refunds automatizados (se manejan manualmente por SPEI de regreso).
- Portal de auto-servicio para clientes annual (contratación de empleados/minutos extra es siempre negociada con Nazre).

---

## 3. Arquitectura

### 3.1 Modelo dual convivente

- **Stripe** (default hoy): plan mensual, minutos por agente en `voice_agents.minutes_*`, ciclo renovado por Stripe. Comportamiento actual sin cambios.
- **Contrato anual** (nuevo): pool compartido a nivel `organizations`, ciclo mensual de reset del pool alineado al `start_date` del contrato, pago fuera de Stripe.

La organización es el ancla — todo cliente ya tiene una fila en `organizations` (creada por trigger `ensure_organization` al insertar voice_agent). El nuevo modelo cuelga de ahí.

### 3.2 Schema

Tabla nueva `annual_contracts` (una fila por año contratado — Monterrey 2026 y Monterrey 2027 son dos filas):

```sql
CREATE TABLE annual_contracts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_email        text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  contract_folio            text NOT NULL,       -- CTR-2026-0001 (manual)
  status                    text NOT NULL,       -- draft | active | expired | cancelled
  start_date                date NOT NULL,
  end_date                  date NOT NULL,
  amount_mxn                numeric(12,2) NOT NULL,
  monthly_minutes_pool      int NOT NULL,
  monthly_ops_pool          int NOT NULL,
  included_employees        int,                 -- informativo, sin hard limit
  invoice_folio             text,                -- CFDI: A-4523
  invoice_pdf_url           text,                -- Supabase Storage
  payment_status            text DEFAULT 'received',  -- pending | received | overdue
  payment_received_at       timestamptz,
  renewal_reminder_60d_sent boolean DEFAULT false,
  renewal_reminder_15d_sent boolean DEFAULT false,
  notes                     text,
  created_by                text,
  created_at                timestamptz DEFAULT now(),
  cancelled_at              timestamptz,
  cancelled_reason          text,
  CONSTRAINT annual_contracts_status_check
    CHECK (status IN ('draft', 'active', 'expired', 'cancelled')),
  CONSTRAINT annual_contracts_dates_check CHECK (end_date > start_date),
  CONSTRAINT annual_contracts_payment_status_check
    CHECK (payment_status IN ('pending', 'received', 'overdue'))
);

CREATE UNIQUE INDEX ux_annual_contracts_active_per_org
  ON annual_contracts(organization_email) WHERE status = 'active';
CREATE UNIQUE INDEX ux_annual_contracts_folio ON annual_contracts(contract_folio);
CREATE INDEX idx_annual_contracts_end_date
  ON annual_contracts(end_date) WHERE status = 'active';
```

Cambios en `organizations`:

```sql
ALTER TABLE organizations
  ADD COLUMN billing_model        text NOT NULL DEFAULT 'stripe',
  ADD COLUMN active_contract_id   uuid REFERENCES annual_contracts(id),
  ADD COLUMN monthly_minutes_used int NOT NULL DEFAULT 0,
  ADD COLUMN monthly_ops_used     int NOT NULL DEFAULT 0,
  ADD COLUMN pool_reset_date      date,
  ADD COLUMN overage_minutes      int NOT NULL DEFAULT 0,
  ADD COLUMN overage_ops          int NOT NULL DEFAULT 0,
  ADD CONSTRAINT organizations_billing_model_check
    CHECK (billing_model IN ('stripe', 'annual_prepaid', 'expired'));
```

Trigger de consistencia:

```sql
CREATE OR REPLACE FUNCTION check_billing_model_consistency()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_model = 'annual_prepaid' AND NEW.active_contract_id IS NULL THEN
    RAISE EXCEPTION 'billing_model=annual_prepaid requires active_contract_id';
  END IF;
  IF NEW.billing_model = 'stripe' AND NEW.active_contract_id IS NOT NULL THEN
    RAISE EXCEPTION 'billing_model=stripe cannot have active_contract_id';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_billing_model
  BEFORE INSERT OR UPDATE OF billing_model, active_contract_id ON organizations
  FOR EACH ROW EXECUTE FUNCTION check_billing_model_consistency();
```

### 3.3 Descuento de minutos/ops (post-call, post-op)

**Regla:** `voice/webhook` y `executor.ts` consultan `organizations.billing_model` de la org antes de descontar.

- `stripe` → descuenta de `voice_agents.minutes_used` / `ai_ops_used` (comportamiento actual, cero cambio).
- `annual_prepaid` → descuenta de `organizations.monthly_minutes_used` / `monthly_ops_used`. Si excede el pool mensual, incrementa `overage_minutes` / `overage_ops` acumulativo.

Cero impacto en Stripe clients.

---

## 4. Admin UI

Ubicación: **rename `/admin/billing` → `/admin/facturacion`** con 3 tabs. Redirect retro-compat de `/admin/billing`.

### 4.1 Tab "Stripe"

Lo que existe hoy. Sin cambios.

### 4.2 Tab "Contratos anuales"

**Vista lista:**

- KPIs top: activos, próximos a expirar (60d), monto total del año fiscal actual.
- Filtros: estado (todos/activos/borrador/expirados/cancelados), orden (próximos a expirar / recientes), búsqueda por cliente o folio.
- Tabla: folio, cliente, vigencia, monto, estado. Fila con warning si expira en <60d o SPEI overdue.
- Botón `+ Nuevo contrato`.

**Modal "Nuevo contrato":**

Campos: cliente (autocomplete portal_emails), folio manual, vigencia (start_date + end_date), monto MXN (IVA incluido — noted), empleados incluidos (informativo), pool mensual minutos, pool mensual ops, folio CFDI opcional, comprobante SPEI opcional (upload PDF), fecha SPEI, notas internas.

Acciones: `Guardar como borrador` o `Activar`.

**"Activar" ejecuta transacción atómica:**

1. `annual_contracts.status='active'`, `payment_received_at=NOW()` (si aplica).
2. `organizations.billing_model='annual_prepaid'`, `active_contract_id=<id>`, `monthly_minutes_used=0`, `monthly_ops_used=0`, `pool_reset_date=start_date + 1 month`.
3. `voice_agents` de esa org: `minutes_used=0`, `minutes_included=0` (señalización visual "sin cuota individual").
4. Si la org tenía Stripe sub activa, `stripe.subscriptions.update(cancel_at_period_end=true)` (deja el mes en curso, no genera refund).
5. Envía correo E1 al cliente (contrato activado).

**Vista de detalle del contrato:**

- Header con folio, cliente, estado, vigencia con countdown.
- Barra de consumo del ciclo actual (min + ops del pool).
- Lista de empleados activos con enlaces a detalle del agent.
- Documentos: contrato firmado (link a `/admin/contratos/[id]`), CFDI, comprobante SPEI.
- Timeline: activación, cambios, recordatorios enviados.
- Acciones: `Editar`, `Renovar por otro año` (pre-llena formulario, expira el anterior al activar el nuevo), `Cancelar` (requiere `cancelled_reason`).

### 4.3 Tab "Facturas emitidas"

Lista de todos los `invoice_folio` con enlaces a XML/PDF. Filtro por año fiscal. Uso: re-enviar CFDI cuando el cliente lo pida.

### 4.4 APIs nuevas

- `POST /api/admin/annual-contracts` — crea draft o activa.
- `PATCH /api/admin/annual-contracts/[id]` — editar campos, cancelar (con reason).
- `POST /api/admin/annual-contracts/[id]/activate` — activa un draft.
- `POST /api/admin/annual-contracts/[id]/renew` — crea nuevo contrato pre-llenado, expira el anterior al activar.
- `POST /api/admin/annual-contracts/[id]/upload-invoice` — upload CFDI PDF/XML a Supabase Storage.

---

## 5. Lifecycle y crons

### 5.1 Cron nuevo `annual-contracts-lifecycle` (diario, 4am UTC)

Idempotente (usa flags para no re-notificar). Maneja 4 eventos por fila:

1. **Reset mensual del pool** — si `pool_reset_date <= today` y `status='active'`:
   ```
   organizations.monthly_minutes_used = 0
   organizations.monthly_ops_used     = 0
   organizations.overage_minutes      = 0  (se resetea junto)
   organizations.overage_ops          = 0
   organizations.pool_reset_date      = pool_reset_date + 1 month
   ```
   Nota: el reset es el mismo día del mes que empezó el contrato (start=15 ago → resets día 15). NO al día 1 como Stripe.

2. **Recordatorio 60d antes de expirar** — si `end_date - 60d <= today` y `renewal_reminder_60d_sent=false`: envía E2 (versión 60d) al portal_email + approval_email con CC a hola@centinelia.mx. Marca flag.

3. **Recordatorio 15d antes de expirar** — igual, versión 15d urgente.

4. **Auto-expiración al día siguiente de `end_date`** — si `end_date < today` y `status='active'`:
   ```
   annual_contracts.status = 'expired'
   organizations.billing_model = 'expired'
   ```
   Envía E3 al cliente ("oficina pausada, puedes reactivar renovando") + E6 interno a Nazre.

**Orden respecto a `reset-minutes` existente:** `annual-contracts-lifecycle` corre a las 4am UTC, `reset-minutes` (Stripe) a las 12pm UTC (6am Monterrey). No colisionan porque cada uno filtra por su `billing_model`.

### 5.2 Modificación a crons existentes

Los siguientes crons agregan filtro para procesar SOLO clientes Stripe:

- **`/api/cron/payment-failed`** — filtro `organizations.billing_model = 'stripe'` (join).
- **`/api/cron/grace-period-check`** — mismo filtro.
- **`/api/cron/reset-minutes`** — filtro por voice_agents cuya org sea `stripe`.

Los `annual_prepaid` y `expired` quedan intocados por estos crons.

### 5.3 Cron nuevo `annual-contracts-payment-check` (semanal, lunes 3pm UTC)

Detecta contratos con `payment_status='pending'` y `start_date < today - 45d`. Los marca `payment_status='overdue'` y envía correo interno a Nazre. NO suspende operación (decisión intencional para no romper servicio a gobierno por burocracia interna).

### 5.4 Overage tracking

**Regla dura:** los empleados NUNCA paran de trabajar cuando se agota el pool. El overage:

- Se acumula en `organizations.overage_minutes` y `overage_ops` (se resetean junto con el pool cada mes).
- Genera alertas discretas internas (nunca al cliente):
  - 100% del pool → correo E4 inmediato a hola@centinelia.mx.
  - 120% del pool → correo E4 con tono urgente.
  - 80% del pool → digest semanal E5 (lunes 9am Monterrey).

Estas alertas son inputs para renegociar el pool en la próxima renovación, no incidentes operativos.

### 5.5 Timeline de vida de un contrato

```
Día 0 (start_date):    Contrato activado, pool cargado
Día 30, 60, 90...:     Pool reset (día del start_date del mes)
Día end - 60:          E2 (60d) a cliente + Nazre
Día end - 15:          E2 (15d) urgente a cliente + Nazre
Día end:               Último día operativo
Día end + 1:           status=expired, billing_model=expired,
                       empleados pausados, E3 + E6
Día end + N:           Renovación (nuevo CTR) → reactiva
                                 O
                       Cancelación manual → status=cancelled
```

---

## 6. Correos

6 templates nuevos, todos usan `shell()` dark. 3 cliente-facing, 3 internos.

Nuevo archivo `src/lib/email/annual-contracts.ts`.

### 6.1 Cliente-facing

**E1 `annualContractActivatedHtml`** — Contrato activado.
- Trigger: al activar desde admin.
- To: portal_email + approval_email.
- Badge: "Contrato activo" verde.
- Contenido: vigencia con countdown, pool mensual (min+ops), empleados incluidos, monto pagado, folio CFDI (si cargado).
- CTA: "Ver portal →".

**E2 `annualContractRenewalReminderHtml`** — Recordatorio 60d y 15d (mismo template, `urgency` param).
- Trigger: cron lifecycle.
- To: portal_email + approval_email + CC hola@centinelia.mx.
- Badge: 60d → "Renovación · 60 días" ámbar; 15d → "Renovación urgente · 15 días" rojo.
- Contenido: fecha expiración, resumen del ciclo actual (promedio consumido), advertencia de lo que pasaría al expirar.
- CTA: "Renovar contrato →" (mailto pre-fill con folio).

**E3 `annualContractExpiredHtml`** — Oficina pausada por contrato vencido.
- Trigger: cron lifecycle.
- To: portal_email + approval_email.
- Badge: "Oficina pausada" rojo (mismo que `agentPausedHtml`).
- Contenido: "Contrato CTR-XXXX venció el [fecha]. Tu oficina fue pausada y tus empleados no pueden recibir llamadas ni completar tareas. Puedes reactivar renovando — el equipo de Centinelia te contactará hoy con la propuesta."
- CTA: "Contactar Centinelia →" (mailto).

### 6.2 Internos (Nazre)

**E4 `annualContractOverageAlertHtml`** — Overage 100% o 120%.
- Trigger: post-call/post-op cuando cruza threshold.
- To: hola@centinelia.mx.
- Badge: 100% → ámbar "Pool al límite"; 120% → rojo "Overage 20% arriba".
- Contenido: cliente, contrato, consumo actual vs pool, días restantes del ciclo, promedio histórico, sugerencia para renovación.
- CTA: "Ver contrato →" (link admin).

**E5 `annualContractWeeklyOverageDigestHtml`** — Digest semanal 80%+.
- Trigger: nuevo cron `annual-contracts-weekly-overage-digest` (lunes 15 UTC = 9am Monterrey).
- To: hola@centinelia.mx.
- Contenido: lista de contratos con pool ≥80% en la semana, ordenados por %, días restantes al reset.
- CTA: "Ver todos los contratos →".

**E6 `annualContractExpiredInternalHtml`** — Vencido sin renovación.
- Trigger: cron lifecycle (mismo que envía E3).
- To: hola@centinelia.mx.
- Badge: "Contrato vencido sin renovación" rojo.
- Contenido: cliente, folio, fecha expiración, valor perdido, días desde última interacción de renovación.

### 6.3 Cambios en templates existentes

- `agentPausedHtml`, `paymentFailedHtml`, `minutesAlertHtml`: guard en caller para no enviar si `billing_model != 'stripe'`. Los prepaid tienen sus propios correos de pausa.
- `weeklyReportHtml`: leer pool compartido de `organizations` cuando `billing_model='annual_prepaid'`.
- Otros (`newLeadHtml`, `reauthRequiredHtml`, etc.) sin cambios.

### 6.4 Preview

Agregar los 6 templates al `scripts/preview-emails.mjs` con datos mock (Municipio Monterrey CTR-2026-0003).

---

## 7. Guard anti-mezcla (UI-first, backend defense-in-depth)

**Principio:** el cliente annual **nunca ve** botones de compra Stripe. Reemplazados por callout único.

### 7.1 Componente reusable

`src/app/portal/[token]/AnnualContractCallout.tsx` con prop `action` ∈ `{contratar_empleado, comprar_minutos, comprar_tareas, cambiar_plan}`. Muestra texto explicativo + botón mailto con subject pre-llenado.

### 7.2 Aplicación por pantalla

Server components leen `organization.billing_model` al load y renderizan el callout condicional:

| Pantalla | Reemplazo |
|---|---|
| `/portal/[token]/agentes` | Card "+ Contratar empleado" → `<AnnualContractCallout action="contratar_empleado" />` |
| `/portal/[token]/cuenta` (sección minutos) | Botones paquetes → `<AnnualContractCallout action="comprar_minutos" />` |
| `/portal/[token]/cuenta` (sección tareas) | Botones paquetes → `<AnnualContractCallout action="comprar_tareas" />` |
| `/portal/[token]/cuenta` (selector plan) | Dropdown → `<AnnualContractCallout action="cambiar_plan" />` |
| Landing checkout | Detecta email → si annual, muestra el callout inline en el form |

### 7.3 Backend defense-in-depth

Helper `src/lib/billing/require-stripe-eligible.ts` invocado en 5 endpoints. Devuelve 409 si `billing_model != 'stripe'`. Nunca se dispara desde la UI normal — solo si alguien hace curl manual o hay un bug futuro donde se olvide agregar el callout.

Endpoints protegidos:

- `POST /api/billing/create-checkout`
- `POST /api/portal/[token]/agentes`
- `POST /api/portal/[token]/change-plan`
- `POST /api/portal/[token]/buy-minutes`
- `POST /api/portal/[token]/buy-ops`

### 7.4 Ruta de escape

Nazre agrega empleados a organizaciones annual desde `/admin/agentes` (ya existente). Ese path no pasa por Stripe. UX del form admin muestra: "Este empleado se agrega al contrato CTR-XXXX. No genera cargo Stripe" cuando el portal_email destino es annual.

---

## 8. Edge cases

### 8.1 Cliente Stripe existente pasa a anual

Transición explícita desde admin. Al activar contrato:
1. Cancela sub Stripe con `cancel_at_period_end=true` (deja el mes en curso, sin refund).
2. Switchea `billing_model` a `annual_prepaid`.
3. Envía E1.

Admin muestra warning "Este cliente tiene sub Stripe activo (vence X)" al crear contrato, con checkbox "Cancelar sub Stripe al activar (recomendado)".

### 8.2 Rollback anual → Stripe

Botón "Regresar a Stripe" en detalle. Cancela contrato con reason, resetea `organizations` a `billing_model='stripe'`, re-hidrata `voice_agents.minutes_included` desde el `plan`. Refund manual por SPEI de regreso.

### 8.3 Empleados que entran mid-contrato

`included_employees` es informativo, no hard limit. El pool no crece automáticamente. Dos caminos:
- Empleado consume del pool existente (sin cambio contractual).
- Nazre negocia addendum al contrato existente (actualiza `monthly_minutes_pool`, `amount_mxn`).

### 8.4 Renovación anticipada

Nazre crea segundo contrato con `start_date = end_date del anterior`. Queda `status='draft'` hasta que llegue su `start_date`. Cron lifecycle detecta y auto-activa (expira el anterior).

### 8.5 Renovación con gap

Si renuevan 20 días después de vencer, Nazre pone `start_date = hoy`. El gap se registra en timeline (por diferencia entre `contract_A.end_date` y `contract_B.start_date`).

### 8.6 SPEI se retrasa

Contrato puede activarse sin `payment_received_at`. Cron `annual-contracts-payment-check` marca `overdue` después de 45d. Alerta interna a Nazre. NO suspende operación.

### 8.7 Rollback plan de producción

Si el sistema causa problemas post-deploy:
1. Deshabilitar `annual-contracts-lifecycle` en `vercel.json`.
2. `UPDATE organizations SET billing_model='stripe', active_contract_id=null WHERE billing_model IN ('annual_prepaid','expired');`
3. Git revert del PR.
4. Los `annual_contracts` rows quedan para forensics.

Cero impacto en Stripe clients porque el nuevo código respeta el guard `if billing_model = 'stripe'` en todo path modificado.

---

## 9. Testing

- **Preview HTML**: 6 correos nuevos + callout (4 variantes) en `scripts/preview-emails.mjs`. Validación visual pre-merge.
- **Smoke script** `scripts/smoke-annual-contract.ts`: crear org fake → crear contrato → activar → disparar consumo mock (post-call + post-op) → verificar descuento correcto → forzar overage → forzar expiración → renovar → verificar que Stripe endpoints devuelven 409 en todo momento.
- **Cero unit tests nuevos**: siguiendo patrón del codebase.

---

## 10. Archivos afectados

| Archivo | Tipo | Estimado |
|---|---|---|
| `supabase/annual-contracts.sql` | ya creado | ✓ |
| `src/lib/billing/require-stripe-eligible.ts` | nuevo | +30 |
| `src/lib/email/annual-contracts.ts` | nuevo | +350 |
| `src/lib/annual-contracts/lifecycle.ts` | nuevo | +150 |
| `src/lib/annual-contracts/pool-consume.ts` | nuevo | +80 |
| `src/app/admin/facturacion/**` | reemplaza `admin/billing`, 5 archivos nuevos | +600 |
| `src/app/api/admin/annual-contracts/**` | 4 rutas nuevas | +200 |
| `src/app/api/cron/annual-contracts-lifecycle/route.ts` | nuevo | +80 |
| `src/app/api/cron/annual-contracts-payment-check/route.ts` | nuevo | +50 |
| `src/app/api/cron/annual-contracts-weekly-overage-digest/route.ts` | nuevo | +60 |
| `src/app/api/cron/payment-failed/route.ts` | modificar (filtro billing_model) | +5 |
| `src/app/api/cron/grace-period-check/route.ts` | modificar | +5 |
| `src/app/api/cron/reset-minutes/route.ts` | modificar | +5 |
| `src/app/api/voice/webhook/route.ts` | modificar (descuento pool) | +40 |
| `src/lib/tools/executor.ts` | modificar (descuento ops pool) | +30 |
| `src/app/api/portal/[token]/agentes/route.ts` | guard | +5 |
| `src/app/api/portal/[token]/change-plan/route.ts` | guard | +5 |
| `src/app/api/portal/[token]/buy-minutes/route.ts` | guard | +5 |
| `src/app/api/portal/[token]/buy-ops/route.ts` | guard | +5 |
| `src/app/api/billing/create-checkout/route.ts` | guard | +5 |
| `src/app/portal/[token]/AnnualContractCallout.tsx` | nuevo | +80 |
| `src/app/portal/[token]/agentes/page.tsx` | UI condicional | +15 |
| `src/app/portal/[token]/cuenta/page.tsx` | UI condicional | +30 |
| `scripts/preview-emails.mjs` | extender con 6 templates | +200 |
| `scripts/smoke-annual-contract.ts` | nuevo | +180 |
| `vercel.json` | 3 crons nuevos | +12 |

Total: ~20 archivos nuevos, ~10 archivos modificados, ~+2,200 líneas netas.

---

## 11. Plan de ejecución (post-aprobación)

1. **Fundamentos**: helper `require-stripe-eligible`, tipos, meerkat-identity (ya existe).
2. **Backend admin CRUD**: 4 rutas API + service layer para annual_contracts.
3. **Admin UI**: rename billing → facturacion, tabs, lista, detalle, modal crear/renovar.
4. **Descuento pool**: modificar voice/webhook + executor con branch por billing_model.
5. **Crons lifecycle + payment-check + overage-digest**: 3 nuevos + 3 modificados.
6. **Correos**: 6 templates nuevos + preview + smoke.
7. **Portal UI**: callout component + reemplazos condicionales en 4 pantallas.
8. **Guards de endpoints**: 5 endpoints modificados.
9. **Smoke test end-to-end** contra dev DB.
10. **Deploy staged**: primero admin (Nazre crea Monterrey), luego portal callouts, luego crons habilitados.

---

## 12. Preguntas resueltas durante brainstorming

- **Ubicación admin**: `/admin/facturacion` con tabs (renombra `/admin/billing`).
- **Precio**: custom negociado por contrato (no plan fijo).
- **Granularidad**: contrato a nivel cliente (portal_email), pool compartido mensual.
- **60d/15d recordatorios**: a ambos (cliente + Nazre).
- **Overage internal**: 100%/120% alertas inmediatas, 80% en digest semanal.
- **Expiración**: pausa inmediata + correo "puedes reactivar renovando".
- **Guard anti-mezcla**: UI-first (esconder botones Stripe) + backend defense-in-depth.

No hay preguntas abiertas.
