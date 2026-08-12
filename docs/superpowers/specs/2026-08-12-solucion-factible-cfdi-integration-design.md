# Integración Solución Factible (PAC) — Timbrado CFDI 4.0

**Fecha:** 2026-08-12
**Autor:** Nazre + Claude
**Driver:** AC Proyectos (piloto). Objetivo: los empleados digitales de Centinelia timbran y cancelan CFDI directamente vía Solución Factible, reemplazando el flujo actual de "solicitar_factura → escalar a humano por email".

---

## 1. Contexto

Hoy Centinelia **no timbra**. La tool `solicitar_factura` (definida en `src/lib/fiscal/request-factura.ts`) inserta una fila en `factura_requests` y manda un email al humano, que abre su PAC (Solución Factible en el caso de AC Proyectos) y timbra manual. Ver memoria `project-centinelia-no-timbra`.

AC Proyectos usa Solución Factible como PAC. La documentación técnica confirma que SF expone SOAP WebServices con endpoints separados para pruebas y producción, autenticación por usuario/password del PAC, y soporte CFDI 4.0 completo (timbrado + cancelación asíncrona con motivos SAT 01/02/03/04).

Al integrar SF podemos empoderar a los empleados digitales para emitir facturas de verdad, siguiendo tres principios de Centinelia:

1. **Los empleados deciden solos** (`feedback-empleados-inteligentes`) — sin botones "Aprobar/Rechazar" por default.
2. **Toda integración es org-level** (`feedback-integraciones-org-level`) — vive en `organizations`, no en `voice_agents`.
3. **Toda tool en los 3 canales** (`feedback-tool-3-canales`) — voice + chat + email/inbox.

## 2. Decisiones tomadas durante brainstorming

| Pregunta | Decisión |
|---|---|
| Alcance | Piloto AC Proyectos, con **abstracción provider-agnostic desde día 1** para que cliente 2 no requiera refactor |
| Custodia CSD | Supabase Storage privado + AES-256-GCM con `ENCRYPTION_KEY` de app |
| Modelo de aprobación | Auto-timbrado con **límites configurables** por org; sobre umbral cae a humano en portal (flujo actual) |
| Cancelación | **Humano siempre confirma** en portal. Agente solo puede *solicitar* cancelación **si el toggle de la integración lo permite** (default Off) |
| Tool única vs dos | **Una sola tool `solicitar_factura`** (mantiene nombre). Su comportamiento depende de si la org tiene PAC conectado. La integración ES el switch — no hay toggle de "auto-timbrado" independiente |

## 3. Arquitectura

### 3.1 Módulos nuevos

```
src/lib/invoicing/
  ├─ provider.ts           # interface InvoicingProvider + tipos comunes
  ├─ solucion-factible/
  │   ├─ index.ts          # SolucionFactibleProvider implements InvoicingProvider
  │   ├─ soap-client.ts    # cliente SOAP mínimo con fetch nativo
  │   ├─ xml-builder.ts    # arma CFDI 4.0 XML (xmlbuilder2)
  │   └─ signer.ts         # sella XML con .cer + .key (node-forge + XSLT SAT)
  ├─ csd-vault.ts          # get/put/rotate CSD encriptado
  ├─ guardrails.ts         # evalúa límites configurables antes de timbrar
  └─ solicitar-cancelacion.ts  # handler shared (voice + chat + email)
```

**Convención:** `src/lib/fiscal/request-factura.ts` (existente) se refactoriza para delegar en el módulo nuevo cuando la org tiene PAC. Sin duplicación.

### 3.2 Dependencias npm

- `xmlbuilder2` — armar XML CFDI 4.0
- `fast-xml-parser` — parsear respuestas SOAP y XML timbrado
- `node-forge` — RSA signing, PKCS12/PEM parsing, AES-256-GCM
- **No** metemos `soap` (30+ deps transitorias). Cliente SOAP se arma con `fetch` nativo.

