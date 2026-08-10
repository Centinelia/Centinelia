# Safety Net — Fallback de llamadas cuando se agotan minutos

**Fecha:** 2026-08-09
**Estado:** Diseño aprobado, listo para plan de implementación.
**Handoff origen:** `memory/handoff_minutos_agotados_safety_net.md`

## Problema

Hoy, cuando una organización agota sus `minutes_included` del ciclo, `/api/voice/inbound/route.ts` (línea 211) responde con un assistant `PausedByLimit` que dice "servicio pausado" y cuelga. La llamada muere y el owner solo se entera cuando pierde ventas. Riesgo directo de churn en el momento peor: cuando el negocio está más activo.

## Objetivo

Cuando se agoten los minutos, rutear automáticamente la llamada entrante al celular personal del owner (`fallback_phone_number`), notificar por WhatsApp que se activó modo respaldo, y restaurar el ruteo a Nia automáticamente cuando el balance vuelva a positivo (recarga manual, auto-refill, o reset mensual). Sin fricción de onboarding, sin reconfigurar Vapi.

## Decisión clave de arquitectura

**No reconfiguramos el phone number de Vapi.** El handoff original proponía servicios `activate_fallback_routing` / `restore_agent_routing` que mutaban el binding número→assistant en Vapi. Innecesario: el gate ya vive dentro del webhook `/api/voice/inbound/route.ts:211`, que se ejecuta cada llamada. En vez de mutar Vapi, cambiamos la *respuesta* del webhook al hit de la gate: devolvemos un assistant de un solo turno que hace `transferCall` inmediato al `fallback_phone_number`.

**Ventajas frente al approach de reconfigurar Vapi:**

- Cero llamadas a la API de Vapi para transitions → sin split-brain si Vapi está lento o caído.
- Auto-restore implícito: la siguiente llamada después de la recarga ve `used < included` y devuelve el assistant normal. Sin cron de restore.
- Per-org, per-call, per-inbound. Todo el estado deriva de `account_minutes` — sin tabla adicional de estado de routing.
- Backwards compatible: sin `fallback_phone_number` configurado, se mantiene el comportamiento `PausedByLimit` actual.

**Tradeoff:** el fallback path agrega ~1-2s al setup de la llamada (paso extra de transferCall). Aceptable dado que solo ocurre cuando no hay minutos.

## Decisiones sobre las 4 preguntas abiertas del handoff

1. **`fallback_phone_number` soft-optional en onboarding**, auto-populado con `transfer_whatsapp || transfer_number` si existen. Banner en portal si vacío y `minutes_used >= 80%`. Hard requirement mata conversión de signup; auto-populate captura la mayoría de casos sin fricción.
2. **WA/email siguen funcionando durante fallback.** Invariante: "sin minutos = sin voz automatizada, todo lo demás sigue". No consumen `minutes_included`.
3. **Auto-topup no necesita coordinación explícita.** Si auto-refill funcionó, `minutes_used < included` y la gate no dispara. Si falló (sin tarjeta, cap 2× alcanzado, disabled), fallback toma el relevo. Orden de precedencia: auto-refill (cron/threshold) → fallback (webhook-time) → PausedByLimit (si no hay fallback).
4. **Sin diferencia semántica entre "sin minutos" y "sin minutos + sin auto-topup".** El gate solo mira balance final.

## Componentes

### DB migration

```sql
ALTER TABLE organizations
  ADD COLUMN fallback_phone_number text,
  ADD COLUMN fallback_notified_at  timestamptz;

CREATE TABLE routing_transitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      text NOT NULL,
  agent_id          uuid REFERENCES voice_agents(id),
  caller_number     text,
  transition        text NOT NULL,
  minutes_used      integer,
  minutes_included  integer,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX routing_transitions_org_time_idx
  ON routing_transitions (portal_email, created_at DESC);
```

Valores válidos de `transition`: `fallback_activated`, `fallback_restored`, `no_fallback_paused`.

### Cambio en `src/app/api/voice/inbound/route.ts`

Reemplazar el bloque `PausedByLimit` de la línea 211. Cargar `fallback_phone_number` en la query de `organizations` que ya se hace en la línea 52 (agregar la columna al SELECT).

Cuando `!isOwner && minutesIncluded > 0 && minutesUsedThisMonth >= minutesIncluded`:

