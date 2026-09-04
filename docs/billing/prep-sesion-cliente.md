# Prep sesión de instalación con cliente (Nala + writer .NET)

Guía para arrancar un piloto Nala sin perder tiempo en la sesión de
instalación. Todos los datos y accesos deben estar recolectados ANTES de
sentarse (remoto o presencial) con el cliente.

## Datos que necesitas del cliente por adelantado

Pídele por WhatsApp/correo antes de agendar:

### 1. Datos SQL Server de CONTPAQi

- **Nombre del host + instancia** (ej. `LAPTOP-XYZ\SQLEXPRESS`).
  - Si no lo saben: `SELECT @@SERVERNAME` desde SSMS te lo devuelve.
- **Puerto TCP** si es distinto al default (default `1433`).
- **Credencial** con permisos `db_datareader` sobre la BD de la empresa.
  - Si el cliente usa `SA`, sirve pero es feo. Mejor pedirle a su
    IT que cree un login dedicado (`centinelia_reader`).
  - Nombre de la BD de la empresa (ej. `adPILOTO01` — CONTPAQi crea una
    BD por empresa).

### 2. Datos CONTPAQi

- **Versión instalada** (Comercial Premium/Pro. Nala requiere Premium o
  Pro para SDK). `Ayuda → Acerca de` en CONTPAQi.
- **Ruta absoluta de la empresa** (ej. `C:\Compac\Empresas\adPILOTO01`).
- **Password del CSD** cargado en la empresa. El CSD debe estar cargado
  desde la creación de la empresa (no se puede agregar después).
- **Código del concepto de facturación** (típicamente `440` = "4.0 CFDI
  FACTURA"). Se puede confirmar en `admConceptos` de la BD.

### 3. Datos fiscales del emisor

- RFC del cliente (persona física o moral).
- Régimen fiscal SAT (601, 612, etc.).
- Serie default para facturación (`A`, `F`, etc.).
- Código postal del domicilio fiscal (LugarExpedicion en CFDI 4.0).
- Uso CFDI default (`G03` es lo típico; ajustar por giro).

### 4. Dropbox

- Cliente autoriza Dropbox App de Centinelia desde el portal
  (`/portal/<token>?tab=organizacion#integraciones`).
- Alternativa si no puede entrar al portal: token largo-vivo de su
  Dropbox App Console (ver alternativa legacy en onboarding paso 2.5).

### 5. Contactabilidad

- WhatsApp / correo para follow-up del piloto.
- Dirección `inbox_email` que quieres darle para reenvíos (ej.
  `notitas-tortilleria@centinelia.mx`). Verificar antes que el MX/webhook
  de Resend Inbound apunte al dominio y el endpoint responda.

## Herramientas para la sesión

- **Acceso remoto**: AnyDesk o TeamViewer preinstalado en la máquina del
  cliente. Confirmar 24h antes que abre y muestra ID.
- **Screen share alterno**: Google Meet para hablar mientras el remoto
  hace el trabajo.
- **Archivos listos en tu máquina**:
  - `installer/Output/BillingWriter-Setup-<ver>.exe` copiado al escritorio.
  - `appsettings.json` con los valores del cliente pre-llenados (en un
    archivo local, para copiar-pegar rápido).
  - SQL de onboarding (paso 1-2) listo para ejecutar en Supabase MCP.
  - Terminal con `tsx scripts/sync-dropbox-token-to-billing.ts <email>`
    listo para correr después del OAuth.

## Orden de la sesión (~45 min)

1. **[5 min]** Cliente entra a portal → clickea "Conectar Dropbox" →
   autoriza. Verificar `integration_accounts.status='active'` para su
   portal_email.
2. **[5 min]** Nazre ejecuta SQL paso 1-2 en Supabase → corre sync script
   → verificar `organization_integrations.config.dropbox_token` populated.
3. **[15 min]** Remoto en máquina del cliente:
   - Copiar installer, ejecutar como admin.
   - Fijar registry `NOMBRESERVIDOR` con el valor SQL real.
   - Editar `C:\ProgramData\Centinelia\BillingWriter\appsettings.json`
     con datos pre-llenados.
   - `Start-Service Centinelia.BillingWriter` + verificar estado Running.
4. **[5 min]** Esperar primera sync (writer polling ~30s) → verificar
   `Config/contpaqi_clientes.csv` + `contpaqi_productos.csv` +
   `last_sync.json` en Dropbox del cliente. Correr
   `tsx scripts/verify-contpaqi-catalog.ts <portal_email>`.
5. **[5 min]** Flip `NALA_WRITER_INBOX_ENABLED=true` en Vercel → redeploy.
6. **[10 min]** Smoke E2E: enviar 1 correo desde `nazre20@gmail.com` con
   foto notita a `<inbox_email>` → esperar timbrado → verificar CFDI
   threaded de vuelta.

## Post-sesión

- Enviar correo de bienvenida al cliente (paso 7 del onboarding) con:
  - Instrucciones de qué correo usar para forwards de notitas.
  - Contacto de emergencia (Nazre WhatsApp).
- Anotar en handoff cualquier friction encontrado para mejorar el
  onboarding.