### 3.3 Endpoints Solución Factible

| Entorno | Timbrado | Cancelación |
|---|---|---|
| Test | `https://testing.solucionfactible.com/ws/services/Timbrado` | `https://testing.solucionfactible.com/ws/services/Cancelacion` |
| Prod | `https://solucionfactible.com/ws/services/Timbrado` | `https://solucionfactible.com/ws/services/Cancelacion` |

Credenciales sandbox públicas: `testing@solucionfactible.com` / `timbrado.SF.16672`. Credenciales prod las genera AC desde el panel admin de SF.

## 4. Modelo de datos

### 4.1 Extensiones a `organizations` (org-level, PK `portal_email`)

```sql
alter table organizations add column invoicing_provider text;
  -- 'solucion_factible' | null. null = escalar a humano (comportamiento actual).
alter table organizations add column invoicing_credentials_encrypted text;
  -- AES-GCM({ usuario, password })
alter table organizations add column invoicing_csd_cer_path text;
alter table organizations add column invoicing_csd_key_path text;
alter table organizations add column invoicing_csd_password_encrypted text;
alter table organizations add column invoicing_csd_version int default 0;
alter table organizations add column invoicing_csd_expires_at timestamptz;
alter table organizations add column invoicing_csd_no_certificado text;
alter table organizations add column invoicing_rfc_emisor text;
alter table organizations add column invoicing_razon_social text;
alter table organizations add column invoicing_regimen_fiscal text;
alter table organizations add column invoicing_lugar_expedicion text;  -- CP 5 dígitos
alter table organizations add column invoicing_test_mode bool default true;
alter table organizations add column invoicing_allow_agent_cancellation bool default false;
alter table organizations add column invoicing_limits jsonb default '{
  "monto_max_mxn": 50000,
  "requires_prior_invoice": true,
  "blocked_uso_cfdi": ["D01","D02","D03","D04","D05","D06","D07","D08","D09","D10"],
  "block_new_rfc_first_hours": 24,
  "max_stamps_per_day": 50,
  "max_stamps_per_hour_per_rfc": 3
}';
```

### 4.2 Extensiones a `factura_requests`

```sql
alter table factura_requests add column status text default 'pending';
  -- pending → (auto path) stamping → stamped | stamp_failed
  -- pending → (human path via portal button "Emitir con SF") stamping → stamped
  -- pending → (human path escape hatch) marked_manual  (humano timbró fuera del sistema)
  -- stamped → cancellation_requested → cancelled | (rejected/expired stay as stamped)
alter table factura_requests add column uuid text unique;
alter table factura_requests add column sello_sat text;
alter table factura_requests add column certificado_sat text;
alter table factura_requests add column fecha_timbrado timestamptz;
alter table factura_requests add column cadena_original text;
alter table factura_requests add column xml_storage_path text;
alter table factura_requests add column pdf_storage_path text;
alter table factura_requests add column qr_storage_path text;
alter table factura_requests add column stamp_attempts int default 0;
alter table factura_requests add column stamp_last_error text;
alter table factura_requests add column stamp_last_error_at timestamptz;
alter table factura_requests add column provider text;
alter table factura_requests add column guardrail_reason text;

create unique index on factura_requests (uuid) where uuid is not null;
create index on factura_requests (status) where status in ('stamping','stamp_failed','cancellation_requested');
```

### 4.3 Tabla nueva `cfdi_cancellations`

```sql
create table cfdi_cancellations (
  id uuid primary key default gen_random_uuid(),
  factura_request_id uuid references factura_requests(id) on delete restrict,
  organization_email text not null references organizations(portal_email),
  uuid_cancelado text not null,
  motivo text not null check (motivo in ('01','02','03','04')),
  uuid_sustituto text,
  requested_by text not null,           -- portal_email humano que confirmó (null hasta confirm)
  requested_by_agent_id uuid,           -- agente que capturó la solicitud
  requested_via text check (requested_via in ('voice','chat','email','portal')),
  status text default 'requested',
    -- requested → sent_to_sat → accepted | rejected | expired
  sat_status_last_check timestamptz,
  sat_acuse_xml_path text,
  razon_cliente text,                   -- captura libre desde el agente
  notes text,                           -- notas del humano al confirmar/rechazar
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sustituto_requerido check (motivo != '01' or uuid_sustituto is not null)
);

create index on cfdi_cancellations (organization_email, status);
create index on cfdi_cancellations (status, sat_status_last_check)
  where status = 'sent_to_sat';
```

