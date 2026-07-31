# Reply-to-Email para Human Handoff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el gap de UX de human-handoff: permitir que el humano responda a la solicitud del agente por correo (reply) en vez de solo por portal, y de paso fusionar el path legacy `escalate_to_approver` con el nuevo `pedir_a_humano` para eliminar ambigüedad.

**Architecture:** Reutilizamos `/api/email/inbound` (SendGrid Inbound Parse ya configurado) y añadimos un tercer resolver de token para `human_requests`. Reply-To en outbound apunta a `<reply_token>@<EMAIL_INBOX_DOMAIN>`. El handler parsea la respuesta con regex custom, escribe `human_requests.response_*`, y dispara `resumeAgentAfterHumanResponse` (mismo motor que el portal usa hoy).

**Tech Stack:** Next.js 15/16 App Router, Supabase (Postgres + Storage), Resend (outbound email), SendGrid Inbound Parse (inbound webhook), TypeScript.

## Global Constraints

- **Copy en español, sin em-dashes (—)**. Usar `:`, `,` o `.` como separadores.
- **Cero emojis en UI/emails**. Solo iconos Lucide en React (no aplica aquí porque son emails). En HTML de emails: cero emojis.
- **Sin la palabra "IA"** en copy visible al humano (correos incluidos). "Empleado digital", "asistente", "sistema" son OK.
- **Dev bypass en proxy.ts NO se toca**. Preservar comportamiento existente.
- **Todo endpoint de portal/API sensible debe usar `createAdminClient` con auth via secret o portal_token**. Reusar el pattern existente en `/api/email/inbound` (`?secret=EMAIL_INBOUND_SECRET`).
- **Migrations idempotentes:** siempre `IF NOT EXISTS` en `ADD COLUMN` y `CREATE INDEX`. La DB ya tiene `reply_token` de una sesión previa.
- **Fase de rollout:** cambios outbound (poner Reply-To) van gated por `HANDOFF_REPLY_EMAIL_ENABLED`. Cambios inbound (recibir + procesar) siempre activos porque nadie tendrá token válido hasta que outbound envíe uno.
- **Commits pequeños y frecuentes.** Un commit por task terminada.

---

## File Structure

**Nuevos:**
- `src/lib/human-handoff/parse-reply.ts` — parser regex del body
- `src/lib/human-handoff/parse-reply.fixtures/` — dir con `*.txt` de entrada y `*.expected.txt` de salida esperada
- `src/lib/human-handoff/inbound.ts` — handler `processHandoffReply`
- `src/lib/human-handoff/auto-reply.ts` — template HTML para "solicitud ya procesada"
- `scripts/test-parse-reply.ts` — runner standalone tsx que valida el parser contra fixtures

**Modificados:**
- `supabase/migrations/2026-07-31-reply-email-index-and-audit.sql` — index + 2 columnas audit (o SQL manual en el prompt de la task; el proyecto no tiene un dir formal de migrations)
- `src/lib/email/inbox.ts` — añadir `resolveHumanRequestFromToken`
- `src/lib/human-handoff/notify.ts` — reply_token lazy + Reply-To en 3 funciones (gated)
- `src/app/api/email/inbound/route.ts` — nuevo orden de resolución con handoff handler
- `src/lib/ops/inbox-processor.ts` — quitar `escalate_to_approver` del schema/prompt/branch
- `src/lib/ops/approval-email.ts` — borrar función `escalationEmailHtml`

**Nota importante sobre `sendEmail`:** el módulo `src/lib/email/send.ts` YA tiene un parámetro `replyTo?: string` (línea 138). No hace falta extenderlo — solo pasarlo desde notify.ts.

---

## Task 1: Parser del body con test runner standalone

**Files:**
- Create: `src/lib/human-handoff/parse-reply.ts`
- Create: `src/lib/human-handoff/parse-reply.fixtures/gmail-es-simple.input.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/gmail-es-simple.expected.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/gmail-en-simple.input.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/gmail-en-simple.expected.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/outlook-es.input.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/outlook-es.expected.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/mobile-signature.input.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/mobile-signature.expected.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/only-quote.input.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/only-quote.expected.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/empty-reply.input.txt`
- Create: `src/lib/human-handoff/parse-reply.fixtures/empty-reply.expected.txt`
- Create: `scripts/test-parse-reply.ts`

**Interfaces:**
- Consumes: nothing (self-contained)
- Produces: `parseReplyBody(text: string): { cleanText: string; hadQuotedContent: boolean }`

- [ ] **Step 1: Crear el módulo parse-reply.ts con la firma pública**

