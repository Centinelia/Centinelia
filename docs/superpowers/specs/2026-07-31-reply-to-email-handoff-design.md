# Reply-to-Email para Human Handoff — Diseño

**Fecha:** 2026-07-31
**Estado:** Diseño aprobado, pendiente plan de implementación
**Sesión origen:** post-sesión 46 (human-handoff MVP shipped, gap identificado en piloto Sofía)

## Motivación

El MVP de human-handoff (spec `2026-07-30-human-handoff-design.md`) shipeó solo el response vía portal. En el piloto real con Sofía se observó UX rota: cuando el agente escala pidiendo info, la única vía de respuesta es abrir portal + llenar form. El instinto natural del humano es responder al correo — reply-to-email es la UX natural, portal es fricción.

El spec original declaró response híbrido (portal + reply). Esta implementación cierra la mitad faltante.

Aprovechamos para fusionar el path legacy `escalate_to_approver` con el nuevo `pedir_a_humano`: hoy el modelo tiene dos maneras de escalar al humano y el prompt le pide "prefiere una sobre la otra". Eliminar la ambigüedad reduce errores del modelo y garantiza que reply-to-email funcione en TODOS los escalamientos.

## Alcance

**In scope:**
- Reply-to-email para `human_requests` con `source_channel = 'email'`
- Adjuntos con paridad al flujo portal (bucket compartido, límite 10MB)
- Parser custom para separar respuesta nueva de historial citado (Gmail/Outlook/Apple Mail, español + inglés)
- Auto-reply cortés cuando la request ya no está en estado receptivo
- Detección de auto-replies entrantes (out-of-office, mailer-daemon) para evitar loops
- Fusión de `escalate_to_approver` → `pedir_a_humano` en `inbox-processor.ts`

**Out of scope (fase 2):**
- Reply-to-email para `source_channel !== 'email'` (voice, chat) — el resume tampoco lo soporta hoy
- Confirmación al humano cuando su reply se procesa OK
- Reabrir una request `responded/cancelled/timeout` con un reply tardío
- Editar la respuesta después de enviada

## Data model

### Migración

```sql
-- Column reply_token ya existe (agregada en sesión previa de exploración).
-- Solo necesitamos el index y las columnas de audit.

CREATE INDEX IF NOT EXISTS idx_human_requests_reply_token
  ON human_requests (reply_token) WHERE reply_token IS NOT NULL;

ALTER TABLE human_requests ADD COLUMN IF NOT EXISTS response_source TEXT;
  -- 'portal' | 'email'
ALTER TABLE human_requests ADD COLUMN IF NOT EXISTS responded_by_email TEXT;
  -- audit: qué address envió el reply (puede diferir de target_email si hubo forward)
```

### Token

- Generado con `crypto.randomBytes(8).toString('hex')` = 16 hex chars (2^64 espacio).
- Asignado lazy en `dispatchHumanRequestNotification` si no existe. Idempotente.
- UNIQUE constraint garantiza no colisión.
- Vive solo en el correo enviado y en DB. No requiere firma HMAC extra: posesión = auth.

## Flujo end-to-end

### Outbound (envío del email con Reply-To)

En `src/lib/human-handoff/notify.ts`, las 3 funciones (`dispatchHumanRequestNotification`, `sendReminderNotification`, `sendEscalationNotification`):

```ts
// Generar reply_token si no existe (idempotente en re-notificaciones)
let replyToken = request.reply_token;
if (!replyToken) {
  replyToken = crypto.randomBytes(8).toString('hex');
  await supabase.from('human_requests')
    .update({ reply_token: replyToken })
    .eq('id', requestId);
  request.reply_token = replyToken;
}

const replyToAddress = `${replyToken}@${process.env.EMAIL_INBOX_DOMAIN}`;

await sendEmail({
  to,
  subject,
  html,
  headers: { 'Reply-To': replyToAddress },  // extensión requerida a sendEmail
});
```

`sendEmail` (`src/lib/email/send.ts`) debe extenderse para aceptar un `headers?: Record<string, string>` opcional y pasárselo a Resend/proveedor.

