# Runbook de sesión con Beatriz (piloto Nala + Nelia + writer)

Guía cronológica para la sesión de arranque del piloto. Sigue las fases
en orden: cada una tiene tiempo estimado, quién actúa, qué hacer
exactamente, cómo verificar antes de continuar, y qué hacer si algo
falla. Duración total estimada: 60-90 min.

Regla de tono con Beatriz: nunca mencionar "IA", "inteligencia
artificial", ni "bot". Hablar de "empleados digitales" (Nala, Nelia)
que trabajan como si fueran humanos con computadora.

---

## Antes de salir de casa (30 min)

Nazre confirma en tu laptop:

- [ ] Vercel `AGENT_MAILBOXES_ENABLED`, `NALA_WRITER_INBOX_ENABLED`,
      `NALA_MAILBOX_ENABLED` visibles en dashboard (Settings → Environment
      Variables → Production). Todos deben estar en `false` por ahora.
- [ ] `git pull` para tener los últimos commits (incluye Fase 2 IMAP +
      cron agent-mailboxes + fixes).
- [ ] `.env.local` con `ENCRYPTION_KEY` (32 bytes hex).
- [ ] Cargar `installer/Output/BillingWriter-Setup-0.10.4.exe`
      (SHA256 `E1F22F36...`) en un USB o Dropbox personal por si la conexión
      del cliente falla.
- [ ] Anydesk / TeamViewer probado por si el remoto es mejor que estar
      encima de su hombro.
- [ ] WhatsApp abierto por si necesitas mandarle links/textos.
- [ ] Portal admin abierto: `https://www.centinelia.mx/admin` con
      credenciales.
- [ ] Terminal PowerShell + editor abierto en `C:\Users\Nazre\centinelia`.

---

## FASE 0. Verificación de prerequisitos con Beatriz (5 min)

Al llegar, antes de tocar nada, confirma que ella tiene lo mínimo:

**Preguntas a Beatriz:**

1. ¿Tienes CONTPAQi Comercial Premium o Pro instalado en esta máquina?
   → Debe decir "Premium" o "Pro". "Básico" no sirve.
2. ¿La empresa CONTPAQi ya está creada y tiene CSD cargado?
   → Abrir CONTPAQi, verificar que puede facturar manualmente.
3. ¿Ya autorizó la app de Centinelia en su Dropbox?
   → Debe haber recibido y aceptado el link OAuth del portal.
4. ¿Ya me pasó las credenciales del correo de facturación
   (`facturacion@tortillasestrella.com.mx` o similar)?
   → Anotar: usuario, contraseña, host SMTP, host IMAP.
5. ¿La máquina tiene SQL Server corriendo (viene con CONTPAQi
   Comercial)?
   → Debería. Confirmar visualmente en Services de Windows: `SQL Server
   (SQLEXPRESS)` estado Running.

**Si falta algo:** parar la sesión con Beatriz para esa parte y pedir
que lo resuelva. No avanzar con gaps porque después es peor.

---

## FASE 1. Autorización Dropbox + sync token (10 min)

### 1.1 Beatriz autoriza Dropbox (si no lo hizo antes)

En su computadora, ella entra a:
`https://www.centinelia.mx/portal/<su-token>?tab=organizacion#integraciones`

(Tú le mandas el link exacto por WhatsApp. El token está en la BD de
Centinelia; búscalo con):

```sql
SELECT portal_token FROM organizations WHERE portal_email = '<beatriz>';
```

Beatriz clickea "Conectar Dropbox" → login Dropbox → Aceptar → regresa
al portal con mensaje verde de éxito.

### 1.2 Tú verificas que el token quedó guardado

En tu terminal, con Supabase MCP o SQL Editor:

```sql
SELECT portal_email, provider, status, expires_at
FROM integration_accounts
WHERE portal_email = '<beatriz>' AND provider = 'dropbox';
```

Debe salir 1 fila con `status='active'` y `expires_at` a ~4h en el
futuro.

### 1.3 Tú corres el sync script para puentear el token a billing

