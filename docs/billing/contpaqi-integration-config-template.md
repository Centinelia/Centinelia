# CONTPAQi - Template de configuracion `organization_integrations`

Documento de referencia para poblar la fila de integracion CONTPAQi de una org nueva en Supabase.
Audiencia: Nazre en sesion de Fase 0 con cliente piloto.

---

## 1. Overview

**Que es:** La tabla `organization_integrations` almacena la configuracion del adaptador de facturacion por organizacion. Para el proveedor `contpaqi`, la columna `config` (JSONB) contiene credenciales Dropbox, datos fiscales del emisor y parametros del agente Windows de sincronizacion.

**Quien lo consume:** `buildAdapter(config)` en `src/lib/billing/adapters/index.ts` lee este JSONB y construye una instancia de `CONTPAQiAdapter`. El adapter es llamado por el loop LLM (`employee/queue.ts -> handleProcessNotes`) cada vez que llega un correo con notitas de venta.

**Cuando se usa:** Una vez por org, antes del go-live de Fase 1. Se crea en Fase 0 con los datos fiscales del cliente y se completa con el Dropbox token cuando el Windows agent quede instalado.

**Restriccion de acceso:** La tabla tiene RLS con politica `service_role` only. Solo accedible via `createAdminClient()` (Supabase service_role). No hay politicas de lectura publica.

---

## 2. Shape completo del JSONB `config`

```jsonc
{
  // Discriminador: siempre "contpaqi" para este adaptador
  "type": "contpaqi",

  // --- Credenciales Dropbox (requerido para que el adapter arranque) ---
  "dropbox_token": "sl.EXAMPLE_TOKEN_REPLACE_ME",
  "dropbox_base_path": "/tortilleria-mty/contpaqi",

  // --- Datos fiscales del EMISOR (la empresa del cliente que factura) ---
  "fiscal": {
    "rfc_emisor":                "XAXX010101000",      // RFC real del cliente emisor
    "regimen_fiscal":            "601",                 // Clave SAT c_RegimenFiscal
    "serie_default":             "A",                   // Serie del comprobante en CONTPAQi
    "uso_cfdi_default":          "G03",                 // Clave SAT c_UsoCFDI por defecto
    "clave_sat_default_producto": "50161509",           // Clave producto SAT por defecto
    "codigo_postal_emisor":      "64000"                // CP domicilio fiscal -> LugarExpedicion en XML
  },

  // --- Parametros del ciclo de sincronizacion del Windows agent ---
  "scheduled_task": {
    "expected_sync_interval_minutes": 15,  // Intervalo configurado en appsettings.json del agent
    "stale_warning_minutes":          30,  // Minutos sin sync antes de advertencia (no corta)
    "stale_escalation_hours":          6   // Horas sin sync antes de marcar adaptador como no saludable
  }
}
```

> NOTA: El JSONB es validado en tiempo de ejecucion por `buildAdapter`. Si falta cualquiera de
> `dropbox_token`, `dropbox_base_path`, `fiscal`, `scheduled_task`, o `fiscal.codigo_postal_emisor`,
> la funcion lanza un Error explicativo y el job queda en estado `failed` en `billing_jobs`.

---

## 3. Campos requeridos