### 4.4 Storage buckets (Supabase Storage, private, service_role only)

- `csd/{organization_email}/{csd_version}.cer.enc` y `.key.enc`
- `cfdi/{organization_email}/{yyyy}/{mm}/{uuid}.xml`, `.pdf`, `.qr.png`
- `cfdi-cancellations/{organization_email}/{cancellation_id}-acuse.xml`

RLS: sin políticas públicas. Solo se sirven vía signed URLs con TTL 5 min desde endpoints del portal autenticados.

## 5. Custodia del CSD

### 5.1 Cifrado

`src/lib/invoicing/csd-vault.ts` — AES-256-GCM con la `ENCRYPTION_KEY` existente (rotada 2026-07-29). IV random por blob; auth tag concatenado. Node `crypto` nativo, sin deps nuevas.

### 5.2 Upload flow

```
POST /api/portal/[token]/invoicing/csd/upload   (multipart: cer, key, password)

1. Parse multipart: cer (der/pem), key (der/pem), password
2. Con node-forge:
   - Parsear .cer → extraer subject RFC, serial, notBefore, notAfter
   - Intentar abrir .key con password → si falla, error 400 "password inválida"
   - Validar par (public key del cer coincide con private del key)
3. Validar rfc del cer === organizations.invoicing_rfc_emisor (si null, setearlo)
4. Cifrar cer y key con AES-GCM. Subir a Storage con nueva version.
5. Cifrar password. UPDATE organizations con paths, version, expires_at, no_certificado.
6. Log en admin_access_log (quién subió, when, sin blob).
7. Marcar version previa como superseded (no borrar).
```

### 5.3 Read flow

`getCsd(orgEmail)` retorna `{cerPem, keyPem, noCertificado}` en memoria. Nunca se loguea. Se pasa por reference al signer y se descarta después de firmar.

### 5.4 Rotación y expiración

- Rotación manual: mismo endpoint upload, incrementa version.
- Cron `csd-expiry-notify` (diario 9am UTC): notifica 30/15/7/1 días antes de `invoicing_csd_expires_at`.

## 6. Interface `InvoicingProvider`

```ts
export interface InvoicingProvider {
  timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult>;
  cancelar(uuid: string, motivo: CancelMotivo, uuidSustituto: string | null, opts: CancelOpts): Promise<CancelSubmitResult>;
  consultarEstatusCancelacion(uuid: string, opts: CancelOpts): Promise<CancelStatus>;
}

export type CancelMotivo = '01' | '02' | '03' | '04';
export interface TimbrarOpts { testMode: boolean; timeoutMs?: number; }
export interface CancelOpts { testMode: boolean; }

export interface CfdiInput {
  emisor: { rfc: string; regimenFiscal: string; nombre: string };
  receptor: {
    rfc: string; nombre: string;
    usoCfdi: string; regimenFiscal: string; domicilioFiscal: string;
  };
  lugarExpedicion: string;
  formaPago: string; metodoPago: string;
  moneda: 'MXN' | 'USD'; tipoCambio?: number;
  conceptos: Array<{
    claveProdServ: string; claveUnidad: string;
    cantidad: number; descripcion: string;
    valorUnitario: number; importe: number;
    iva?: number;
  }>;
  subtotal: number; iva: number; total: number;
  csd: { cerPem: string; keyPem: string; noCertificado: string };
  pacCredentials: { usuario: string; password: string };
}

export type StampResult =
  | {
      ok: true;
      uuid: string; selloSat: string; certificadoSat: string;
      fechaTimbrado: string; cadenaOriginal: string;
      xmlTimbrado: Buffer; qrPng: Buffer;
    }
  | { ok: false; code: number; message: string; retryable: boolean };

export interface CancelSubmitResult {
  status: 'sent_to_sat' | 'rejected';
  message: string;
}

export interface CancelStatus {
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  acuseXml?: Buffer;
  message?: string;
}
```