```powershell
cd C:\Users\Nazre\centinelia
npx tsx scripts/sync-dropbox-token-to-billing.ts <portal_email_beatriz>
```

Salida esperada: `[<email>] ok (refreshed)` + línea con `expira: ...`.

**Si falla:** verificar que `organization_integrations` type='contpaqi'
existe para Beatriz (paso 2 del onboarding). Si no existe, hacer el
INSERT antes.

---

## FASE 2. Configurar buzón de Nala (SMTP + IMAP) desde el portal (10 min)

### 2.1 Beatriz entra a la config del empleado

En su portal:
`/portal/<token>/configurar` → selecciona a **Nala** → panel "Servidor
SMTP del negocio".

### 2.2 Beatriz llena los datos SMTP (tú le dictas de tus notas)

- **Servidor SMTP:** `smtp.tortillasestrella.com.mx` (o el que aplique;
  para Telmex/Prodigy usa `smtp.` NO `mail.` — `mail.` no resuelve).
- **Puerto:** `465`.
- **SSL/TLS:** activado (checkbox por default).
- **Usuario:** `facturacion@tortillasestrella.com.mx`.
- **Contraseña:** la del webmail (NO app-password).
- **Nombre visible:** `Nala - Tortillería Estrella`.

### 2.3 Beatriz marca IMAP y llena datos

- **Checkbox** "Empleado también lee este buzón (IMAP inbound)": marcar.
- **Servidor IMAP:** típicamente el mismo hostname que SMTP.
- **Puerto IMAP:** `993`.

### 2.4 Si es Telmex/Prodigy/CarrierZone

Beatriz marca **"Ignorar validación del certificado TLS"**. Es común
que el cert sea `*.carrierzone.com` y no coincida con su dominio.

### 2.5 Beatriz clickea "Probar y guardar"

El portal valida SMTP + IMAP en vivo. Si dice OK y le llegó un correo
de prueba a su webmail, sigue. Si falla:

- Error "altnames" o "certificate" → volver a 2.4, marcar TLS insecure.
- Error "authentication failed" → verificar password (que sea la del
  webmail, no app-password de Google/Outlook).
- Error "ECONNREFUSED" o timeout → verificar host (probar `smtp.` vs
  `mail.` vs IP directa).

### 2.6 Repetir 2.1-2.5 para Nelia

Nelia tiene su propio correo (`servicioalcliente@tortillasestrella.com.mx`).
Mismo procedimiento con sus credenciales.

**Verificación:**
```sql
SELECT agent_name, features->'smtp_config'->>'host' as smtp,
       features->'smtp_config'->>'imap_host' as imap
FROM voice_agents WHERE portal_email = '<beatriz>' AND active;
```

Debe salir 2 filas (Nala + Nelia) con smtp e imap poblados.

---

## FASE 3. Registrar Nala en organization_integrations (5 min)

**Solo si no está creado ya.** Verificar primero:

```sql
SELECT id FROM organization_integrations
WHERE portal_email = '<beatriz>' AND type = 'contpaqi';
```

Si sale vacío, insertar (rellenar valores fiscales reales de Beatriz):