- Si `fallback_phone_number` existe y es E.164 válido:
  - Encolar `after()` con: `notifyFallbackActivated` (WA con dedupe) + `logRoutingTransition('fallback_activated')`.
  - Devolver assistant `FallbackForward`: modelo mínimo, `firstMessage: "Un momento por favor, le comunicamos."`, un solo tool `transferir_a_dueno` de tipo `transferCall` con destination al fallback, `silenceTimeoutSeconds: 3`, `maxDurationSeconds: 30`. System prompt fuerza a llamar al tool en el primer turno sin escuchar respuesta del caller.
- Si no hay `fallback_phone_number` configurado (o es inválido):
  - Encolar `after()` con `logRoutingTransition('no_fallback_paused')`.
  - Devolver el `PausedByLimit` actual (sin cambio).

### Auto-restore en topup exitoso

En `apply_ledger_entry` (RPC de Supabase) o en el wrapper JS que se llama desde:

- `executeAutoRefill` (`src/lib/billing/auto-refill.ts`)
- Webhook Stripe cuando `kind IN ('purchase', 'auto_refill')`
- Cron `reset-minutes` cuando refresca el cache

Después del ledger entry que deja `balance > 0`, hacer:

```sql
UPDATE organizations
   SET fallback_notified_at = NULL
 WHERE portal_email = $1
   AND fallback_notified_at IS NOT NULL;
```

+ `logRoutingTransition('fallback_restored')` si `fallback_notified_at` no era null antes del update (indica que veníamos de modo fallback).

WA al owner: "Recargado. Las llamadas vuelven a {agent_name}." Solo se dispara si hubo un `fallback_restored` (es decir, veníamos de modo fallback — no se manda en recargas rutinarias).

### Notificación al owner — `src/lib/billing/fallback-notify.ts` (nuevo)

Función `notifyFallbackActivated(supabase, org, agent, callerNumber)`:

1. Dedupe: si `org.fallback_notified_at IS NOT NULL AND fallback_notified_at > org.minutes_reset_date`, no notificar.
2. Resolver destino WA: `guardia_schedule.principal || agent.transfer_whatsapp` (usa `loadOrgDirectory` de `src/lib/portal/directory.ts`, patrón ya establecido).
3. Enviar WA vía el helper canónico del proyecto (grep en `src/lib/whatsapp/` o `src/lib/notifications/` durante implementación) con mensaje:
   > "Se agotaron tus minutos de {agent.business_name} este ciclo. Las llamadas entrantes van a {mask(fallback_phone_number)} hasta que recargues. Recarga aquí: {portal_url}/facturacion"
4. `UPDATE organizations SET fallback_notified_at = now() WHERE portal_email = $1`.
5. Silencioso ante errores (nunca bloquea la respuesta al webhook).

### Portal UI

**`/portal/[token]/configurar`** — input nuevo `fallback_phone_number`:
- Formato E.164 con MX default (+52).
- Helper text: "Número personal donde recibir llamadas cuando se agoten tus minutos del ciclo."
- Placeholder auto-populado con `transfer_whatsapp` si existe.
- Validación soft en el PATCH endpoint (regex E.164).

**Sección de facturación / dashboard principal** — banner cuando `minutes_used >= minutes_included`:
- Color rojo, título "🔴 Modo Respaldo Activo".
- Cuerpo: "Las llamadas entrantes van a {mask(fallback_phone_number)}. Recarga minutos para reactivar {agent_name}."
- CTA prominente "Comprar minutos" → link a checkout / customer portal.
- Si no hay `fallback_phone_number` configurado: variante ámbar "🟡 Sin respaldo — las llamadas se pausan hasta recargar. [Configurar respaldo]".

**Warning temprano** cuando `minutes_used >= 80% AND fallback_phone_number IS NULL`:
- Banner amarillo en dashboard: "Configura un número de respaldo antes de agotar minutos."

### Onboarding

En el step del registro donde ya se captura `transfer_whatsapp`, agregar un checkbox default-on:
> ☑ Usar este mismo número como respaldo si se agotan mis minutos

Al submit del step, si checked → guardar `fallback_phone_number = transfer_whatsapp`. Sin pantalla nueva.

## Data flow — happy path

1. Cliente entra al mes con 100/100 min → gate no dispara → assistant normal.
2. Auto-refill (si enabled) intenta comprar antes de agotar. Si funciona, sigue normal.
3. Si auto-refill falló o disabled → llamada N+1 hit gate `>= 100` → webhook devuelve `FallbackForward` → Vapi transfiere a `fallback_phone_number` → WA aviso al owner (1× por ciclo, dedupe con `fallback_notified_at`).
4. Owner recarga desde portal → `apply_ledger_entry` resetea `fallback_notified_at` + logea `fallback_restored` → llamada N+2 ve `used < included` → assistant normal.
5. Reset mensual: cron `reset-minutes` refresca cache → `used = 0` → automáticamente back to normal.