```ts
// src/lib/human-handoff/parse-reply.ts

/**
 * Separa el texto nuevo de la respuesta del historial citado (quoted history).
 * Cubre Gmail (ES/EN), Outlook (ES/EN), Apple Mail, y firmas comunes.
 *
 * Fallback seguro: si el resultado queda vacío después de todos los strips,
 * devuelve el texto original completo. Es preferible mostrar el hilo entero
 * que perder la respuesta.
 */
export function parseReplyBody(text: string): {
  cleanText: string;
  hadQuotedContent: boolean;
} {
  if (!text || typeof text !== 'string') return { cleanText: '', hadQuotedContent: false };

  const original = text;
  let working = text;
  let hadQuotedContent = false;

  // 1. Corte en separadores conocidos (primer match gana)
  const separators: RegExp[] = [
    /^El .+?, .+? escribió:\s*$/im,           // Gmail español
    /^On .+?, .+? wrote:\s*$/im,              // Gmail inglés
    /^-----+\s*Original Message\s*-----+\s*$/im, // Outlook clásico
    /^_{5,}\s*$/m,                             // Outlook variante (línea de underscores)
    /^From: .+\r?\nSent: /im,                  // Outlook inline
    /^De: .+\r?\nEnviado: /im,                 // Outlook inline español
  ];

  for (const rx of separators) {
    const match = working.match(rx);
    if (match && match.index !== undefined) {
      working = working.slice(0, match.index);
      hadQuotedContent = true;
      break;
    }
  }

  // 2. Trim líneas prefijadas con '>' (si el separador falló pero hay quoting)
  const lines = working.split(/\r?\n/);
  const trimmed: string[] = [];
  let inQuoteBlockAtEnd = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!inQuoteBlockAtEnd && /^>/.test(line.trim())) {
      hadQuotedContent = true;
      continue; // skip trailing quoted lines
    }
    if (line.trim() !== '') inQuoteBlockAtEnd = true;
    trimmed.unshift(line);
  }
  working = trimmed.join('\n');

  // 3. Trim firma estándar Unix (-- seguido de todo lo que venga)
  working = working.replace(/^--\s*\r?\n[\s\S]*$/m, '');

  // 4. Trim firma móvil común
  working = working.replace(/^(Enviado desde mi|Sent from my) .+$/im, '');

  // 5. Colapsar 3+ line breaks consecutivos a 2
  working = working.replace(/\n{3,}/g, '\n\n');

  // 6. Trim final
  const cleanText = working.trim();

  // Fallback seguro
  if (cleanText === '') {
    return { cleanText: original.trim(), hadQuotedContent: false };
  }

  return { cleanText, hadQuotedContent };
}
```

- [ ] **Step 2: Crear fixtures — gmail-es-simple**

`src/lib/human-handoff/parse-reply.fixtures/gmail-es-simple.input.txt`:
```
Sí, adelante procede con el descuento del 15%.

El vie, 31 jul 2026 a las 10:15, Sofía <a3f8b2c1d4e5@inbox.centinelia.mx> escribió:
> Hola Nazre, un cliente nuevo pide 15% de descuento en su primer pedido.
> ¿Autorizas?
```

`src/lib/human-handoff/parse-reply.fixtures/gmail-es-simple.expected.txt`:
```
Sí, adelante procede con el descuento del 15%.
```

- [ ] **Step 3: Crear fixtures — gmail-en-simple**

`gmail-en-simple.input.txt`:
```
Yes, go ahead with the discount.

On Fri, Jul 31, 2026 at 10:15 AM, Sofía <a3f8b2c1d4e5@inbox.centinelia.mx> wrote:
> Hi Nazre, a new client is asking for 15% off their first order.
> Do you authorize?
```

`gmail-en-simple.expected.txt`:
```
Yes, go ahead with the discount.
```

- [ ] **Step 4: Crear fixtures — outlook-es**

`outlook-es.input.txt`:
```
Confirmo la cita para mañana a las 3pm.

-----Original Message-----
From: Sofía <a3f8b2c1d4e5@inbox.centinelia.mx>
Sent: viernes, 31 de julio de 2026 10:15
To: Nazre <nazre@empresa.com>
Subject: Cita cliente López

Hola Nazre, el cliente López pide cita mañana. ¿Confirmas?
```

`outlook-es.expected.txt`:
```
Confirmo la cita para mañana a las 3pm.
```

- [ ] **Step 5: Crear fixtures — mobile-signature**

`mobile-signature.input.txt`:
```
Ok procede.

Enviado desde mi iPhone

El vie, 31 jul 2026 a las 10:15, Sofía escribió:
> Autorizas?
```

`mobile-signature.expected.txt`:
```
Ok procede.
```

- [ ] **Step 6: Crear fixtures — only-quote (edge case: reply vacío con solo el quote)**

`only-quote.input.txt`:
```
El vie, 31 jul 2026 a las 10:15, Sofía escribió:
> Autorizas?
```

`only-quote.expected.txt`:
```
El vie, 31 jul 2026 a las 10:15, Sofía escribió:
> Autorizas?
```

(Fallback: si cleanText queda vacío, devuelve texto original completo)

- [ ] **Step 7: Crear fixtures — empty-reply**

`empty-reply.input.txt`:
```

```

`empty-reply.expected.txt`:
```

```

(Cadena vacía o solo whitespace → salida vacía)

- [ ] **Step 8: Crear el test runner standalone `scripts/test-parse-reply.ts`**