### 6.1 Mapeo de errores Solución Factible

| Código SF | retryable | Acción |
|---|---|---|
| 200 | — | ok |
| 301, 302 | no | XML/sello inválido — bug del builder o CSD corrupto. Notifica y no reintenta |
| 500, 501, 503 | sí | Backoff exponencial |
| 601, 602, 603, 604, 605 | no | Credenciales rotas. Marca `invoicing_credentials_invalid` en org, notifica humano |
| 630, 631, 632 | no | PAC sin timbres disponibles. Notifica humano — AC debe comprar más en su panel SF |

## 7. Tool `solicitar_factura` — comportamiento nuevo

### 7.1 Registry en 3 canales — SIN cambios

La tool ya existe en `sync.ts`, `agent-chat/route.ts`, `executor.ts`, `inbox-processor.ts`. Solo cambia el handler interno.

### 7.2 Handler refactorizado

`src/lib/fiscal/request-factura.ts` — la función `solicitarFactura()` mantiene su firma pública. Internamente:

```
solicitarFactura(args, ctx):
  1. Validaciones (RFC, catálogos, items) — sin cambios
  2. Calcula subtotal/IVA/total — sin cambios
  3. INSERT en factura_requests con status='pending'
  4. path = resolveInvoicingPath(orgEmail):
     - null provider              → 'human'
     - guardrails fallan          → 'human' con guardrail_reason
     - todo ok                    → 'auto'
  5. Si 'human':
     - Manda email al invoicing_email (código actual)
     - Devuelve { ok: true, path: 'human', request_id, ... }
  6. Si 'auto':
     - Delega a emitirFacturaAuto(request_id, ctx)
     - Devuelve { ok: true, path: 'auto', outcome: 'stamped'|'failed'|'retrying', uuid?, ... }
```

`emitirFacturaAuto(request_id, ctx)` vive en `src/lib/invoicing/emitir-factura.ts`:

```
1. UPDATE status='stamping', stamp_attempts++
2. csd = await getCsd(orgEmail)   -- valida vigencia; si expira en < 1 día → status='stamp_failed' + notifica humano
3. cfdiInput = mapToProviderInput(request, org, csd)   -- ensambla emisor + receptor + conceptos + credenciales PAC
4. result = provider.timbrar(cfdiInput, { testMode: org.invoicing_test_mode })
   -- el provider (SolucionFactibleProvider) internamente:
   --   a. xmlSinSellar = xmlBuilder.build(cfdiInput)
   --   b. xmlSellado   = signer.sign(xmlSinSellar, cfdiInput.csd)
   --   c. soapResponse = soapClient.timbrarBase64(usuario, password, xmlSellado)
   --   d. parsea respuesta, extrae uuid/sello/cert/fecha/cadena
5. Si ok:
     - Sube xmlTimbrado, qrPng a Storage
     - Genera PDF (patrón de src/lib/contract/template.tsx aplicado a CFDI en src/lib/invoicing/pdf-builder.ts)
     - UPDATE status='stamped', uuid, sello_sat, cert, fecha, cadena, paths
     - Dispatch email al cliente con XML+PDF adjuntos (reusa lib/email/send)
     - Log en policy_audit_log (capability='cfdi_timbrado', status='completed')
     - return { outcome: 'stamped', uuid, ... }
6. Si fail no-retryable:
     - UPDATE status='stamp_failed', stamp_last_error=<msg>
     - Notifica humano (email + card roja en portal)
     - Log en policy_audit_log (status='failed')
     - return { outcome: 'failed', error }
7. Si fail retryable:
     - UPDATE stamp_last_error=<msg>, stamp_last_error_at=now()
     - Status queda 'stamping' — cron retry-failed-stamps lo tomará
     - return { outcome: 'retrying' }
```

