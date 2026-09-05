# Dry run E2E — validación pre-Beatriz

Recorrido completo del pipeline Nala **desde nuestro lado**, usando
sandbox propio de Centinelia. Cubre lo que nunca se ha probado en prod
(Fase 2 IMAP + Dropbox sync + adapter CONTPAQi real). Termina justo
antes del writer .NET; esa pieza solo se puede probar con Beatriz
(requiere CONTPAQi + SQL Server + CSD reales en máquina Windows).

**Portal sandbox:** `centinelia.dev@gmail.com`.
**Dropbox test:** cuenta personal Nazre.
**Correo Nala test:** dedicado (Nazre ya lo tiene).

Duración estimada: 60-90 min.

---

## FASE 1. Dropbox OAuth + sync token (15 min)

### 1.1 Obtener token del portal sandbox

```sql
SELECT portal_token FROM organizations WHERE portal_email = 'centinelia.dev@gmail.com';
```

### 1.2 Nazre autoriza Dropbox

Abrir `https://www.centinelia.mx/portal/<token>?tab=organizacion#integraciones`
→ "Conectar Dropbox" → login con Dropbox personal → Aceptar.

### 1.3 Verificar integration_accounts

```sql
SELECT portal_email, provider, status, expires_at, account_label
FROM integration_accounts
WHERE portal_email = 'centinelia.dev@gmail.com' AND provider = 'dropbox';
```

Debe salir 1 fila `status='active'`, `expires_at` en ~4h.

### 1.4 Crear organization_integrations type='contpaqi'

```sql
INSERT INTO organization_integrations (portal_email, type, config)
VALUES (
  'centinelia.dev@gmail.com',
  'contpaqi',
  jsonb_build_object(
    'dropbox_token', '',
    'dropbox_base_path', '/Facturacion',
    'storage_backend', 'dropbox',
    'fiscal', jsonb_build_object(
      'rfc_emisor', 'XAXX010101000',
      'regimen_fiscal', '612',
      'serie_default', 'T',
      'uso_cfdi_default', 'G03',
      'clave_sat_default_producto', '50161509',
      'codigo_postal_emisor', '64000'
    ),
    'scheduled_task', jsonb_build_object(
      'expected_sync_interval_minutes', 60,
      'stale_warning_minutes', 120,
      'stale_escalation_hours', 6
    )
  )
);
```

### 1.5 Correr sync script

```powershell
cd C:\Users\Nazre\centinelia
npx tsx scripts/sync-dropbox-token-to-billing.ts centinelia.dev@gmail.com
```

Debe imprimir `[centinelia.dev@gmail.com] ok (refreshed)` + expira.

### 1.6 Confirmar token quedó en organization_integrations

```sql
SELECT (config->>'dropbox_token') IS NOT NULL AND length(config->>'dropbox_token') > 0 AS ok
FROM organization_integrations WHERE portal_email = 'centinelia.dev@gmail.com' AND type = 'contpaqi';
```

Debe salir `ok: true`.

**Bugs que este paso descubre:**
- Portal OAuth callback rompe.
- sync-dropbox-token-to-billing.ts falla contra data real.
- Encryption / decryption path.
- Cadena `integration_accounts` → `organization_integrations`.

---

## FASE 2. Simular writer .NET — subir CSVs fake a Dropbox (10 min)

Como no hay CONTPAQi real, hacemos a mano lo que haría el writer.

### 2.1 En Dropbox web, crear estructura

- `/Facturacion/`
- `/Facturacion/Config/`
- `/Facturacion/Importables_CONTPAQi/`
- `/Facturacion/Importables_CONTPAQi/pendientes/`
- `/Facturacion/Importables_CONTPAQi/timbrados/`
- `/Facturacion/Importables_CONTPAQi/errores/`

### 2.2 Subir contpaqi_clientes.csv

Guardar localmente `clientes.csv` con contenido (encoding UTF-8, BOM
opcional):

```
CODIGO,RFC,RAZON_SOCIAL,USO_CFDI,REGIMEN,CP
CL001,XAXX010101000,PUBLICO EN GENERAL,S01,616,64000
CL002,VECJ880326XR8,JOSE VECINO CASTILLO,G03,605,64000
CL003,GAL010101AA1,ABARROTES EL GALGO SA DE CV,G03,601,64000
```

Subir a `/Facturacion/Config/contpaqi_clientes.csv`.

### 2.3 Subir contpaqi_productos.csv

```
CODIGO,DESCRIPCION,UNIDAD,PRECIO,CLAVE_SAT
P001,PAQ TORTILLA MAIZ 1 KG,KG,27.00,50161509
P002,PAQ TORTILLA HARINA TACO 1 KG,KG,27.00,50161509
P003,SALSA 500 GMS,PZA,15.00,50161509
```