```sql
INSERT INTO organization_integrations (portal_email, type, config)
VALUES (
  '<beatriz>',
  'contpaqi',
  jsonb_build_object(
    'dropbox_token', '',
    'dropbox_base_path', '/Facturacion',
    'storage_backend', 'dropbox',
    'fiscal', jsonb_build_object(
      'rfc_emisor', 'XAXX010101000',
      'regimen_fiscal', '612',
      'serie_default', 'A',
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

Después re-correr el sync script para que el token quede en `config`:

```powershell
npx tsx scripts/sync-dropbox-token-to-billing.ts <beatriz>
```

---

## FASE 4. Instalación writer .NET en la máquina de Beatriz (20 min)

### 4.1 Copiar el installer

Desde tu USB o via WhatsApp/Dropbox personal, mover
`BillingWriter-Setup-0.10.4.exe` al escritorio de Beatriz.

Verificar SHA256 (opcional pero recomendado):
```powershell
Get-FileHash BillingWriter-Setup-0.10.4.exe
# Debe empezar con E1F22F36...
```

### 4.2 Ejecutar como administrador

Click derecho → "Ejecutar como administrador". Aceptar el UAC. Next,
Next, Install. Al final el installer muestra un mensaje diciendo que
hay que editar `appsettings.json`.

### 4.3 Fijar el registry NOMBRESERVIDOR

Abrir PowerShell como admin en su máquina:

```powershell
$hostname = (Get-CimInstance Win32_ComputerSystem).Name
Set-ItemProperty `
  -Path 'HKLM:\SOFTWARE\WOW6432Node\Computación en Acción, SA CV\CONTPAQ I SDK' `
  -Name 'NOMBRESERVIDOR' `
  -Value "tcp:${hostname}\SQLEXPRESS,1433"

Get-ItemProperty `
  -Path 'HKLM:\SOFTWARE\WOW6432Node\Computación en Acción, SA CV\CONTPAQ I SDK' `
  -Name 'NOMBRESERVIDOR'
```

El output final debe mostrar la ruta con el nombre real del host.

**Si el registry no existe:** revisar si CONTPAQi está instalado
correctamente. Si es Comercial Básico, el SDK no viene y esto no
funciona.

### 4.4 Identificar datos SQL de la empresa CONTPAQi

En SQL Server Management Studio (o con `sqlcmd`):

```sql
SELECT name FROM sys.databases WHERE name LIKE 'ad%';
```

Debe salir algo tipo `adPILOTO01` o `adTortilleria`. Anotar el nombre.

También identificar la ruta absoluta de la empresa:
- Abrir CONTPAQi → seleccionar empresa → Ayuda → "Ruta de la empresa"
  o similar.
- Anotar (típicamente `C:\Compac\Empresas\adTortilleria`).

### 4.5 Editar appsettings.json

En PowerShell admin:

```powershell
notepad C:\ProgramData\Centinelia\BillingWriter\appsettings.json
```

Editar los valores:

- `Writer.EmpresaPath`: la ruta que anotaste en 4.4.
- `Writer.Concepto`: `440` (default CFDI factura; confirmar en
  `admConceptos` si hay duda).
- `Writer.CsdPassword`: password del CSD que cargó en CONTPAQi.
- `Writer.SqlConnectionString`:
  `Server=localhost\SQLEXPRESS;Database=<nombre_bd_de_4.4>;User Id=SA;Password=<pwd_SA>;TrustServerCertificate=True`
- `Writer.Storage.Backend`: `dropbox`
- `Writer.Storage.DropboxToken`: **plaintext** del access_token de
  Beatriz (Dropbox App Console, NO el encriptado que tenemos en BD).
  Alternativa: correr `verify-contpaqi-catalog.ts` con el email de
  Beatriz para que descargue y muestre el token descencriptado.

Guardar (Ctrl+S). Cerrar Notepad.

### 4.6 Iniciar el service

```powershell
Start-Service Centinelia.BillingWriter
Get-Service Centinelia.BillingWriter
```

Status debe decir `Running`.

**Si falla al arrancar:** ver el log:
```powershell
Get-Content C:\ProgramData\Centinelia\BillingWriter\logs\writer-*.log -Tail 50
```

Errores comunes:
- `CSD password incorrecto` → verificar password del CSD en CONTPAQi.
- `Could not connect to SQL` → verificar SqlConnectionString y que SQL
  Server esté corriendo.
- `Dropbox 401` → token inválido, verificar plaintext correcto.

---

## FASE 5. Primera sync + verify catálogo (10 min)

### 5.1 Esperar ~30 seg

El writer ejecuta su primera sync al arrancar. Va a leer `admClientes`
y `admDocumentos` y va a subir a Dropbox:
- `/Facturacion/Config/contpaqi_clientes.csv`
- `/Facturacion/Config/contpaqi_productos.csv`
- `/Facturacion/Config/last_sync.json`

