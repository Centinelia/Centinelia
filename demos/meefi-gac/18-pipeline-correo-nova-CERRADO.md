# Pipeline correo Nova — brecha cerrada 2026-09-03

## Qué cambió

Cuatro cambios coordinados en el pipeline inbound de correo permiten que **Nova (y cualquier meerkat con `create_file` / `create_document` en su preset email) responda al remitente con archivos generados adjuntos**. Antes de esto, los files quedaban en Storage pero nunca llegaban al remitente cuando el correo entraba por webhook (path Meefi Demo).

### 1. `ReplyParams.attachments` opcional
- `src/lib/connectors/types.ts` — nuevo tipo `ReplyAttachment { filename, content: Buffer, mimeType }`.
- `src/lib/connectors/index.ts` — exportado.

### 2. Gmail multipart
- `src/lib/connectors/google.ts` — `sendReply` arma multipart/mixed RFC 2046 cuando hay attachments. Boundary aleatorio, base64 wrap a 76 chars (RFC 2045 5.9.2), sanitización de filename. Sin attachments mantiene el path text/plain simple.

### 3. Microsoft Graph — TODO documentado
- `src/lib/connectors/microsoft.ts` — Graph `reply` no acepta attachments en el POST; requiere `createReply → POST attachments → send`. Por ahora loguea warning + envía body sin adjunto. Cerrar cuando algún piloto Outlook lo necesite.

### 4. Webhook `sendReplyFn` fallback
- `src/app/api/email/inbound/route.ts` — cuando el correo llega vía webhook al portal (path `resolveInboxToken`), construye un `sendReplyFn` con `sendEmail` de Resend usando `agentBrandedFrom` (respeta dominio verificado del cliente) + soporta attachments. Trae `trust_stage / features / email_from / email_domain_verified / approval_email / auto_mode` del agent + `auto_mode_disabled_at / knowledge_base` del org, resuelve `autoMode` con `resolveAutoMode` — antes se llamaba a `processInboxEmail` sin `sendReplyFn` ni `autoMode`, así que **nunca contestaba automáticamente por el webhook path**.

### 5. Captura de files generados en inbox-processor
- `src/lib/ops/inbox-processor.ts`:
  - `sendReplyFn` signature ahora acepta `attachments?: ReplyAttachment[]`.
  - Array `generatedFiles` acumula outputs de `create_file` / `create_document` durante el loop de tools (leyendo `file_id`, `filename`, `mime_type` del resultado).
  - Helper `loadGeneratedAttachments()` descarga cada file desde bucket `agent-documents` como Buffer y arma `ReplyAttachment[]`.
  - Los 2 sends (`info_requested`, `auto_replied`) ahora pasan attachments al `sendReplyFn`.

## Direcciones de inbox listas para probar

**Portal-shared** (correo al primer meerkat con role — típicamente Nara):
- Meefi: `57ac8df75a4a@inbox.centinelia.mx`
- GAC: `0a58aea47f2f@inbox.centinelia.mx`

**Per-agent** (correo va directo al meerkat específico):

| Ambiente | Meerkat | Dirección |
|---|---|---|
| Meefi | Nara | `5381eb16a995@inbox.centinelia.mx` |
| Meefi | Niva | `ec20dea37ef8@inbox.centinelia.mx` |
| Meefi | Nova | `0118d51e2743@inbox.centinelia.mx` |
| GAC | Nara | `69dc14b04d88@inbox.centinelia.mx` |
| GAC | Nala | `47f7b62740a2@inbox.centinelia.mx` |
| GAC | Niva | `91067c1432ad@inbox.centinelia.mx` |

## Requisitos de config (verificar antes del demo)

- `RESEND_API_KEY` seteado (ya está — Resend outbound funciona en otros flujos).
- `EMAIL_INBOUND_SECRET` seteado (ya está — usado por incident/handoff/agent reply paths).
- `EMAIL_INBOX_DOMAIN=inbox.centinelia.mx` (default en código).
- MX record en `inbox.centinelia.mx` apunta a Resend/SendGrid Inbound Parse — ya configurado en prod (otros flujos ya reciben correos).
- Auto Mode Classifier no deshabilitado: `AUTO_MODE_CLASSIFIER_ENABLED != 'false'`.
- `organizations.auto_mode_disabled_at` NULL en Meefi Demo + GAC Demo (verificado).

## Test E2E manual (Nazre puede correr)

Enviar un correo desde tu Gmail personal a la dirección per-agent de Nova con adjunto de statement CSV + prompt de análisis:

```
Para: 0118d51e2743@inbox.centinelia.mx
Asunto: Statement JP Morgan 14-sept — reconciliar por favor
Cuerpo:
  Nova, adjunto el statement diario de JPMC del 14-sept.
  Procesa y devuelve la reconciliación contra ledger interno.
  Necesito el consolidado por operación + breaks flagged en Excel.
Adjunto: statement.csv (o el que sea)
```

Comportamiento esperado:
1. Webhook recibe → resuelve token → identifica Nova como opsAgent (via role o first).
2. `processInboxEmail` ejecuta LLM Haiku con tools de Nova.
3. LLM ve el CSV en attachments, invoca `create_file` con format=excel + sheets estructurados.
4. `create_file` genera XLSX, lo sube a Storage, retorna `file_id`.
5. `generatedFiles` captura el path.
6. LLM emite draft final con `action_required=true`, `category='otro'`.
7. Classifier autoMode='auto' decide send (o pending según señales).
8. Si send: `sendReplyFn(body, [xlsx])` → Resend envía correo al remitente original con Excel adjunto.
9. En tu Gmail personal llega el reply con adjunto.

## Verificaciones a hacer en prod post-deploy

- SQL de sanidad: `SELECT * FROM outbound_emails WHERE provider='auto_reply' AND to_email='nazre20@gmail.com' ORDER BY created_at DESC LIMIT 5;` — debe aparecer el reply auto-generado.
- SQL: `SELECT * FROM ops_documents WHERE agent_id='97c6831e-ff79-44fb-8830-dfcb1f1cc672' ORDER BY created_at DESC LIMIT 5;` — debe aparecer el Excel generado.
- `SELECT * FROM llm_call_log WHERE source='inbox_processor_summary' AND agent_id='97c6831e-ff79-44fb-8830-dfcb1f1cc672' ORDER BY created_at DESC LIMIT 3;` — meta debe mostrar `tools_invoked` incluye `create_file`.

## Estado del código

- tsc verde (`npx tsc --noEmit` exit=0, 0 líneas).
- Cambios sin commit — pendientes de review. Recomiendo split en 2 commits:
  1. `feat(email-inbound): sendReplyFn acepta attachments + Gmail multipart` (types.ts + google.ts + microsoft.ts + inbox-processor.ts signature)
  2. `feat(email-inbound): webhook fallback sendReplyFn + capture files` (route.ts + inbox-processor.ts capture logic)

## Alcance NO cubierto (deuda futura)

- Microsoft Graph attachments (Outlook path) — dejar TODO hasta primer piloto Outlook con Nova/Niva.
- Retry logic si `sendReplyFn` falla — actualmente cae al fallback approvalEmail (comportamiento pre-existente).
- Rate limit en sendEmail Resend con attachments grandes — Resend tiene límite 40MB por email; los files generados por `create_file` típicos son <2MB así que OK.