Subir a `/Facturacion/Config/contpaqi_productos.csv`.

### 2.4 Subir last_sync.json

```json
{ "last_sync_at": "2026-09-04T20:00:00Z", "clientes_count": 3, "productos_count": 3 }
```

Subir a `/Facturacion/Config/last_sync.json`.

### 2.5 Verify catalog

```powershell
npx tsx scripts/verify-contpaqi-catalog.ts centinelia.dev@gmail.com
```

Salida esperada:
```
ok: 3 clientes cargados, 3 productos cargados
primeros 3 clientes:
  - XAXX010101000  PUBLICO EN GENERAL
  - VECJ880326XR8  JOSE VECINO CASTILLO
  - GAL010101AA1   ABARROTES EL GALGO SA DE CV
primeros 3 productos:
  - [P001] PAQ TORTILLA MAIZ 1 KG  $27
  ...
```

**Bugs que este paso descubre:**
- CONTPAQi adapter lee CSVs de Dropbox real.
- Encoding auto-detect Windows-1252/UTF-8.
- Parseo CSV con columnas variables.
- DropboxClient token refresh in situ.

---

## FASE 3. Crear voice_agent Nala test + configurar SMTP+IMAP (15 min)

### 3.1 Crear el agente

```sql
INSERT INTO voice_agents (
  portal_email, agent_name, role, active,
  business_name, client_email, portal_token, features
)
VALUES (
  'centinelia.dev@gmail.com',
  'NalaTest',
  'facturacion',
  true,
  'Sandbox Centinelia',
  'nazre20@gmail.com',
  (SELECT portal_token FROM organizations WHERE portal_email = 'centinelia.dev@gmail.com'),
  jsonb_build_object('nala_pool_charge_enabled', false)
);
```

Anotar el `id` que se genera (o buscarlo con `SELECT id FROM voice_agents WHERE agent_name = 'NalaTest'`).

### 3.2 Configurar SMTP+IMAP desde el portal

En `/portal/<token>/configurar` → seleccionar NalaTest → panel
"Servidor SMTP del negocio":

- **Host SMTP / puerto / usuario / password:** creds del correo dedicado.
- **Marcar checkbox** "Empleado también lee este buzón (IMAP inbound)".
- **Host IMAP / puerto:** típicamente `imap.<dominio>` : 993.
- Si el proveedor tiene cert mismatch: marcar "Ignorar validación TLS".
- Click **"Probar y guardar"**.

Debe pasar la validación SMTP + IMAP y llegar un correo de prueba al
mismo buzón.

### 3.3 Verificar en BD

```sql
SELECT agent_name,
       features->'smtp_config'->>'host' as smtp_host,
       features->'smtp_config'->>'imap_host' as imap_host
FROM voice_agents WHERE portal_email = 'centinelia.dev@gmail.com';
```

Debe salir NalaTest con ambos populated.

**Bugs que este paso descubre:**
- Portal endpoint POST valida IMAP real.
- verifyImapCreds contra servidor real.
- Config JSONB shape correcto.

---

## FASE 4. Smoke E2E — mandar notita real (20 min)

### 4.1 Enviar el correo

Desde `nazre20@gmail.com` (regla `feedback-no-test-a-clientes`):

- **Para:** el correo dedicado del NalaTest.
- **Asunto:** `Dry run Nala - notita 1`.
- **Cuerpo:** `Adjunto foto de prueba para dry run.`
- **Adjunto:** una foto de las fixtures. Usar por ejemplo:
  `fixtures/piloto-tortilleria/notitas-reales/nota-1.jpeg` (ajusta al
  nombre real que tengas).

### 4.2 Forzar el cron (no esperar 10 min)

```powershell
$cronSecret = "<CRON_SECRET valor de .env.local>"
curl -H "Authorization: Bearer $cronSecret" https://www.centinelia.mx/api/cron/agent-mailboxes | ConvertFrom-Json
```

Debe devolver JSON con `agents_processed >= 1`, `total_fetched >= 1`,
`total_enqueued >= 1`.

### 4.3 Verificar la cadena en BD

```sql
-- Correo entró
SELECT id, from_address, to_address, subject, attachment_count, created_at
FROM billing_incoming_emails
WHERE portal_email = 'centinelia.dev@gmail.com'
ORDER BY created_at DESC LIMIT 1;

-- Job encolado
SELECT id, kind, status, attempts, created_at
FROM billing_jobs
WHERE portal_email = 'centinelia.dev@gmail.com'
ORDER BY created_at DESC LIMIT 1;
```

### 4.4 Ver que Nala procesó (esperar ~30-60s post-cron)