### 7.3 Copy adaptativo del agente

El handler devuelve `outcome` estructurado. La route `/api/voice/tools/solicitar-factura/route.ts` traduce a string legible:

- `stamped` → *"Ya la emití, folio {UUID last-8}. Te la mandé a {email}."*
- `human` (sin PAC) → *"Le avisé al equipo de facturación que la emita hoy mismo, te llegará a {email}."* (copy actual)
- `human` (guardrail) → *"Registré la solicitud. Por el monto/monto/etc. el equipo la revisa hoy mismo y te la manda a {email}."*
- `failed` → *"Hubo un problema técnico al emitirla en el momento, el equipo la emite manual hoy mismo."*
- `retrying` → *"Estoy procesando la emisión, te llegará a {email} en los próximos minutos."*

Este contract del handler (retornar `outcome` + campos) se aplica en los 3 canales — chat y email agent leen el mismo shape.

## 8. Cancelación

### 8.1 Toggle Off (default) — comportamiento

- Tool `solicitar_cancelacion_factura` NO se registra en `sync.ts`, `agent-chat`, ni `inbox-processor` para orgs con `invoicing_allow_agent_cancellation=false`.
- Si el cliente pide cancelación por voz/chat/email, el agente responde con copy honesto: *"Las cancelaciones las maneja el equipo de facturación. Te contacto con ellos, ¿por correo o WhatsApp?"*
- Humanos siempre pueden solicitar cancelación desde el portal en el detalle de la factura.

### 8.2 Toggle On — tool nueva

```
solicitar_cancelacion_factura({
  uuid_o_folio_corto: string,
  motivo: '01' | '02' | '03' | '04',
  uuid_sustituto?: string,   // requerido si motivo='01'
  razon_cliente?: string,
})
```

Handler `src/lib/invoicing/solicitar-cancelacion.ts`:

```
1. Busca factura_request por UUID exacto o últimos 8 chars, scoped a org.
   Si ambiguo o no encontrado → error legible al agente.
2. Valida motivo válido; motivo='01' exige uuid_sustituto.
3. Verifica no exista cancellation activa (status IN ('requested','sent_to_sat')).
4. INSERT cfdi_cancellations con status='requested', requested_via=channel.
5. UPDATE factura_requests.status='cancellation_requested'.
6. Email al invoicing_email de la org.
7. Devuelve "Registré la solicitud de cancelación, el equipo la confirma en las próximas horas."
```

### 8.3 Confirmación en portal (humano siempre)

Endpoint `POST /api/portal/[token]/cancellations/[id]/confirm`:

```
1. Auth (portal_users o owner)
2. cancellation = load; valida status='requested'
3. csd = getCsd(orgEmail)
4. result = provider.cancelar(uuid, motivo, uuidSustituto, {testMode})
5. UPDATE cfdi_cancellations SET status='sent_to_sat', requested_by=user
6. Log en policy_audit_log
```

Endpoint `POST /.../cancellations/[id]/reject`: `status='rejected'` + notas + notifica al agente (audit log).

### 8.4 Poll cron

`vercel.json` — nuevo cron `/api/cron/poll-sat-cancellations` cada 30 min:

```sql
SELECT * FROM cfdi_cancellations
WHERE status='sent_to_sat'
  AND (sat_status_last_check IS NULL OR sat_status_last_check < now() - interval '30 min')
  AND created_at > now() - interval '10 days'
ORDER BY created_at ASC
LIMIT 50
FOR UPDATE SKIP LOCKED;
```