| Campo | Tipo | Descripcion | Ejemplo | Cuando se obtiene |
|---|---|---|---|---|
| `type` | `string` (`"contpaqi"`) | Discriminador del adapter. Siempre literal `"contpaqi"`. | `"contpaqi"` | Fase 0 - antes de la sesion |
| `dropbox_token` | `string` | Token de acceso Dropbox de la cuenta del cliente. Tipo "long-lived app token" con permiso `files.content.write`. | `"sl.EXAMPLE_TOKEN_REPLACE_ME"` | Fase 0 - sesion con cliente (generado en dropbox.com/developers/apps) |
| `dropbox_base_path` | `string` | Ruta raiz en Dropbox. Debe coincidir exactamente con `DropboxBasePath` del `appsettings.json` del Windows agent. | `"/tortilleria-mty/contpaqi"` | Fase 0 - acordar con cliente durante instalacion |
| `fiscal.rfc_emisor` | `string` | RFC del emisor (empresa del cliente). 12 caracteres (persona moral) o 13 (fisica). Mayusculas. | `"XAXX010101000"` | Fase 0 - Constancia de Situacion Fiscal del cliente |
| `fiscal.regimen_fiscal` | `string` | Clave SAT del regimen fiscal del emisor (catalogo `c_RegimenFiscal`). | `"601"` (General de Ley PM) | Fase 0 - Constancia de Situacion Fiscal del cliente |
| `fiscal.serie_default` | `string` | Letra(s) de la serie del comprobante en CONTPAQi. Debe existir en el catalogo interno de CONTPAQi del cliente. | `"A"` | Fase 0 - preguntar a la contadora del cliente |
| `fiscal.uso_cfdi_default` | `string` | Clave SAT de uso CFDI por defecto (catalogo `c_UsoCFDI`). Se aplica cuando el catalogo CONTPAQi no tiene uno especificado para el receptor. | `"G03"` (Gastos en general) | Fase 0 - preguntar a la contadora |
| `fiscal.clave_sat_default_producto` | `string` | Clave de producto/servicio SAT (catalogo `c_ClaveProdServ`) que se usa cuando no se puede identificar la clave exacta del articulo en CONTPAQi. | `"50161509"` (tortillas/masa) | Fase 0 - preguntar a la contadora; ajustar segun giro del negocio |
| `fiscal.codigo_postal_emisor` | `string` | Codigo postal del domicilio fiscal del emisor. Se usa como `<LugarExpedicion>` en el XML de importacion. CONTPAQi rechaza el XML si este campo llega vacio. | `"64000"` | Fase 0 - Constancia de Situacion Fiscal del cliente |
| `scheduled_task.expected_sync_interval_minutes` | `number` | Intervalo en minutos entre ciclos de sincronizacion del Windows agent. Debe coincidir con `SyncIntervalMinutes` en `appsettings.json`. Solo informativo para Centinelia. | `15` | Fase 0 - durante instalacion del Windows agent |
| `scheduled_task.stale_warning_minutes` | `number` | Minutos de inactividad del agent antes de que `freshness()` emita una advertencia. No interrumpe el procesamiento. | `30` | Fase 0 - valor recomendado: 2x el intervalo de sync |
| `scheduled_task.stale_escalation_hours` | `number` | Horas de inactividad del agent que marcan el adaptador como no saludable. El loop LLM escala al responsable y detiene el procesamiento. | `6` | Fase 0 - valor recomendado para piloto |

---

## 4. Campos opcionales

No hay campos opcionales declarados en `OrganizationIntegrationConfig` para `type='contpaqi'`. Todos los campos de las secciones `fiscal` y `scheduled_task` son requeridos por `buildAdapter`.

El unico campo tecnicamente opcional a nivel de TypeScript es `cacheTtlMs` (TTL del cache de clientes/productos en memoria, default 10 min), pero este NO vive en el JSONB de la BD: se pasa directamente al constructor de `CONTPAQiAdapter` si se quisiera personalizar, lo cual requiere un cambio de codigo, no de config.

> TODO: verificar con Nazre en Fase 0: si en el futuro se necesita un TTL de cache diferente
> por org (ej: cliente con catalogo muy grande que cambia frecuentemente), se puede agregar
> `cache_ttl_ms` como campo opcional en el JSONB y mapearlo en `buildAdapter`. Por ahora no existe.

---

## 5. Campos sensibles

Los siguientes campos deben almacenarse **cifrados** en la columna `config` de `organization_integrations`:

| Campo | Por que es sensible | Estado de cifrado |
|---|---|---|
| `dropbox_token` | Token de larga duracion que da acceso de lectura/escritura a la cuenta Dropbox del cliente. Si se filtra, un atacante puede leer catalogo de clientes y productos, y escribir XMLs maliciosos en la carpeta de importacion. | **Cifrado at-rest con AES-256-GCM** desde `fix/billing-encrypt-dropbox-token` (2026-08-21). Ver flujo abajo. |