### 5.2 Verificar en Dropbox

En el Dropbox de Beatriz (webmail o app): navegar a `/Facturacion/Config/`
y confirmar que aparecen los 3 archivos.

### 5.3 Verificar desde nuestro lado

En tu terminal:

```powershell
cd C:\Users\Nazre\centinelia
npx tsx scripts/verify-contpaqi-catalog.ts <beatriz>
```

Salida esperada:
```
ok: N clientes cargados, M productos cargados
primeros 3 clientes:
  - RFC1  RAZÓN SOCIAL 1
  - RFC2  RAZÓN SOCIAL 2
  ...
primeros 3 productos:
  - [SKU1] NOMBRE  $PRECIO
  ...
```

Con esto confirmamos que el pipeline lee bien el catálogo real de
Beatriz.

**Si falla:**
- `Dropbox 404` → el writer no ha subido; esperar más o revisar log.
- `Encoding error` → el adapter auto-detecta Windows-1252, si aún así
  falla, hacer notar en handoff y arreglar.

---

## FASE 6. Flip kill switches en Vercel + redeploy (10 min)

**Importante:** los env vars nuevos NO surten efecto sin redeploy.

### 6.1 Cambiar a `true` los flags en Vercel dashboard

En `https://vercel.com/centinelia1/centinelia_product` → Settings →
Environment Variables:

- `AGENT_MAILBOXES_ENABLED` → editar → `true`
- `NALA_WRITER_INBOX_ENABLED` → editar → `true`
- Dejar `NALA_MAILBOX_ENABLED=false` (esto es la Nala INTERNA de
  Centinelia, distinta al piloto; solo se activa cuando se pague
  Facturama prod).

### 6.2 Redeploy

Deployments → tres puntos del último → Redeploy → sin "Use existing
build cache" → Redeploy.

Esperar ~2 min a que quede "Ready".

### 6.3 Verificar que el cron se activó

Esperar el próximo tick del cron `agent-mailboxes` (cada 10 min).
Chequear Vercel Logs → filtrar `agent-mailboxes`. Debe verse el
response con `{ ok: true, summary: {...} }` (no `{ skipped: 'disabled' }`).

### 6.4 Activar cobro al pool para Nala

```sql
UPDATE voice_agents
SET features = jsonb_set(features, '{nala_pool_charge_enabled}', 'true')
WHERE portal_email = '<beatriz>' AND role = 'facturacion';
```

---

## FASE 7. Smoke E2E (15 min)

**Regla dura:** desde `nazre20@gmail.com`, NUNCA de un correo de
Beatriz. Es la [feedback-no-test-a-clientes].

### 7.1 Enviar notita de prueba

Desde `nazre20@gmail.com` (Gmail personal):

- **Para:** `facturacion@tortillasestrella.com.mx`
- **Asunto:** `Prueba nota Nala`
- **Cuerpo:** `Adjunto foto de prueba.`
- **Adjunto:** una foto de una notita real (puedes usar una del set
  `fixtures/piloto-tortilleria/notitas-reales/` que tienes en el repo).

### 7.2 Esperar ~10 min para el próximo tick del cron

O forzar manualmente:
```powershell
curl -H "Authorization: Bearer <CRON_SECRET>" https://www.centinelia.mx/api/cron/agent-mailboxes
```

Response esperado (JSON): `agents_processed >= 1`, `total_fetched >= 1`,
`total_enqueued >= 1`.

### 7.3 Verificar la cadena en BD

```sql
-- Primer paso: correo entró
SELECT id, from_address, to_address, subject, attachment_count, created_at
FROM billing_incoming_emails
ORDER BY created_at DESC LIMIT 1;

-- Segundo paso: job encolado
SELECT id, kind, status, attempts, created_at
FROM billing_jobs
ORDER BY created_at DESC LIMIT 1;

-- Tercer paso: Nala ejecutó tools + subió XML
SELECT action_type, count(*), max(created_at)
FROM billing_activity_log
WHERE portal_email = '<beatriz>'
  AND created_at > now() - interval '30 min'
GROUP BY action_type;
```