Por cada:
- `provider.consultarEstatusCancelacion(uuid, {testMode})`
- `accepted` → UPDATE `status='accepted'`, guarda acuse en Storage, `factura_requests.status='cancelled'`, email al humano y cliente
- `rejected` → UPDATE `status='rejected'`, email al humano con razón SAT
- `pending` → UPDATE `sat_status_last_check=now()`
- `expired` → UPDATE `status='expired'` (motivos 02/03/04 con receptor que no aceptó en 72h)

`FOR UPDATE SKIP LOCKED` para prevenir doble-procesamiento (patrón de `decisions_audit_scope_cd_debts_execution`).

### 8.5 Retry stamping

`vercel.json` — cron `/api/cron/retry-failed-stamps` cada 10 min:

```sql
SELECT * FROM factura_requests
WHERE status='stamping'
  AND stamp_last_error IS NOT NULL
  AND stamp_attempts < 3
  AND stamp_last_error_at < now() - (case
        when stamp_attempts = 1 then interval '1 minute'
        when stamp_attempts = 2 then interval '5 minutes'
        else interval '30 minutes'
      end)
LIMIT 20
FOR UPDATE SKIP LOCKED;
```

Backoff exponencial. Después de 3 intentos → `status='stamp_failed'`.

## 9. UI portal

### 9.1 Nueva ruta `/portal/[token]/oficina/integraciones/solucion-factible`

Componentes reutilizables del design system V2 (Card, Input, Select, Toggle, FileUpload). Sigue patrón de `QuickBooksSection.tsx`.

Sección "Estado" (siempre visible):
- Conectado / Desconectado
- Si conectado: RFC emisor, vigencia CSD (con warning ámbar si < 30 días), modo (Pruebas/Producción)

Sección "Configuración" (visible solo si conectado):
- Datos emisor: RFC, razón social, régimen fiscal, lugar de expedición (CP)
- Credenciales SF: usuario (visible), password (edit-only, nunca render)
- CSD: upload .cer + .key + password. Botón "Reemplazar CSD" incrementa version
- Modo: [Pruebas (sandbox)] / [Producción]
- Toggle: *¿Permitir que tu empleado solicite cancelación de facturas?* [Sí/No] (default No)
- Guardrails:
  - Monto máximo por CFDI auto (default $50,000)
  - Requerir factura previa al mismo RFC (default Sí)
  - Usos CFDI bloqueados para auto (default: todos los D0X)
  - Máx CFDI por hora al mismo RFC (default 3)
  - Máx CFDI por día (default 50)
- Botón "Desconectar" (confirm modal, revierte a modo humano)

### 9.2 `/portal/[token]/oficina/facturas` — rediseño mínimo

Reusa estructura actual. Añade:
- Chip de estado con color: `pending` gris, `stamping` azul pulse, `stamped` verde + folio corto, `stamp_failed` rojo con tooltip, `cancellation_requested` ámbar, `cancelled` tachado gris
- Filtro por estado en header
- Row expandida `stamped`: "Descargar XML" · "Descargar PDF" · "Reenviar al cliente" · "Solicitar cancelación"
- Row expandida `cancellation_requested`: card ámbar "Confirmar / Rechazar"
- Row expandida `stamp_failed`: card roja "Reintentar" · "Marcar como emitida manual" (escape hatch)
- Row expandida `pending` (cayó a humano por guardrail o org sin PAC): botón "Emitir con SF ahora" (visible solo si PAC conectado). Corre `emitirFacturaAuto()` bypassando guardrails — humano ya validó.

### 9.3 IntegrationsHub

Añadir tile "Solución Factible · Timbrado CFDI 4.0" al lado de QuickBooks / Google / Notion.

### 9.4 Endpoints nuevos