### Inbound (recepción en /api/email/inbound)

Extender `src/app/api/email/inbound/route.ts`. Nuevo orden de resolución después de `parseToToken`:

1. `resolveHumanRequestFromToken(token)` → si match → handoff handler (NUEVO)
2. `resolveAgentFromToken(token)` → si match → agente handler (existente)
3. `resolveInboxToken(token)` → si match → portal inbox handler (existente)
4. Sin match → 200 OK, ignore

**El discriminador es la longitud:** agent tokens y inbox tokens son 12 chars, reply tokens son 16 chars. `resolveHumanRequestFromToken` hace early exit si `token.length !== 16` — cero riesgo de colisión.

### Nuevo helper en `src/lib/email/inbox.ts`

```ts
export async function resolveHumanRequestFromToken(token: string): Promise<{
  id: string;
  status: string;
  agent_id: string;
  target_email: string;
  title: string;
} | null> {
  if (token.length !== 16) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('human_requests')
    .select('id, status, agent_id, target_email, title')
    .eq('reply_token', token)
    .maybeSingle();
  return data;
}
```

### Nuevo módulo `src/lib/human-handoff/inbound.ts`

```ts
export async function processHandoffReply(opts: {
  request: { id: string; status: string; agent_id: string; target_email: string; title: string };
  from: string;
  subject: string;
  text: string;
  attachments: StoredAttachment[];  // ya subidos al storage por el endpoint
}): Promise<void>
```

Lógica:

1. **Auto-reply detection (early exit):** si `from` matchea `/mailer-daemon|postmaster|no-?reply/i` o `subject` empieza con `Automatic reply|Auto-Reply|Out of office|Fuera de la oficina|Autoresponder`, log y return. No update.

2. **Guard de estado:** si `request.status !∈ {pending, escalated}`, enviar auto-reply "stale" (ver §Auto-reply) y return.

3. **Parsear body:** `const { cleanText, hadQuotedContent } = parseReplyBody(text)`. Si `cleanText.trim() === ''`, fallback a `text.trim()`.

4. **UPDATE `human_requests`:**
   ```ts
   {
     status: 'responded',
     response_text: cleanText,
     response_files: attachments,
     response_source: 'email',
     responded_at: now(),
     responded_by_email: from,  // address completo, ej "Juan <juan@empresa.com>"
   }
   ```

5. **Trigger resume:** `resumeAgentAfterHumanResponse(request.id).catch(err => console.error(...))` — non-blocking (mismo patrón que `processInboxEmail` en el route existente).

### Adjuntos

Reusar el bucket `human-request-files` (mismo que `respond/route.ts` Task 5 del spec original). Path: `${agent_id}/${request.id}/${timestamp}-${safeName}`. Skip files >10MB. Sanitize filename con `/[^a-zA-Z0-9._-]/g → _`. Signed URL en el array `response_files`.

## Fusión legacy `escalate_to_approver` → `pedir_a_humano`

### Cambios en `src/lib/ops/inbox-processor.ts`

1. **Schema output del modelo:** quitar `escalate_to_approver` del JSON schema en el prompt y del `validateProcessedEmail`. `needs_info` queda pero solo se refiere al remitente (nunca al equipo interno).

2. **Prompt (líneas 402-411 actuales):** reemplazar por:
   ```
   Si necesitas algo del equipo humano (info, acción, o aprobación): usa la tool
   pedir_a_humano. El humano recibe form con opción de subir archivos y responder
   por correo. El flujo se auto-completa cuando responde.

   Si necesitas info del remitente mismo (datos de su empresa que solo él conoce):
   pon "needs_info": true + redacta la request en "request_to_sender".

   Si puedes responder con info verificada por herramientas: pon "needs_info": false.
   ```

3. **Branch `finalStatus === 'escalated'`** (línea 723): eliminar. Ya no llega ahí desde el modelo.