```sql
SELECT action_type, count(*), max(created_at)
FROM billing_activity_log
WHERE portal_email = 'centinelia.dev@gmail.com'
  AND created_at > now() - interval '10 min'
GROUP BY action_type
ORDER BY max(created_at) DESC;
```

Debe verse eventualmente:
- `nala_vision_extract` (Nala procesó la foto).
- `invoice_submitted` (Nala llamó a `submit_invoice_batch`).

### 4.5 Verificar XML en Dropbox

En Dropbox web: `/Facturacion/Importables_CONTPAQi/pendientes/` debe
contener 1 archivo XML con nombre tipo `<basename>-<fecha>.xml`.

**Aquí termina el dry run.** El XML se queda en `pendientes/` porque no
hay writer .NET consumiéndolo. Esa parte solo se prueba con Beatriz.

### 4.6 Test bonus — dedup

Reenviar el MISMO correo (Gmail: reenviar, no un correo nuevo).
Forzar el cron otra vez:

```powershell
curl -H "Authorization: Bearer $cronSecret" https://www.centinelia.mx/api/cron/agent-mailboxes | ConvertFrom-Json
```

Verificar que NO se creó segunda fila:

```sql
SELECT count(*) FROM billing_incoming_emails
WHERE portal_email = 'centinelia.dev@gmail.com';
```

Debe seguir siendo 1 (el índice único parcial dedupe por `message_id`).

**Bugs que este paso descubre:**
- Cron agent-mailboxes end-to-end.
- IMAP fetchUnread + markSeen contra proveedor real.
- Lock agent_mailboxes_lock ejercido.
- Nala vision LLM con foto real (Anthropic API).
- Matching contra catálogo real cargado desde Dropbox.
- Executor de tools per-agent (`submit_invoice_batch`).
- XML upload a Dropbox del cliente.
- Dedup por message_id (Bug 1 del fix).

---

## FASE 5. Cleanup (5 min)

Después del test, limpiar para no dejar basura:

```sql
DELETE FROM billing_jobs WHERE portal_email = 'centinelia.dev@gmail.com';
DELETE FROM billing_incoming_emails WHERE portal_email = 'centinelia.dev@gmail.com';
DELETE FROM ai_ops_log WHERE agent_id = (SELECT id FROM voice_agents WHERE agent_name = 'NalaTest');
DELETE FROM billing_activity_log WHERE portal_email = 'centinelia.dev@gmail.com';
DELETE FROM voice_agents WHERE agent_name = 'NalaTest';
DELETE FROM organization_integrations WHERE portal_email = 'centinelia.dev@gmail.com' AND type = 'contpaqi';
DELETE FROM integration_accounts WHERE portal_email = 'centinelia.dev@gmail.com' AND provider = 'dropbox';
```

En Dropbox: borrar `/Facturacion/Importables_CONTPAQi/pendientes/*.xml`
del test. Los CSVs de catálogo se pueden dejar para siguientes tests.

---

## Qué SÍ prueba este dry run (checklist)

- [x] Portal Dropbox OAuth flow (Fase 1).
- [x] sync-dropbox-token-to-billing.ts con data real (Fase 1).
- [x] Refresh token flow (si expira durante el test).
- [x] CONTPAQi adapter lee CSVs reales de Dropbox (Fase 2).
- [x] verify-contpaqi-catalog.ts contra data real (Fase 2).
- [x] Portal endpoint SMTP+IMAP con validación en vivo (Fase 3).
- [x] verifyImapCreds contra servidor IMAP real (Fase 3).
- [x] Cron agent-mailboxes end-to-end (Fase 4).
- [x] fetchUnreadFromImap + markSeenInImap reales (Fase 4).
- [x] Lock agent_mailboxes_lock ejercido (Fase 4).
- [x] routeFacturacion con upsert (Fase 4).
- [x] Nala vision + matching contra catálogo real (Fase 4).
- [x] Executor de tools (submit_invoice_batch) (Fase 4).
- [x] XML upload a Dropbox del cliente (Fase 4).
- [x] Dedup por message_id (Bug 1 fix) (Fase 4.6).

## Qué NO prueba (solo se ve con Beatriz)

- [ ] Installer writer .NET en máquina Windows real con CONTPAQi.
- [ ] Writer consume `pendientes/` → invoca CONTPAQi SDK.
- [ ] CONTPAQi timbra CFDI real vía PAC.
- [ ] Writer escribe `timbrados/*.xml` firmado.
- [ ] Cron nala-writer-inbox correlaciona basename → email_id.
- [ ] Entrega CFDI threaded al remitente original.

Si las Fases 1-4 pasan sin issues, la mayor parte del pipeline está
validada. Los 6 puntos que quedan son mecánicos y bien conocidos por
el installer + el código writer que YA tiene tests en el repo del .NET.