```
POST   /api/portal/[token]/invoicing/connect          # guarda credenciales + valida contra SF testing
POST   /api/portal/[token]/invoicing/csd/upload       # multipart, versiona
PATCH  /api/portal/[token]/invoicing/config           # límites, modo, toggle cancelación
DELETE /api/portal/[token]/invoicing/disconnect       # nulls provider + archives CSD
POST   /api/portal/[token]/factura-requests/[id]/stamp    # humano dispara emisión (bypass guardrails)
POST   /api/portal/[token]/factura-requests/[id]/mark-manual  # marca como emitida fuera del sistema
POST   /api/portal/[token]/cancellations/[id]/confirm
POST   /api/portal/[token]/cancellations/[id]/reject
GET    /api/portal/[token]/factura-requests/[id]/xml  # signed URL, TTL 5min
GET    /api/portal/[token]/factura-requests/[id]/pdf
```

Todos gated por `getAgentByToken` con auth de portal (owner + sub-users con módulo `oficina_facturas`).

## 10. Guardrails (detalle)

`src/lib/invoicing/guardrails.ts`:

```ts
export async function evaluateGuardrails(
  req: FacturaRequest,
  org: Organization,
  supabase: SupabaseClient
): Promise<GuardrailResult> {
  const limits = org.invoicing_limits;
  const reasons: string[] = [];

  if (req.total > limits.monto_max_mxn)
    reasons.push(`monto ${req.total} excede tope ${limits.monto_max_mxn}`);

  if (limits.blocked_uso_cfdi.includes(req.uso_cfdi))
    reasons.push(`uso CFDI ${req.uso_cfdi} bloqueado para auto`);

  if (limits.requires_prior_invoice) {
    const { count } = await supabase
      .from('factura_requests')
      .select('id', { count: 'exact', head: true })
      .eq('portal_email', org.portal_email)
      .eq('cliente_rfc', req.cliente_rfc)
      .eq('status', 'stamped');
    if ((count ?? 0) === 0)
      reasons.push(`RFC ${req.cliente_rfc} sin factura previa`);
  }

  if (limits.block_new_rfc_first_hours > 0) {
    const { data: firstSeen } = await supabase
      .from('factura_requests')
      .select('created_at')
      .eq('portal_email', org.portal_email)
      .eq('cliente_rfc', req.cliente_rfc)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstSeen && Date.now() - Date.parse(firstSeen.created_at) < limits.block_new_rfc_first_hours * 3600 * 1000)
      reasons.push(`RFC nuevo (< ${limits.block_new_rfc_first_hours}h desde primer contacto)`);
  }

  // Rate limits
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count: perHour } = await supabase
    .from('factura_requests')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', org.portal_email)
    .eq('cliente_rfc', req.cliente_rfc)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', hourAgo);
  if ((perHour ?? 0) >= limits.max_stamps_per_hour_per_rfc)
    reasons.push(`rate limit: ${perHour} CFDI ya emitidos a este RFC en la última hora`);

  const dayAgo = new Date(Date.now() - 86400 * 1000).toISOString();
  const { count: perDay } = await supabase
    .from('factura_requests')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', org.portal_email)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', dayAgo);
  if ((perDay ?? 0) >= limits.max_stamps_per_day)
    reasons.push(`rate limit diario: ${perDay} CFDI ya emitidos hoy`);

  return { pass: reasons.length === 0, reasons };
}
```

## 11. Migración y rollback

### 11.1 Rollout (cero downtime)

1. Deploy código + migrations (todas nullable) — sin cambio para orgs existentes (todas siguen `invoicing_provider IS NULL` = humano).
2. AC Proyectos conecta SF desde su portal en **modo Pruebas**. Prueba 1-2 semanas con RFCs de prueba SAT.
3. AC cambia toggle a **Producción**. Primer CFDI real.
4. Cliente 2 conecta desde su portal sin cambios de código.

### 11.2 Rollback

- **Nivel org:** botón "Desconectar" en portal → `invoicing_provider=null` → siguiente `solicitar_factura` va a humano. Sin redeploy.
- **Nivel plataforma:** env var `INVOICING_DISABLED=true` → `resolveInvoicingPath()` retorna `'human'` sin importar org. Deploy 2 min.