## Edge cases

- **`fallback_phone_number == transfer_number`**: OK, es válido — el owner recibe la llamada directamente.
- **Owner llama al número Centinelia sin minutos**: `isOwner` bypass ya existe (`route.ts:162`) → siempre pasa. No entra al fallback path.
- **transferCall falla en Vapi**: llamada cae — mismo outcome que `PausedByLimit` actual. No peor que hoy.
- **`fallback_phone_number` inválido** (formato malo llegó a DB): guard defensivo con regex E.164 antes de devolver `FallbackForward`. Si falla la validación → `PausedByLimit`.
- **Racing entre auto-refill y llamada entrante**: si auto-refill llega mientras la llamada está en el webhook, cada webhook lee balance fresco de Supabase — no hay ventana de inconsistencia relevante. Peor caso: 1 llamada más va al fallback antes de que el refill se refleje. Aceptable.
- **`fallback_notified_at` desincronizado** (reset mensual sin resetearlo): el cron `reset-minutes` debe hacer `UPDATE ... SET fallback_notified_at = NULL WHERE minutes_reset_date < today`. Agregar en el mismo cron para no depender de la próxima recarga.

## Testing

**Unit:**
- Helper `shouldActivateFallback(minsUsed, minsIncluded, org, isOwner) → boolean`.
- Helper `isValidE164(phoneNumber) → boolean` para el guard.
- Helper de mask: `+528112345678 → +52 81 **** 5678`.

**Integration:**
- POST a `/api/voice/inbound` con mock de agente + org con `minutes_used=100, minutes_included=100, fallback_phone_number='+52...'` → assert respuesta contiene assistant name `FallbackForward` + destinations correctas.
- Mismo test sin `fallback_phone_number` → assert `PausedByLimit`.
- Test de dedupe: llamar `notifyFallbackActivated` 2× consecutivas → solo un WA enviado.
- Test de restore: setear `fallback_notified_at=now()`, ejecutar `apply_ledger_entry` de auto-refill → assert `fallback_notified_at IS NULL` + fila `fallback_restored` en `routing_transitions`.

**Manual E2E (piloto Nazre):**
1. En Supabase, `UPDATE account_minutes SET minutes_used = minutes_included WHERE portal_email = 'piloto@...'`.
2. Setear `organizations.fallback_phone_number` a un celular propio distinto del número Centinelia.
3. Llamar al número Centinelia desde otro celular → debe sonar en el `fallback_phone_number`.
4. Verificar WA de aviso llegó al owner.
5. Simular recarga: `SELECT apply_ledger_entry(...)` con `kind='purchase'`.
6. Llamar de nuevo al número Centinelia → debe atender el assistant normal (Nia).
7. Verificar `routing_transitions` tiene las dos rows (`fallback_activated`, `fallback_restored`).

## Archivos a tocar

**Nuevos:**
- `src/lib/billing/fallback-notify.ts` — WA notification con dedupe.
- `src/lib/billing/routing-log.ts` — helper `logRoutingTransition`.
- SQL migration para `organizations` columns + `routing_transitions` table.

**Modificados:**
- `src/app/api/voice/inbound/route.ts` — insertar bloque fallback antes de `PausedByLimit` (línea ~211), agregar `fallback_phone_number, fallback_notified_at` al SELECT de organizations (línea ~53).
- `src/types/organization.ts` (o donde vive el tipo) — agregar `fallback_phone_number`, `fallback_notified_at`.
- `src/lib/billing/auto-refill.ts` — reset de `fallback_notified_at` después de ledger exitoso.
- Webhook Stripe (`src/app/api/billing/webhook/route.ts` o similar) — reset después de recargas manuales.
- `src/app/api/cron/reset-minutes/route.ts` — reset de `fallback_notified_at` cuando avanza `minutes_reset_date`.
- `src/app/portal/[token]/configurar/*` — input `fallback_phone_number`.
- `src/app/portal/[token]/FacturacionSection.tsx` (o equivalente) — banners rojo/ámbar/amarillo.
- `src/app/registro/*` — checkbox en step del `transfer_whatsapp`.
- API PATCH del portal para `organizations` — validación E.164 del `fallback_phone_number`.

## No incluido en este alcance (posible futuro)

- UI admin para inspeccionar `routing_transitions` (basta con query directa a Supabase por ahora).
- SMS como fallback secundario del fallback (si el celular del owner no contesta).
- Fallback a un IVR con "presiona 1 para dejar mensaje" — hoy es solo transfer directo.
- Analytics / dashboard de cuántas orgs entraron en fallback este mes.
