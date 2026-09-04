# Onboarding de nuevo cliente para Nala (facturación)

Guía operativa para cargar un cliente nuevo al pipeline de Nala. Sin
completar estos pasos, Nala procesa correos entrantes pero no puede
matchear cliente/producto → toda notita cae a `escalado` y no se factura.

Auditoría 2026-09-04 confirmó que este proceso era conocimiento tribal.
Este doc lo formaliza.

## Prerequisitos

- Cliente firmó contrato de piloto Nala.
- Cliente instaló writer .NET (`BillingWriter-Setup-<ver>.exe`) en su
  máquina Windows con CONTPAQi.
- Cliente autorizó Dropbox App de Centinelia.

## Paso 1 — Registrar la organización

```sql
-- En Supabase, crear la org (o reusar si ya existe).
INSERT INTO organizations (portal_email, business_name, active)
VALUES ('<portal_email_cliente>', '<Nombre Fiscal>', true)
ON CONFLICT DO NOTHING;
```

## Paso 2 — Configurar `organization_integrations`

```sql
INSERT INTO organization_integrations (portal_email, type, config)
VALUES (
  '<portal_email_cliente>',
  'contpaqi',
  jsonb_build_object(
    'inbox_email', '<inbox_dedicado>@centinelia.mx',  -- dirección a la que el cliente reenvía notitas
    'dropbox_token', '',  -- se llena en el paso 2.5 vía sync script
    'dropbox_base_path', '/Facturacion',  -- ajustar si el cliente usa otra ruta
    'storage_backend', 'dropbox',
    'fiscal', jsonb_build_object(
      'rfc_emisor', '<RFC_cliente>',
      'regimen_fiscal', '<601|612|etc>',
      'serie_default', 'A',
      'uso_cfdi_default', 'G03',
      'clave_sat_default_producto', '50161509',
      'codigo_postal_emisor', '<CP_domicilio_fiscal>'
    ),
    'scheduled_task', jsonb_build_object(
      'expected_sync_interval_minutes', 60,
      'stale_warning_minutes', 120,
      'stale_escalation_hours', 6
    )
  )
);
```

## Paso 2.5 — Cliente autoriza Dropbox App vía portal

El cliente entra a `/portal/<token>?tab=organizacion#integraciones` y clickea
"Conectar Dropbox". El callback OAuth guarda access_token + refresh_token en
`integration_accounts`. Verificar:

```sql
SELECT portal_email, provider, status, expires_at
FROM integration_accounts
WHERE portal_email = '<portal_email_cliente>' AND provider = 'dropbox';
```

Después correr el sync script para puentear el token a
`organization_integrations`:

```powershell
tsx scripts/sync-dropbox-token-to-billing.ts <portal_email_cliente>
# → "[cliente] ok (refreshed)"
```

El cron `/api/cron/sync-dropbox-tokens` corre cada 3h y mantiene el token
sincronizado automáticamente (los tokens Dropbox expiran cada ~4h). No hay
que correr el script manual salvo debug.

**Alternativa legacy** (si no se puede usar el portal OAuth): cifrar un
token largo-vivo manualmente e insertarlo:

```powershell
tsx scripts/encrypt-dropbox-token.ts <token_plaintext>
# → pegar ciphertext en organization_integrations.config.dropbox_token
```

## Paso 3 — Registrar Nala como voice_agent

```sql
INSERT INTO voice_agents (portal_email, agent_name, role, active, features)
VALUES (
  '<portal_email_cliente>',
  'Nala',
  'facturacion',
  true,
  jsonb_build_object(
    'nala_pool_charge_enabled', false  -- flip cuando quieras que cobre
  )
);
```

## Paso 4 — Primera sync CONTPAQi (writer .NET)

En la máquina del cliente, iniciar el service:

```powershell
Start-Service Centinelia.BillingWriter
```

El writer ejecutará una primera sync a Dropbox `Config/contpaqi_clientes.csv`
+ `contpaqi_productos.csv` + `last_sync.json`. Verificar en Dropbox del
cliente que los 3 archivos aparecen.

**Encoding importante**: el writer .NET exporta en Windows-1252. El adapter
en Vercel auto-detecta y decodifica correctamente (fix 2026-09-04). Si el
CSV tiene BOM UTF-8, también funciona.

## Paso 5 — Verificar catálogo cargado

```sql
-- No hay tabla directa; la sync poblará el catálogo en Dropbox. Verificar:
--   dropbox_client.readFile('/Facturacion/Config/contpaqi_clientes.csv')
-- debería devolver > 0 clientes.
```

O disparar el adapter desde un script:

```bash
tsx scripts/verify-contpaqi-catalog.ts <portal_email_cliente>
# Salida esperada: "N clientes cargados, M productos cargados"
```

## Paso 6 — Seed inicial de `billing_client_rules` (opcional)

Si el cliente tiene reglas específicas (frecuencia, aliases pre-existentes,
uso CFDI custom), cargar:

```sql
INSERT INTO billing_client_rules (portal_email, integration_id, rfc, frequency, aliases, notes)
VALUES
  ('<portal_email>', '<integration_id>', '<RFC_1>', 'daily', ARRAY['nombre-comun-1'], NULL),
  ('<portal_email>', '<integration_id>', '<RFC_2>', 'weekly', ARRAY['abreviatura'], 'Prefiere factura semanal');
```

Sin este seed, todo cliente arranca en `frequency='immediate'` (default) y
los aliases se aprenden solos vía `learnClientAlias` conforme llegan
correos y humano confirma.

## Paso 7 — Correo de bienvenida al cliente

Enviar por gmail personal a `<portal_email_cliente>`:
- Instrucciones de qué correo usar para mandar notitas (típicamente
  `hola@centinelia.mx` o correo dedicado si aplica).
- Confirmar que WhatsApp de repartidores → forward a Nala está armado.

## Paso 8 — Smoke E2E

1. Desde `nazre20@gmail.com` (regla `feedback-no-tests-a-clientes`), enviar
   un correo con foto de notita adjunta a la dirección `config.inbox_email`
   configurada en el paso 2 (ej. `notitas-tortilleria@centinelia.mx`).
   El endpoint `/api/billing/inbox` matchea al cliente por destinatario, no
   por remitente, así que el smoke desde nazre20 es seguro.
2. Verificar en `billing_activity_log` que aparecen:
   - `invoice_submitted` (tool disparado por Nala).
   - `writer_cfdi_delivered` (cron writer inbox entregó CFDI).
3. Verificar que el correo con CFDI llegó threaded a `nazre20@gmail.com`.

## Paso 9 — Activar cobro al pool (kill switch)

```sql
UPDATE voice_agents
SET features = jsonb_set(features, '{nala_pool_charge_enabled}', 'true')
WHERE portal_email = '<portal_email_cliente>' AND role = 'facturacion';
```

Y en Vercel env vars:
- `NALA_WRITER_INBOX_ENABLED=true`
- `NALA_MAILBOX_ENABLED=true` (si el cliente usa hola@centinelia.mx)

## Rollback

Si algo sale mal:

```sql
UPDATE voice_agents SET active = false WHERE portal_email = '<portal_email_cliente>';
UPDATE organization_integrations SET config = jsonb_set(config, '{disabled}', 'true') WHERE portal_email = '<portal_email_cliente>';
```

Y detener el service en la máquina del cliente:

```powershell
Stop-Service Centinelia.BillingWriter
```