### Flujo de cifrado

El helper `encryptDropboxToken` en `src/lib/billing/adapters/index.ts` cifra el token con `encrypt()` de `src/lib/crypto.ts` (AES-256-GCM con `ENCRYPTION_KEY` del entorno). El helper `decryptDropboxToken` corre automaticamente en `buildAdapter` y en los 3 cron routes (`billing-retention`, `billing-periodic-cuts`, `billing-daily-report`) cuando leen el token del JSONB.

**Fallback graceful:** `decrypt()` retorna el input tal cual si no puede descifrarlo (ya sea porque no esta en formato encriptado, o porque `ENCRYPTION_KEY` no esta configurada). Esto permite convivir con tokens legacy sin migracion forzosa, pero significa que **el enforcement del cifrado depende de que quien inserta la row use el helper**.

### Generar el ciphertext antes del INSERT

Desde la raiz del repo, con `ENCRYPTION_KEY` en `.env.local`:

```bash
npx tsx scripts/encrypt-dropbox-token.ts "sl.TU_TOKEN_DROPBOX_EN_PLAINTEXT"
```

El script imprime SOLO el ciphertext base64 a stdout. Ejemplo:

```
$ npx tsx scripts/encrypt-dropbox-token.ts "sl.AbCdEf123456"
ok: cifrado 15 chars → 60 chars base64
qxTx3F9aB2c...==
```

Copiar el ciphertext y pegarlo en el SQL de INSERT/UPDATE de las secciones 6 y 7.

**Nunca guardar el token en plaintext en el JSONB de produccion.** Si por error se hace, ejecutar el UPDATE de la seccion 7.1 con el ciphertext correcto.

---

## 6. SQL de ejemplo: INSERT inicial (Fase 0)

Usar en Supabase SQL Editor con los datos reales del cliente. Reemplazar todos los valores `REPLACE_ME`.

```sql
-- Paso 1: verificar que la org existe (la row de organizations debe existir antes del INSERT)
SELECT portal_email, name
FROM organizations
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL';
-- Ejemplo: 'tortilleria@cliente.com'

-- Paso 2: generar ciphertext del token ANTES de este INSERT:
--   npx tsx scripts/encrypt-dropbox-token.ts "sl.TU_TOKEN_PLAINTEXT"
-- Copiar el ciphertext que imprime y pegarlo en el lugar de REPLACE_ME_DROPBOX_TOKEN_CIPHERTEXT

-- Paso 3: INSERT de la integracion
INSERT INTO organization_integrations (portal_email, type, config)
VALUES (
  'REPLACE_ME_PORTAL_EMAIL',
  'contpaqi',
  '{
    "type": "contpaqi",
    "dropbox_token": "REPLACE_ME_DROPBOX_TOKEN_CIPHERTEXT",
    "dropbox_base_path": "/REPLACE_ME_CARPETA/contpaqi",
    "fiscal": {
      "rfc_emisor":                  "REPLACE_ME_RFC_EMISOR",
      "regimen_fiscal":              "601",
      "serie_default":               "A",
      "uso_cfdi_default":            "G03",
      "clave_sat_default_producto":  "50161509",
      "codigo_postal_emisor":        "64000"
    },
    "scheduled_task": {
      "expected_sync_interval_minutes": 15,
      "stale_warning_minutes":          30,
      "stale_escalation_hours":          6
    }
  }'::jsonb
)
ON CONFLICT (portal_email, type) DO NOTHING
RETURNING id, portal_email, type, created_at;
```

**Valores a sustituir en la sesion con el cliente:**

| Placeholder | Valor que necesitas |
|---|---|
| `REPLACE_ME_PORTAL_EMAIL` | Email del portal Centinelia de la org (PK de `organizations`) |
| `REPLACE_ME_DROPBOX_TOKEN` | Token Dropbox generado en dropbox.com/developers/apps |
| `REPLACE_ME_CARPETA` | Nombre de carpeta raiz en Dropbox (ej: `tortilleria-mty`) |
| `REPLACE_ME_RFC_EMISOR` | RFC del emisor (de la Constancia de Situacion Fiscal) |
| `"601"` | Verificar regimen fiscal real con la contadora |
| `"A"` | Verificar serie real en CONTPAQi del cliente con la contadora |
| `"G03"` | Verificar uso CFDI default con la contadora |
| `"50161509"` | Verificar clave SAT del producto principal del negocio |
| `"64000"` | Verificar CP del domicilio fiscal (de la Constancia) |