## 12. Testing

### 12.1 Unit (vitest)

- `xml-builder.test.ts` — arma XML CFDI 4.0 desde fixture, valida contra XSD SAT en `fixtures/cfdi-v4.xsd`
- `signer.test.ts` — firma y verifica sello con CSD de prueba SAT (público)
- `guardrails.test.ts` — cada regla en aislamiento
- `csd-vault.test.ts` — round-trip encrypt/decrypt + validación par cer/key
- `error-mapping.test.ts` — códigos SF → retryable/no

### 12.2 Integración contra sandbox SF

`solucion-factible.integration.test.ts` — gated por env var `SF_INTEGRATION_TESTS=true` para no consumir quota en cada push. Casos:

- Timbrar happy path (RFC XAXX010101000)
- Timbrar con XML malformado → error 301
- Auth fail → error 601
- Cancelar motivo 01 con sustituto
- Cancelar motivo 02 + poll status hasta accepted/rejected

### 12.3 E2E manual — `docs/qa/invoicing-e2e.md`

- AC conecta SF → sube CSD sandbox → prueba voz "quiero factura por 5000" → verifica UUID + XML descargable
- Solicitud sobre umbral → cae a humano → humano aprueba → se timbra
- Toggle On → solicitud cancelación por voz → humano confirma → poll cron → accepted
- Desconectar → siguiente llamada vuelve a "escalé al equipo"

## 13. Observabilidad y auditoría

- Todo timbrado y cancelación se logea en `policy_audit_log` (existente) con `capability='cfdi_timbrado'` o `'cfdi_cancelacion'`
- Acceso al CSD (get, put, rotate) en `admin_access_log` (existente, para retención LFPDPPP)
- Métricas en `/admin/analytics`: widget nuevo "Facturación" — CFDI emitidos hoy/semana/mes, tasa de éxito, top 5 orgs por volumen
- Alertas email a `alerts@centinelia.mx` cuando:
  - Credenciales SF de una org quedan inválidas (error 601 persistente)
  - CSD de una org expira en < 7 días
  - Rate de `stamp_failed` > 10% en 1h para cualquier org

## 14. Actualización de memoria post-implementación

- `project-centinelia-no-timbra` → regla condicional: "Centinelia timbra si org tiene PAC conectado. Sin conexión, escala a humano."
- `project-centinelia-ac-proyectos-pilot` → SF integrado ✓
- Nueva `project-solucion-factible-integration` → endpoints, error codes mapping, run book operacional

## 15. Fuera de scope (deuda diferida)

- Otros PACs (Facturama, CONTPAQ) — la interface soporta, pero solo SolucionFactibleProvider al inicio
- Complementos CFDI (Nómina, Pagos, Comercio Exterior) — solo `Ingreso` en v1
- Factura global (venta al público en general) — v1 solo factura nominativa
- Notas de crédito (`cancelarPorNotaCredito`) — v2, requiere UI + flujo distinto
- Timbrado desde admin (`/admin/facturacion`) — v1 solo desde agente + portal cliente
- Multi-CSD por org (holding con varias razones sociales) — v2

## 16. Estimación de esfuerzo

Aproximado, para dimensionar (no compromiso de fecha):

| Bloque | Esfuerzo |
|---|---|
| Módulos `invoicing/` (provider, xml-builder, signer, soap-client) | 3-4 días |
| CSD vault + cifrado + upload | 1 día |
| Migrations DB + refactor solicitarFactura | 1 día |
| Guardrails + emitirFacturaAuto orquestador | 1 día |
| UI integración portal + endpoints | 2 días |
| UI /oficina/facturas rediseño (estados + cancelación) | 1-2 días |
| Cancelación tool + cron poll + retry stamping | 1-2 días |
| PDF builder CFDI | 1 día |
| Tests unit + integración + E2E manual | 2-3 días |
| **Total** | **~13-18 días de trabajo enfocado** |