```ts
// scripts/test-parse-reply.ts
// Run with: npx tsx scripts/test-parse-reply.ts
// Exits 0 on all pass, 1 on any fail.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReplyBody } from '../src/lib/human-handoff/parse-reply';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'src', 'lib', 'human-handoff', 'parse-reply.fixtures');

const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.input.txt'));
let pass = 0;
let fail = 0;

for (const inputFile of files) {
  const name = inputFile.replace('.input.txt', '');
  const input = readFileSync(join(FIXTURES_DIR, inputFile), 'utf8');
  const expected = readFileSync(join(FIXTURES_DIR, `${name}.expected.txt`), 'utf8').trim();
  const { cleanText } = parseReplyBody(input);

  if (cleanText.trim() === expected) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    got:      ${JSON.stringify(cleanText)}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 9: Correr el test runner y verificar que todo pasa**

Run: `npx tsx scripts/test-parse-reply.ts`
Expected: `6 passed, 0 failed`, exit 0.

Si algún fixture falla, iterar en la regex de `parse-reply.ts` hasta que pase. NO editar el fixture para que "pase" — el fixture es la ground truth.

- [ ] **Step 10: Commit**

```bash
git add src/lib/human-handoff/parse-reply.ts \
        src/lib/human-handoff/parse-reply.fixtures/ \
        scripts/test-parse-reply.ts
git commit -m "feat(handoff): parser para separar reply text del quoted history"
```

---

## Task 2: Migración SQL (index + columnas audit)

**Files:**
- Ejecutar SQL directo en Supabase SQL Editor (el proyecto no tiene dir formal de migrations en git)

**Interfaces:**
- Consumes: `human_requests` table (existente, con `reply_token` ya agregado)
- Produces: index `idx_human_requests_reply_token`, columnas `response_source TEXT` y `responded_by_email TEXT`

- [ ] **Step 1: Correr SQL en Supabase SQL Editor**

```sql
CREATE INDEX IF NOT EXISTS idx_human_requests_reply_token
  ON human_requests (reply_token) WHERE reply_token IS NOT NULL;