---

## 7. SQL de update: modificar campos individuales

Para actualizar un campo especifico del JSONB sin reescribir todo el objeto, usar `jsonb_set`.

### Actualizar solo el dropbox_token

Generar el ciphertext primero:

```bash
npx tsx scripts/encrypt-dropbox-token.ts "sl.NUEVO_TOKEN_PLAINTEXT"
```

Luego pegar el ciphertext en el SQL:

```sql
UPDATE organization_integrations
SET config = jsonb_set(
  config,
  '{dropbox_token}',
  '"REPLACE_ME_CIPHERTEXT_DEL_SCRIPT"'
)
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL'
  AND type = 'contpaqi'
RETURNING id, updated_at;
```

### Actualizar el dropbox_base_path

```sql
UPDATE organization_integrations
SET config = jsonb_set(
  config,
  '{dropbox_base_path}',
  '"/nueva-ruta/contpaqi"'
)
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL'
  AND type = 'contpaqi'
RETURNING id, updated_at;
```

### Actualizar un campo fiscal anidado (ej: serie_default)

```sql
UPDATE organization_integrations
SET config = jsonb_set(
  config,
  '{fiscal,serie_default}',
  '"B"'
)
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL'
  AND type = 'contpaqi'
RETURNING id, updated_at;
```

### Actualizar stale_escalation_hours

```sql
UPDATE organization_integrations
SET config = jsonb_set(
  config,
  '{scheduled_task,stale_escalation_hours}',
  '12'
)
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL'
  AND type = 'contpaqi'
RETURNING id, updated_at;
```

---

## 8. Validacion: verificar que el config quedo bien

### 8.1 Sanity check SQL (verificar shape del JSONB)

```sql
-- Ver el config completo de la org
SELECT
  id,
  portal_email,
  type,
  config->>'type'               AS adapter_type,
  config->>'dropbox_base_path'  AS dropbox_base_path,
  -- No mostrar el token completo en un SELECT visible; solo los primeros 8 chars
  left(config->>'dropbox_token', 8) || '...' AS dropbox_token_preview,
  config->'fiscal'->>'rfc_emisor'               AS rfc_emisor,
  config->'fiscal'->>'regimen_fiscal'           AS regimen_fiscal,
  config->'fiscal'->>'serie_default'            AS serie_default,
  config->'fiscal'->>'uso_cfdi_default'         AS uso_cfdi_default,
  config->'fiscal'->>'clave_sat_default_producto' AS clave_sat_default,
  config->'fiscal'->>'codigo_postal_emisor'     AS cp_emisor,
  (config->'scheduled_task'->>'expected_sync_interval_minutes')::int AS sync_interval_min,
  (config->'scheduled_task'->>'stale_warning_minutes')::int          AS stale_warning_min,
  (config->'scheduled_task'->>'stale_escalation_hours')::int         AS stale_escalation_h,
  created_at,
  updated_at
FROM organization_integrations
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL'
  AND type = 'contpaqi';
```

**Lo que debes verificar en el resultado:**

- `adapter_type` = `contpaqi`
- `dropbox_base_path` empieza con `/` y coincide exactamente con `DropboxBasePath` en `appsettings.json` del Windows agent
- `dropbox_token_preview` = `sl.XXXXX` (empieza con `sl.`)
- `rfc_emisor` tiene el formato correcto (12 o 13 chars, mayusculas)
- `regimen_fiscal` es un numero valido del catalogo SAT (ej: `601`, `612`, `626`)
- `cp_emisor` tiene 5 digitos
- `sync_interval_min`, `stale_warning_min`, `stale_escalation_h` son numeros positivos