Debe verse eventualmente:
- `invoice_submitted` (Nala subió XML a Dropbox pendientes/).
- `writer_cfdi_delivered` (writer timbró + cron entregó CFDI).

Tiempo total esperado: 3-15 min según latencia del writer + CONTPAQi.

### 7.4 Verificar entrega del CFDI

Revisar Gmail de `nazre20@gmail.com`. Debe llegar un correo desde
`facturacion@tortillasestrella.com.mx` (SMTP de Beatriz) con:
- Threaded al correo original.
- XML + PDF adjuntos.
- UUID visible en el cuerpo.

Verificar el CFDI en el portal SAT (si Beatriz da permiso, con su
RFC + CIEC).

**Si algo no llega:** trazar por logs:
- Vercel Logs → cron `agent-mailboxes` → confirmar fetch OK.
- Writer log en máquina Beatriz → confirmar batch timbrado.
- Vercel Logs → cron `nala-writer-inbox` → confirmar delivery.

---

## FASE 8. Handoff a Beatriz + cierre (10 min)

### 8.1 Mostrarle qué está pasando

Explicarle a Beatriz que a partir de ahora:

- Sus clientes le pueden mandar notas por correo a
  `facturacion@tortillasestrella.com.mx` (o el que usan).
- Nala recibe, interpreta la foto, arma el XML, lo timbra vía CONTPAQi,
  y responde al cliente con el CFDI adjunto en el mismo hilo.
- Si Nala no está segura de algo (cliente nuevo, producto raro, monto
  no cuadra), le escribe a Beatriz por correo pidiendo ayuda.
- Nelia atiende otras consultas por
  `servicioalcliente@tortillasestrella.com.mx` con el prompt que tenía
  antes; ahora también puede responder correos entrantes.

### 8.2 Establecer canal de soporte

Confirmar con Beatriz cuál es el canal preferido para reportar problemas
del piloto (WhatsApp directo a Nazre). Guardar sus contactos.

### 8.3 Agendar check-in de 24h

Sugerirle un check-in por WhatsApp mañana a la misma hora para revisar
cómo salió el primer día real.

### 8.4 Post-sesión (tú solo)

Al regresar:
- Actualizar el handoff `handoff-writer-activacion-beatriz.md` con
  fecha real de arranque + issues encontrados.
- Poner alarma para revisar logs Vercel + billing_activity_log en 24h.
- Confirmar que el cron drift detector (`detectOutboundWithoutLedger`)
  no está reportando drifts.
- Correr `sync-dropbox-token-to-billing.ts --all` manual al día
  siguiente por si el cron tuvo algún gap.

---

## Rollback si algo sale mal

Si el pipeline empieza a mandar cosas raras al cliente final o Beatriz
reporta un problema serio:

```sql
-- Apagar Nala inmediatamente
UPDATE voice_agents SET active = false
WHERE portal_email = '<beatriz>' AND role = 'facturacion';

-- Desactivar integración billing
UPDATE organization_integrations
SET config = jsonb_set(config, '{disabled}', 'true')
WHERE portal_email = '<beatriz>' AND type = 'contpaqi';
```

En Vercel:
- `NALA_WRITER_INBOX_ENABLED=false` (surte efecto en próximo tick, no
  requiere redeploy inmediato para APAGAR — solo para PRENDER).

En máquina Beatriz:
```powershell
Stop-Service Centinelia.BillingWriter
```

---

## Referencias rápidas

- Prep antes de agendar: `docs/billing/prep-sesion-cliente.md`
- Onboarding formal: `docs/billing/onboarding-nuevo-cliente.md`
- Install writer: `windows-agent/billing-contpaqi-writer/installer/DEPLOY.md`
- Setup Resend Inbound (legacy, no usar): `docs/billing/resend-inbound-setup.md`
- Activación técnica: `handoff-writer-activacion-beatriz.md`