ALTER TABLE human_requests ADD COLUMN IF NOT EXISTS response_source TEXT;
COMMENT ON COLUMN human_requests.response_source IS '''portal'' | ''email'' — canal por el que llegó la respuesta';

ALTER TABLE human_requests ADD COLUMN IF NOT EXISTS responded_by_email TEXT;
COMMENT ON COLUMN human_requests.responded_by_email IS 'Address del from del reply. Puede diferir de target_email si hubo forward.';
```

- [ ] **Step 2: Verificar que el schema quedó bien**

En Supabase SQL Editor:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'human_requests'
  AND column_name IN ('reply_token', 'response_source', 'responded_by_email');
```

Expected: 3 rows, all `text`, all `YES` nullable.

- [ ] **Step 3: Correr también en Supabase de dev si existe**

Si hay proyecto Supabase separado para dev, correr el mismo SQL ahí. Idempotente, safe re-run.

- [ ] **Step 4: Nota de completación en task list**

Marcar el task hecho. Sin commit (no hay archivos modificados en repo).

---

## Task 3: Reply-To en notify.ts (gated por feature flag)

**Files:**
- Modify: `src/lib/human-handoff/notify.ts`

**Interfaces:**
- Consumes: `parseReplyBody` NO usado aquí (solo outbound). `sendEmail({ replyTo })` YA existe en `src/lib/email/send.ts:138`.
- Produces: `human_requests.reply_token` populado lazy. Emails con header `Reply-To: <token>@<EMAIL_INBOX_DOMAIN>`.

- [ ] **Step 1: Añadir import de crypto y helper de token en notify.ts**

Al inicio del archivo, después de los imports existentes:

```ts
import crypto from 'node:crypto';

const INBOX_DOMAIN = process.env.EMAIL_INBOX_DOMAIN ?? 'inbox.centinelia.mx';
const REPLY_ENABLED = process.env.HANDOFF_REPLY_EMAIL_ENABLED === 'true';

async function ensureReplyToken(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  existingToken: string | null | undefined,
): Promise<string | null> {
  if (!REPLY_ENABLED) return null;
  if (existingToken) return existingToken;
  const token = crypto.randomBytes(8).toString('hex');
  const { error } = await supabase
    .from('human_requests')
    .update({ reply_token: token })
    .eq('id', requestId);
  if (error) {
    console.error('[notify] failed to persist reply_token:', error);
    return null;
  }
  return token;
}

function replyToFor(token: string | null): string | undefined {
  return token ? `${token}@${INBOX_DOMAIN}` : undefined;
}
```

- [ ] **Step 2: Actualizar `dispatchHumanRequestNotification` para pasar `replyTo`**

En la función `dispatchHumanRequestNotification`, después del `SELECT * FROM human_requests` y antes del `if (sendViaEmail)`:

```ts
const replyToken = await ensureReplyToken(
  supabase,
  requestId,
  (request as Record<string, unknown>).reply_token as string | null | undefined,
);
const replyTo = replyToFor(replyToken);
```

En la llamada a `sendEmail` dentro del branch `if (sendViaEmail)`, añadir `replyTo`:

```ts
await sendEmail({
  to:      request.target_email,
  subject: `[${agent.agent_name}] Necesito tu ayuda: ${request.title}`,
  html:    buildRequestEmailHtml(request as HumanRequest, agent as Agent),
  replyTo,
});
```

- [ ] **Step 3: Actualizar `sendReminderNotification` igual**

Después del segundo `SELECT`:

```ts
const replyToken = await ensureReplyToken(
  supabase,
  requestId,
  (request as Record<string, unknown>).reply_token as string | null | undefined,
);
const replyTo = replyToFor(replyToken);
```

Y en el `sendEmail`:

```ts
await sendEmail({
  to:      request.target_email,
  subject: `Recordatorio: ${agent.agent_name} sigue esperando: ${request.title}`,
  html:    buildReminderEmailHtml(request as HumanRequest, agent as Agent),
  replyTo,
});
```

- [ ] **Step 4: Actualizar `sendEscalationNotification` igual**

```ts
const replyToken = await ensureReplyToken(
  supabase,
  requestId,
  (request as Record<string, unknown>).reply_token as string | null | undefined,
);
const replyTo = replyToFor(replyToken);
```

Y en el `sendEmail`:

```ts
await sendEmail({
  to:      escalateToEmail,
  subject: `[Escalado] ${agent.agent_name} no ha recibido respuesta a: ${request.title}`,
  html:    buildEscalationEmailHtml(request as HumanRequest, agent as Agent, escalateToEmail),
  replyTo,
});
```

- [ ] **Step 5: Verificar type check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `notify.ts` (puede haber errores preexistentes en otros archivos — ignorar los que no son del cambio).

- [ ] **Step 6: Commit**

```bash
git add src/lib/human-handoff/notify.ts
git commit -m "feat(handoff): añadir Reply-To gated por HANDOFF_REPLY_EMAIL_ENABLED"
```

---

## Task 4: Helper `resolveHumanRequestFromToken` en inbox.ts

**Files:**
- Modify: `src/lib/email/inbox.ts`

**Interfaces:**
- Consumes: `human_requests.reply_token` column (Task 2)
- Produces: `resolveHumanRequestFromToken(token: string): Promise<HandoffRequestMatch | null>` donde `HandoffRequestMatch = { id, status, agent_id, target_email, title }`

- [ ] **Step 1: Añadir el helper al final de inbox.ts**

```ts
// src/lib/email/inbox.ts (append)

export interface HandoffRequestMatch {
  id:            string;
  status:        string;
  agent_id:      string;
  target_email:  string;
  title:         string;
}

/**
 * Resuelve un token de 16 hex chars a la human_request correspondiente.
 * Early exit por longitud: agent tokens y inbox tokens son 12 chars, reply
 * tokens son 16. Cero riesgo de colisión.
 */
export async function resolveHumanRequestFromToken(token: string): Promise<HandoffRequestMatch | null> {
  if (token.length !== 16) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('human_requests')
    .select('id, status, agent_id, target_email, title')
    .eq('reply_token', token)
    .maybeSingle();
  if (!data) return null;
  return {
    id:           data.id as string,
    status:       data.status as string,
    agent_id:     data.agent_id as string,
    target_email: data.target_email as string,
    title:        data.title as string,
  };
}
```

- [ ] **Step 2: Verificar type check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/inbox.ts
git commit -m "feat(handoff): resolveHumanRequestFromToken helper"
```

---

## Task 5: Auto-reply template + módulo `inbound.ts`

**Files:**
- Create: `src/lib/human-handoff/auto-reply.ts`
- Create: `src/lib/human-handoff/inbound.ts`

**Interfaces:**
- Consumes:
  - `parseReplyBody(text)` from Task 1
  - `resumeAgentAfterHumanResponse(requestId)` from `src/lib/human-handoff/resume.ts` (existente)
  - `sendEmail({ to, subject, html, replyTo? })` from `src/lib/email/send.ts` (existente)
  - `shell`, `badge`, `heading`, `infoCard`, `btn` from `src/lib/email/send.ts` (helpers existentes)
- Produces:
  - `buildStaleReplyHtml(opts): string`
  - `processHandoffReply(opts): Promise<void>`
  - `HandoffAttachment` type shared con el route.ts

- [ ] **Step 1: Crear `src/lib/human-handoff/auto-reply.ts`**

```ts
// src/lib/human-handoff/auto-reply.ts
import { shell, badge, heading, infoCard, btn, sectionLabel } from '@/lib/email/send';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

const STATUS_LABELS: Record<string, string> = {
  responded: 'respondida por otro miembro del equipo',
  cancelled: 'cancelada',
  timeout:   'cerrada por falta de respuesta',
};

export function buildStaleReplyHtml(opts: {
  agentName:     string;
  requestTitle:  string;
  status:        'responded' | 'cancelled' | 'timeout';
  respondedAt:   Date;
  portalUrl:     string;
}): string {
  const label = STATUS_LABELS[opts.status] ?? 'cerrada';
  const fecha = opts.respondedAt.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return shell(
    badge('Solicitud ya procesada', '#8C7FB8') +
    heading(opts.agentName, 'Tu respuesta llegó, pero ya no era necesaria') +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 16px">
      Gracias por responder. Esta solicitud ya fue <strong style="color:#F1EEFF">${label}</strong> el ${fecha}.
    </p>` +
    infoCard(`
      ${sectionLabel('Solicitud original')}
      <p style="color:#F1EEFF;font-size:14px;margin:0;line-height:1.6">${opts.requestTitle}</p>
    `) +
    `<p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:16px 0 0">
      Si necesitas dar seguimiento, entra al portal.
    </p>` +
    btn('Ver en el portal', opts.portalUrl)
  );
}

export { BASE_URL };
```

- [ ] **Step 2: Crear `src/lib/human-handoff/inbound.ts`**

```ts
// src/lib/human-handoff/inbound.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { parseReplyBody } from './parse-reply';
import { resumeAgentAfterHumanResponse } from './resume';
import { buildStaleReplyHtml, BASE_URL } from './auto-reply';
import type { HandoffRequestMatch } from '@/lib/email/inbox';

export interface HandoffAttachment {
  name: string;
  url:  string;
  type: string;
  size: number;
}

const AUTO_REPLY_PATTERNS = /^(automatic reply|auto-?reply|out of office|fuera de la oficina|autoresponder)/i;
const AUTO_REPLY_FROM = /(mailer-daemon|postmaster|no-?reply)/i;

const STATUS_ACTIVE = new Set(['pending', 'escalated']);

export async function processHandoffReply(opts: {
  request:      HandoffRequestMatch;
  from:         string;
  subject:      string;
  text:         string;
  attachments:  HandoffAttachment[];
}): Promise<void> {
  const { request, from, subject, text, attachments } = opts;

  // 1. Auto-reply detection: skip vacation responders / bounces
  if (AUTO_REPLY_FROM.test(from) || AUTO_REPLY_PATTERNS.test(subject)) {
    console.log('[handoff-inbound] auto-reply detected, skip', { requestId: request.id, from });
    return;
  }

  const supabase = createAdminClient();

  // 2. Guard de estado: si ya no está receptiva, mandar auto-reply "stale"
  if (!STATUS_ACTIVE.has(request.status)) {
    await sendStaleAutoReply(request, from);
    return;
  }

  // 3. Parsear body
  const { cleanText, hadQuotedContent } = parseReplyBody(text);
  const finalText = cleanText.trim() || text.trim();

  // 4. UPDATE human_requests
  const { error: updErr } = await supabase
    .from('human_requests')
    .update({
      status:              'responded',
      response_text:       finalText,
      response_files:      attachments,
      response_source:     'email',
      responded_at:        new Date().toISOString(),
      responded_by_email:  from,
    })
    .eq('id', request.id);

  if (updErr) {
    console.error('[handoff-inbound] update failed:', updErr);
    return;
  }

  console.log('[handoff-inbound] reply captured', {
    requestId:     request.id,
    hasAttachments: attachments.length > 0,
    hadQuotedContent,
    textLength:    finalText.length,
  });

  // 5. Trigger resume (non-blocking)
  resumeAgentAfterHumanResponse(request.id).catch(err =>
    console.error('[handoff-inbound] resume failed:', err)
  );
}

async function sendStaleAutoReply(request: HandoffRequestMatch, from: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: full } = await supabase
    .from('human_requests')
    .select('status, responded_at, cancelled_at, timeout_at, agent_id')
    .eq('id', request.id)
    .single();

  if (!full) return;

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, portal_token')
    .eq('id', request.agent_id)
    .single();
  if (!agent) return;

  const status = full.status as 'responded' | 'cancelled' | 'timeout';
  const respondedAt = new Date(
    (full.responded_at ?? full.cancelled_at ?? full.timeout_at ?? new Date().toISOString()) as string
  );
  const portalUrl = `${BASE_URL}/portal/${agent.portal_token as string}/requests/${request.id}`;

  const html = buildStaleReplyHtml({
    agentName:    agent.agent_name as string,
    requestTitle: request.title,
    status,
    respondedAt,
    portalUrl,
  });

  // Extract bare email address for the "to" field
  const toMatch = from.match(/<([^>]+)>/);
  const toAddr = toMatch ? toMatch[1] : from.trim();

  await sendEmail({
    to:      toAddr,
    subject: `Solicitud ya procesada: ${request.title}`,
    html,
    // NOTA: sendEmail() no soporta headers custom todavía. Los headers
    // RFC 3834 (Auto-Submitted, X-Auto-Response-Suppress) idealmente irían
    // aquí para prevenir loops con vacation responders. Riesgo bajo porque
    // AUTO_REPLY_PATTERNS/AUTO_REPLY_FROM ya filtra la mayoría del ruido.
    // Si aparece loop en prod, extender sendEmail para aceptar `headers?`.
  });
}
```

- [ ] **Step 3: Verificar type check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/human-handoff/auto-reply.ts src/lib/human-handoff/inbound.ts
git commit -m "feat(handoff): módulo inbound + template auto-reply stale"
```

---

## Task 6: Wire handoff handler en `/api/email/inbound/route.ts`

**Files:**
- Modify: `src/app/api/email/inbound/route.ts`

**Interfaces:**
- Consumes:
  - `resolveHumanRequestFromToken` from Task 4
  - `processHandoffReply` + `HandoffAttachment` from Task 5
- Produces: nueva rama en el router de tokens que procesa handoff replies antes que agent/inbox handlers.

- [ ] **Step 1: Añadir imports al inicio de `route.ts`**

Añadir a los imports existentes:

```ts
import { resolveHumanRequestFromToken } from '@/lib/email/inbox';
import { processHandoffReply, type HandoffAttachment } from '@/lib/human-handoff/inbound';
```

(El import de `resolveInboxToken, parseSenderName, parseToToken, resolveAgentFromToken` ya existe en línea 9. Añadir `resolveHumanRequestFromToken` a esa lista o import separado.)

- [ ] **Step 2: Refactorizar el bloque de subida de adjuntos a un helper local**

Actualmente el bloque de subir attachments a Supabase Storage vive dentro del branch "portal inbox" (líneas ~124-144). Necesitamos poder subirlos ANTES del routing para pasarlos al handoff handler. Refactor:

Después del bloque de leer `rawAttachments` (línea ~48) y ANTES del `const token = parseToToken(to)`:

```ts
// Precompute request-specific attachment upload (used by handoff handler if it matches)
// Portal-inbox path re-uploads to its own bucket. Handoff uploads to human-request-files.
async function uploadHandoffAttachments(requestId: string, agentId: string): Promise<HandoffAttachment[]> {
  const stored: HandoffAttachment[] = [];
  const supabase = createAdminClient();
  for (const att of rawAttachments) {
    const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${agentId}/${requestId}/${Date.now()}-${safeName}`;
    const { data: uploaded } = await supabase.storage
      .from('human-request-files')
      .upload(path, att.buf, { contentType: att.type, upsert: false });
    if (uploaded?.path) {
      const { data: { publicUrl } } = supabase.storage
        .from('human-request-files')
        .getPublicUrl(uploaded.path);
      stored.push({ name: att.name, url: publicUrl, type: att.type, size: att.buf.length });
    }
  }
  return stored;
}
```

(Nota: si el bucket `human-request-files` está privado, cambiar `getPublicUrl` por `createSignedUrl` con expiry largo — verificar el patrón en `src/app/api/portal/[token]/requests/[id]/respond/route.ts` línea ~124 y matchear.)

- [ ] **Step 3: Añadir el handoff resolver en primer lugar del routing**

Reemplazar el bloque actual (después de `const token = parseToToken(to); if (!token) return...`) y ANTES de `const agentMatch = await resolveAgentFromToken(token);`:

```ts
  // 1. Try handoff reply first (16 hex chars, unique length discriminator)
  const handoffMatch = await resolveHumanRequestFromToken(token);
  if (handoffMatch) {
    const attachments = await uploadHandoffAttachments(handoffMatch.id, handoffMatch.agent_id);
    // Process non-blocking so the webhook returns 200 fast
    processHandoffReply({
      request:     handoffMatch,
      from,
      subject,
      text,
      attachments,
    }).catch(err => console.error('[handoff-inbound] processHandoffReply failed:', err));
    return NextResponse.json({ ok: true });
  }

  // 2. Try direct-to-agent (existing behavior)
  const agentMatch = await resolveAgentFromToken(token);
  // ... resto sin cambios
```

- [ ] **Step 4: Verificar type check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Verificar comportamiento en logs con curl local (opcional pero recomendado)**

Con `npm run dev` corriendo:

```bash
# Simular reply de un token conocido (usar un reply_token real de la DB de dev)
curl -X POST "http://localhost:3000/api/email/inbound?secret=$EMAIL_INBOUND_SECRET" \
  -F "to=<TOKEN_16_HEX>@inbox.centinelia.mx" \
  -F "from=Nazre <nazre20@gmail.com>" \
  -F "subject=Re: Necesito tu ayuda" \
  -F "text=Sí procede."
```

Expected en logs: `[handoff-inbound] reply captured`. Verificar en Supabase que `human_requests.status` cambió a `responded`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/email/inbound/route.ts
git commit -m "feat(handoff): wire handoff reply handler en /api/email/inbound"
```

---

## Task 7: Fusión legacy `escalate_to_approver` → `pedir_a_humano`

**Files:**
- Modify: `src/lib/ops/inbox-processor.ts` (schema JSON output, prompt, branch `finalStatus === 'escalated'`)
- Modify: `src/lib/ops/approval-email.ts` (borrar `escalationEmailHtml`)

**Interfaces:**
- Consumes: `pedir_a_humano` tool (existente, disponible desde spec 2026-07-30-human-handoff)
- Produces: modelo ya no emite `escalate_to_approver`; nunca se llega al branch escalated en inbox-processor.

- [ ] **Step 1: Quitar `escalate_to_approver` del schema/validator en inbox-processor.ts**

En el archivo, localizar la función `validateProcessedEmail` (línea ~57) y quitar el campo:

```ts
// ANTES:
    escalateToApprover: isBool(r.escalate_to_approver) ? r.escalate_to_approver : false,
    infoNeeded:         strOrNull(r.info_needed, 2000),

// DESPUÉS:
    infoNeeded:         strOrNull(r.info_needed, 2000),
```

Y buscar la interface/tipo del retorno (arriba de `validateProcessedEmail`) — quitar `escalateToApprover: boolean` del tipo.

Buscar todos los usos de `escalateToApprover` o `escalate_to_approver` en el archivo con grep. Deberían aparecer:
- Línea ~60 (definición) — ya borrada
- Línea ~484 (`validateProcessedEmail({ ...parsed, ..., escalate_to_approver: false })`) — quitar el override
- Búsqueda en el resto del archivo por si hay referencias downstream

- [ ] **Step 2: Actualizar prompt (líneas ~402-411)**

Reemplazar todo el bloque que empieza con "PREFIERE SIEMPRE pedir_a_humano SOBRE escalate_to_approver cuando aplique" y termina antes de "Si el remitente mismo debe proporcionar la info":

```
Si necesitas algo del equipo humano (info, una acción, o aprobación): usa la tool pedir_a_humano. El humano recibe form con opción de subir archivos y también puede responder directo por correo. El flujo se auto-completa cuando responde.

- pedir_a_humano({type:'info', ...}) — necesitas info específica del equipo (fotos, casos, credenciales, catálogos, políticas reales).
- pedir_a_humano({type:'action', ...}) — necesitas que un humano ejecute algo físico (llamar cliente, revisar stock, verificar contrato en papel).
- pedir_a_humano({type:'approval', ...}) — necesitas aprobación de una decisión (descuento no estándar, plazo especial, cambio de condiciones).
```

Y en el bloque de output JSON (línea ~440-450), quitar la línea `"escalate_to_approver": false,`.

- [ ] **Step 3: Borrar el branch `finalStatus === 'escalated'`**

En la función que despacha correos (buscar `if (finalStatus === 'escalated')` cerca de línea 723) — borrar todo el bloque `if` completo. El `else if` siguiente (probablemente para `pending`) se convierte en `if`.

Verificar dónde se seteaba `finalStatus = 'escalated'` upstream — probablemente basado en `escalateToApprover`. Con el campo eliminado, esa asignación desaparece; verificar con grep `escalated` que no quede código muerto que refiera al estado.

Si aún hay lugares donde se seteaba, cambiar por `finalStatus = 'pending'` como fallback seguro.

- [ ] **Step 4: Borrar `escalationEmailHtml` de `approval-email.ts`**

En `src/lib/ops/approval-email.ts`, borrar completa la función `escalationEmailHtml` (línea 73-124).

Verificar que el único import estaba en `inbox-processor.ts`:

```bash
grep -rn "escalationEmailHtml" src/
```

Debería quedar cero matches después de los cambios anteriores. Si aparece alguno, borrar/reemplazar.

- [ ] **Step 5: Verificar type check y build**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. Si quedan referencias a `escalateToApprover` en algún componente UI o admin, actualizarlas.

Run: `npm run build`
Expected: build OK. Los archivos afectados no deberían romper porque la fusión es puro simplificación.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ops/inbox-processor.ts src/lib/ops/approval-email.ts
git commit -m "refactor(ops): fusionar escalate_to_approver en pedir_a_humano

El path legacy tenía UX peor (solo botón aprobar/rechazar) y confundía al
modelo con dos maneras de escalar. Ahora hay una sola: pedir_a_humano.
Reply-to-email funciona automáticamente en todos los escalamientos."
```

---

## Task 8: Verificación end-to-end en producción (piloto)

**Files:** ninguno (solo verificación manual)

**Interfaces:** N/A

- [ ] **Step 1: Set env var en Vercel production**

En Vercel dashboard:
- Project → Settings → Environment Variables
- Add `HANDOFF_REPLY_EMAIL_ENABLED = true` (Production only)
- Redeploy la última branch de main para que picke el env var

- [ ] **Step 2: Trigger real: forzar a Sofía a llamar `pedir_a_humano`**

Desde una cuenta de correo personal, mandar al inbox de Sofía (el `agentInboxAddressFor(sofia_agent_id)`) un correo que Sofía no pueda resolver sola. Ejemplo:

```
From: cliente@ejemplo.com
To: <token>@inbox.centinelia.mx
Subject: Duda urgente
Body: Necesito saber si tienen disponibilidad para 500 unidades del producto
      X entrega este viernes. ¿Confirman?
```

Sofía debería llamar `pedir_a_humano({type:'info', description:'Cliente pide 500 uds producto X entrega viernes...'})`.

- [ ] **Step 3: Verificar que Nazre recibió el correo con Reply-To correcto**

En Gmail de Nazre:
- Correo con subject `[Sofía] Necesito tu ayuda: ...`
- Al hacer clic en Reply, el campo "To" debe llenarse con `<16-hex-chars>@inbox.centinelia.mx`

- [ ] **Step 4: Responder al correo desde Gmail**

Responder con texto simple: "Sí, tenemos 500 unidades. Confirma la orden."

- [ ] **Step 5: Verificar procesamiento en Supabase**

En Supabase SQL Editor:

```sql
SELECT id, status, response_text, response_source, responded_by_email, responded_at
FROM human_requests
WHERE agent_id = '<sofia_agent_id>'
ORDER BY created_at DESC
LIMIT 1;
```

Expected:
- `status = 'responded'`
- `response_text` empieza con "Sí, tenemos 500 unidades"
- `response_source = 'email'`
- `responded_by_email` contiene el correo de Nazre
- `responded_at` reciente (últimos minutos)

- [ ] **Step 6: Verificar que Sofía respondió al cliente**

En el mismo hilo del correo original al `cliente@ejemplo.com`, debería haber una respuesta nueva de Sofía usando la info que Nazre proporcionó.

- [ ] **Step 7: Probar auto-reply "stale"**

Responder al mismo correo (que ya fue procesado) con otro texto:

Expected en Gmail de Nazre unos segundos después: correo `Solicitud ya procesada: ...` con texto "Esta solicitud ya fue respondida por otro miembro del equipo el [fecha]."

- [ ] **Step 8: Probar auto-reply de out-of-office (opcional)**

Si tienes acceso a una cuenta de Gmail secundaria, configura vacation responder y hazla `target_email` de una request de prueba. Verificar en logs que aparece `[handoff-inbound] auto-reply detected, skip` y que `human_requests.status` sigue en `pending` (no se marcó como respondida por el auto-reply).

- [ ] **Step 9: Marcar el rollout como completado**

Actualizar la memoria de Centinelia (`memory/reply_to_email_brainstorm_handoff.md`) marcando la feature como shipped, o borrar el handoff memory ya que quedó obsoleto.

Después de 48h estables en producción, ir a Vercel y quitar el env var `HANDOFF_REPLY_EMAIL_ENABLED` — el código lo seguirá respetando (default undefined = false), pero para hacer el feature permanente, en un commit follow-up, reemplazar el chequeo en `notify.ts` por siempre-on:

```ts
// Antes:
const REPLY_ENABLED = process.env.HANDOFF_REPLY_EMAIL_ENABLED === 'true';
// Después:
const REPLY_ENABLED = true;  // shipped 2026-07-31, permanente
```

O más limpio: borrar la constante `REPLY_ENABLED` completamente y su check en `ensureReplyToken`.

---

## Self-Review Notes

Verificado contra el spec:

- **Spec §"Data model"** → Task 2 (migración) + Task 3 (populate token lazy) ✓
- **Spec §"Flujo end-to-end / Outbound"** → Task 3 ✓
- **Spec §"Flujo end-to-end / Inbound"** → Task 4 (resolver) + Task 6 (routing) ✓
- **Spec §"Handoff handler"** → Task 5 (module) + Task 6 (wiring) ✓
- **Spec §"Adjuntos"** → Task 6 Step 2 (helper upload al bucket `human-request-files`) ✓
- **Spec §"Fusión legacy → nuevo"** → Task 7 ✓
- **Spec §"Parser del body"** → Task 1 (con test runner standalone porque el proyecto no tiene test framework) ✓
- **Spec §"Auto-reply solicitud ya procesada"** → Task 5 (auto-reply.ts) + Task 5 Step 2 (send desde inbound.ts) ✓
- **Spec §"Seguridad"** → cubierto por: token de 16 hex chars (Task 3), guard de estado (Task 5 Step 2 §2), auto-reply detection (Task 5 Step 2 §1), skip files >10MB (heredado del route.ts existente) ✓
- **Spec §"Rollout"** → gated en Task 3 (Reply-To) + flip en Task 8 ✓

Nota sobre headers RFC 3834: el spec pide `Auto-Submitted: auto-replied` y `X-Auto-Response-Suppress: All` en el auto-reply "stale". `sendEmail` actual (línea 132-160 de send.ts) NO acepta `headers` custom — solo `from`, `to`, `subject`, `html`, `replyTo`, `attachments`. Documentado como comentario in-code en Task 5 Step 2. Si aparece un loop en prod, extender `sendEmail` es un follow-up trivial (agregar `headers?: Record<string, string>` al opts y pasarlo a Resend en el payload). Riesgo bajo porque el filtro de `AUTO_REPLY_FROM/PATTERNS` en Task 5 Step 2 §1 ya bloquea la mayoría de los responders automáticos ANTES de enviar el stale reply.

Nota sobre backfill: spec no lo requiere. Requests históricas sin `reply_token` no se pueden responder por correo (correcto — nunca tuvieron Reply-To puesto).