### 8.2 Verificar que no rompe buildAdapter

No existe un script `npm run adapter:test contpaqi <orgId>` en el codebase. La forma de verificar es via la API de worker:

**Opcion A: Forzar un job de prueba (requiere un correo de prueba en `billing_incoming_emails`)**

```sql
-- 1. Obtener el integration_id
SELECT id FROM organization_integrations
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL' AND type = 'contpaqi';

-- 2. Insertar un job de prueba (usando el id del paso anterior)
INSERT INTO billing_jobs (portal_email, integration_id, kind, payload, status)
VALUES (
  'REPLACE_ME_PORTAL_EMAIL',
  'REPLACE_ME_INTEGRATION_UUID',
  'process_notes',
  '{"email_id": "REPLACE_ME_EMAIL_ID"}'::jsonb,
  'pending'
)
RETURNING id;

-- 3. Verificar el resultado despues de 1-2 minutos (el cron /api/billing/worker corre cada 1 min)
SELECT id, status, attempts, last_error, finished_at
FROM billing_jobs
WHERE id = 'REPLACE_ME_JOB_UUID';
```

Si `status = 'done'`, el config es valido y `buildAdapter` pudo construir el adapter.
Si `status = 'failed'` y `last_error` contiene `"CONTPAQi adapter requires"`, alguno de los campos requeridos esta faltando o vacio.

**Opcion B: Verificar estructuralmente sin crear jobs (recomendada para Fase 0)**

```sql
-- Verificar que todos los campos requeridos por buildAdapter estan presentes y no son null
SELECT
  CASE
    WHEN config->>'dropbox_token' IS NULL OR config->>'dropbox_token' = '' THEN 'FALTA dropbox_token'
    WHEN config->>'dropbox_base_path' IS NULL OR config->>'dropbox_base_path' = '' THEN 'FALTA dropbox_base_path'
    WHEN config->'fiscal' IS NULL THEN 'FALTA objeto fiscal'
    WHEN config->'fiscal'->>'codigo_postal_emisor' IS NULL OR config->'fiscal'->>'codigo_postal_emisor' = '' THEN 'FALTA fiscal.codigo_postal_emisor'
    WHEN config->'fiscal'->>'rfc_emisor' IS NULL OR config->'fiscal'->>'rfc_emisor' = '' THEN 'FALTA fiscal.rfc_emisor'
    WHEN config->'scheduled_task' IS NULL THEN 'FALTA objeto scheduled_task'
    ELSE 'OK - todos los campos requeridos presentes'
  END AS validacion
FROM organization_integrations
WHERE portal_email = 'REPLACE_ME_PORTAL_EMAIL'
  AND type = 'contpaqi';
```

---

## Checklist de Fase 0 (sesion con cliente)

Orden recomendado para la sesion:

1. Obtener la Constancia de Situacion Fiscal del cliente: RFC, regimen fiscal, CP.
2. Confirmar con la contadora: serie del comprobante en CONTPAQi, uso CFDI default, clave SAT del producto principal.
3. Crear la app en dropbox.com/developers/apps con permiso `files.content.write` y generar el token.
4. Acordar el nombre de la carpeta raiz en Dropbox (`dropbox_base_path`).
5. Ejecutar el INSERT de la seccion 6.
6. Ejecutar el sanity check de la seccion 8.1.
7. Instalar el Windows agent en la maquina del cliente (ver `docs/billing/contpaqi-agent-setup.md`).
8. Verificar que `appsettings.json` del agent tiene el mismo `DropboxBasePath` que el JSONB.
9. Confirmar primer sync exitoso revisando `last_sync.json` en Dropbox.

### Pendientes Fase 0 (deuda tecnica, ver contpaqi-adapter.md seccion 7)

- Confirmar motor de BD del cliente: Firebird o SQL Server.
- Round-trip XML con la contadora (importar 1-2 facturas de prueba en CONTPAQi real).
- Verificar nombres reales de tablas (`admClientes`, `admProductos`) en la BD del cliente.
- Definir estrategia de cifrado del `dropbox_token` antes de go-live productivo.