4. **`ops_inbox.status = 'escalated'`:** deprecar el valor. Items nuevos que antes iban ahí ahora crean `human_request` y `ops_inbox` queda `pending` (esperando resume).

5. **`escalationEmailHtml` en `src/lib/ops/approval-email.ts`:** borrar la función. Ya no la llama nadie.

6. **Backfill:** items históricos con `status='escalated'` sin `human_request` asociada → dejar como están.

**NO fusionamos `approvalEmailHtml`:** es un flujo diferente (revisión de borradores con botones aprobar/rechazar one-click), no compite con pedir_a_humano.

## Parser del body

Nuevo módulo `src/lib/human-handoff/parse-reply.ts`:

```ts
export function parseReplyBody(text: string): {
  cleanText: string;
  hadQuotedContent: boolean;
}
```

**Separadores (regex, case-insensitive, multiline) — corta en el primer match:**

1. `/^El .+, .+ escribió:\s*$/m` — Gmail español
2. `/^On .+, .+ wrote:\s*$/m` — Gmail inglés
3. `/^-----Original Message-----\s*$/m` — Outlook
4. `/^_{5,}$/m` seguido de `/^From: /m` — Outlook variante
5. `/^From: .+\nSent: /m` — Outlook variante inline

**Post-strip:**
- Trim líneas `^>` prefijadas
- Trim firma `/^--\s*$/m` y todo lo que sigue
- Trim firma móvil `/^Enviado desde mi .+$/m` y `/^Sent from my .+$/m`
- Colapsar 3+ line breaks a 2
- `text.trim()`

**Fallback seguro:** si `cleanText === ''`, devolver `{ cleanText: text.trim(), hadQuotedContent: false }`. Mejor mostrar el hilo entero que perder la respuesta.

**Test corpus:** `src/lib/human-handoff/__tests__/parse-reply/*.txt` con 8-10 samples reales (Gmail ES/EN, Outlook ES/EN, Apple Mail, respuesta vacía, solo firma, solo quote, auto-reply). Cada `input.txt` con su `expected.json`. Golden test suite.

## Auto-reply "solicitud ya procesada"

Nuevo módulo `src/lib/human-handoff/auto-reply.ts`:

```ts
export function buildStaleReplyHtml(opts: {
  agentName: string;
  requestTitle: string;
  status: 'responded' | 'cancelled' | 'timeout';
  respondedAt: Date;
  portalUrl: string;
}): string
```

Mensaje corto, mismo estilo visual que `buildRequestEmailHtml` (paleta `#6C3BFF` acento, `#FAFBFF` fondo):

> **[agentName] — Solicitud ya procesada**
>
> Gracias por responder. Esta solicitud ya fue [respondida por otro miembro / cancelada / cerrada por tiempo agotado] el [fecha].
>
> Si necesitas dar seguimiento, entra al portal.
>
> [Botón: Ver en el portal]

**Headers RFC 3834 para prevenir loops:**
- `Auto-Submitted: auto-replied`
- `X-Auto-Response-Suppress: All`

## Seguridad

**Modelo de auth:** posesión del token = autorización. 16 hex chars = 2^64, no enumerable. Token vive solo en correo enviado + DB.

**Rate limiting natural:** el guard de estado hace de rate limit. Una vez `responded`, cualquier reply cae en auto-reply "stale".

**Sender validation — no validamos `from`:** el token es la fuente de verdad.
- Reply desde alias distinto (personal vs trabajo) → OK
- Forward a colega + colega responde → OK (extensión intencional de confianza)
- Attacker con URL scraping → imposible (2^64)
- Reply-all a correo interceptado → no expone datos hacia atrás
- Se loguea `responded_by_email` para audit post-hoc

**Endpoint auth:** `?secret=EMAIL_INBOUND_SECRET` existente, sin cambios.

**Attachments:** skip >10MB, sanitize filename, bucket con RLS existente, no ejecutamos ni parseamos contenido.

**Auto-reply loop prevention:** headers `Auto-Submitted` y `X-Auto-Response-Suppress` en nuestro auto-reply. Detección de auto-replies entrantes en `processHandoffReply` §1.

## Rollout

**Fase 0 — merge dark (sin efecto usuario):**
- Migración SQL (index + columnas audit)
- Parser + test suite
- Módulos `inbound.ts`, `auto-reply.ts`, `parse-reply.ts` creados pero no invocados
- `resolveHumanRequestFromToken` en `inbox.ts`

**Fase 1 — inbound activo, outbound gated:**
- Extender `/api/email/inbound/route.ts` con nuevo orden de resolución
- Extender `sendEmail` para aceptar `headers?` opcionales
- Reply-To en `notify.ts` gated por `HANDOFF_REPLY_EMAIL_ENABLED=false` default
- Deploy. Ningún reply llega todavía (nadie tiene token).

**Fase 2 — piloto Sofía:**
- Set `HANDOFF_REPLY_EMAIL_ENABLED=true` en production
- Test manual end-to-end: mandar correo real al inbox de Sofía que la fuerce a llamar `pedir_a_humano` (ej. cliente pidiendo info que no está en el KB) → Nazre recibe el correo → responde con Reply → verificar en logs que el reply parsea, `status='responded'` con `response_source='email'`, y el resume dispara → agente responde al cliente
- Verificar auto-reply "stale": mandar segundo reply después → debe llegar el correo "solicitud ya procesada"
- 24-48h monitoreo

**Fase 3 — fusión legacy → nuevo (independiente pero atada al release):**
- Cambios en `inbox-processor.ts`: quitar `escalate_to_approver`, borrar branch escalated, borrar `escalationEmailHtml`
- Deploy y monitorear que no aparezcan errores en logs de inbox-processor

**Fase 4 — cleanup:**
- Quitar flag `HANDOFF_REPLY_EMAIL_ENABLED` (siempre on)
- Actualizar memoria interna con la decisión

## Env vars

**Nuevas temporales:**
- `HANDOFF_REPLY_EMAIL_ENABLED=true|false` — flag de rollout, se retira en Fase 4

**Existentes reutilizadas:**
- `EMAIL_INBOX_DOMAIN` — dominio del Reply-To
- `EMAIL_INBOUND_SECRET` — auth del endpoint
- `NEXT_PUBLIC_APP_URL` — base URL para el portal link del auto-reply

## Archivos afectados

**Nuevos:**
- `src/lib/human-handoff/inbound.ts` — handler del reply
- `src/lib/human-handoff/auto-reply.ts` — template stale reply
- `src/lib/human-handoff/parse-reply.ts` — parser + tests
- `src/lib/human-handoff/__tests__/parse-reply/` — corpus golden

**Modificados:**
- `src/lib/email/inbox.ts` — añadir `resolveHumanRequestFromToken`
- `src/lib/email/send.ts` — aceptar `headers?` opcional
- `src/lib/human-handoff/notify.ts` — Reply-To en 3 funciones + reply_token lazy assignment
- `src/app/api/email/inbound/route.ts` — nuevo orden de resolución, handler nuevo
- `src/lib/ops/inbox-processor.ts` — quitar escalate_to_approver, borrar branch escalated
- `src/lib/ops/approval-email.ts` — borrar `escalationEmailHtml`

**SQL:**
- Migración con `CREATE INDEX IF NOT EXISTS` + 2 `ADD COLUMN IF NOT EXISTS` para audit

## Métricas post-launch a monitorear

- % de replies vía email vs portal (via `response_source`)
- Auto-replies falsos positivos (parser guardó `cleanText === ''`)
- Auto-replies "stale" enviados (indicador de UX: humanos respondiendo tarde)
- Errores en `processHandoffReply` (logs)

## No-goals explícitos

- No implementamos reply-to-email para voice/chat (`source_channel !== 'email'`) — el resume tampoco lo soporta hoy
- No notificamos al humano cuando su reply se procesa OK
- No reabrimos requests responded/cancelled/timeout desde un reply tardío
- No permitimos edición del reply después de enviado (humano manda uno nuevo → cae en auto-reply)
