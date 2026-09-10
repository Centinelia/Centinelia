# Demo Meefi 15-sept — Nelia soporte hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship en 5 días una demo funcional que muestra a Nelia (Servicio al Cliente) resolviendo 4 casos de usuarios de Meefi con tools fixture-backed, sobre un clon simulado de meefi.io, con escalamiento inteligente a humanos vía correo real, más un escenario recortado de Niva compliance.

**Architecture:** Meerkat Nelia en org Meefi con 7 tools mockeadas + KB híbrida (Help Center público + reglas operativas). Página `/demo/meefi` que simula meefi.io con widget flotante de chat que consume un proxy sobre `agent-chat` existente. Escalamiento vía SMTP + IMAP APPEND a aliases Gmail. Assets estáticos (4 screenshots Intercom + 1 Slack mock) para contraste narrativo.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres), Anthropic SDK (Claude), nodemailer + IMAP, Vercel deployment. Convenciones existentes: tools en `src/lib/tools/executors/`, definitions en `src/lib/tools/definitions/`, canales en `src/lib/tools/channel-mapping.ts`, registry en `src/lib/tools/registry.ts`.

**Spec:** `docs/superpowers/specs/2026-09-10-demo-meefi-nelia-soporte-design.md`

## Global Constraints

- Copy español limpio: sin em-dash, sin emojis, sin "IA" en UI usuario final (per [[feedback-no-em-dash]], [[feedback-no-emojis]], [[feedback-no-ia-visible]]).
- Español completo con acentos y ¿¡ per [[feedback-espanol-completo]].
- Toda tool nueva registrada en 3 canales (voice + chat + email) per [[feedback-tool-3-canales]] aunque solo chat se use en demo.
- Meerkat email 1-por-cuenta, calendar/storage compartible per [[feedback-email-uniqueness-per-agent]].
- SMTP outbound requiere IMAP APPEND al Sent per [[feedback-smtp-imap-append]].
- Pool cost solo cobra costos externos reales (correos Resend/SMTP), no side-effects locales, per [[feedback-pool-cost-based]].
- Toda llamada `anthropic.messages.create` DEBE loggear a `llm_call_log` vía `logLlmCall` per [[feedback-anthropic-debe-loggearse]].
- No WhatsApp para prospectos/clientes per [[feedback-no-whatsapp]] — comunicación con Gera vía correo.
- Tests: usar nazre20@gmail.com o aliases + para cualquier prueba, nunca correos reales de clientes per [[feedback-no-test-a-clientes]].
- Regla dura de recorte: si al martes 11-sept 23:00 el chat no está respondiendo end-to-end con bloques 1+2+3, el bloque 4 (2FA recovery) se corta a narrativa.

---

## File Structure

**Nuevos:**
- `src/app/demo/meefi/page.tsx` — página clon meefi.io con widget.
- `src/app/demo/meefi/MeefiChatWidget.tsx` — componente widget flotante.
- `src/app/demo/meefi/scenarios.ts` — contexto pre-cargado por `?scenario=N`.
- `src/app/api/demo/meefi/chat/route.ts` — proxy sobre agent-chat.
- `src/lib/tools/definitions/meefi-demo.ts` — 7 tool definitions.
- `src/lib/tools/executors/meefi-lookup-user-account.ts`
- `src/lib/tools/executors/meefi-send-password-reset-link.ts`
- `src/lib/tools/executors/meefi-check-transfer-status.ts`
- `src/lib/tools/executors/meefi-initiate-2fa-recovery.ts`
- `src/lib/tools/executors/meefi-capture-bug-report.ts`
- `src/lib/tools/executors/meefi-escalate-to-human.ts`
- `src/lib/tools/executors/meefi-search-help-center.ts`
- `src/lib/tools/executors/__tests__/meefi-tools.test.ts` — smoke tests.
- `src/lib/tools/fixtures/meefi-users.ts` — fixture users.
- `src/lib/tools/fixtures/meefi-transfers.ts` — fixture transferencias.
- `scripts/meefi/ingest-help-center.ts` — script ingesta KB.
- `scripts/meefi/provision-nelia.ts` — script alta meerkat Nelia en org Meefi.
- `scripts/meefi/pool-grant.ts` — script grant inicial pool.
- `public/demo/meefi/meefi-dashboard.png` — fondo simulado (asset Nazre).
- `public/demo/meefi/intercom-mock-{1,2,3,4}.png` — screenshots contraste.
- `public/demo/meefi/slack-mock.png` — mock canal soporte.
- `demos/meefi-gac/13b-guion-detallado-15-sept-nelia.md` — guion nuevo.
- `demos/meefi-gac/21-dry-run-runbook-nelia.md` — runbook nuevo.
- `demos/meefi-gac/22-kb-nelia-meefi.md` — KB operativa Nelia (reglas escalamiento + guiones).

**Modificar:**
- `src/lib/tools/channel-mapping.ts` — agregar 7 tools nuevas en los 3 canales.
- `src/lib/tools/registry.ts` — registrar executors.
- `src/lib/tools/available-tools.ts` — exponer tools en el catálogo del meerkat.

---

## Interfaces globales del plan

Tipos compartidos que tasks posteriores consumen:

```ts
// src/lib/tools/fixtures/meefi-users.ts
export type MeefiUserFlags = {
  password_reset_locked: boolean;
  has_2fa: boolean;
  passkey_registered: boolean;
  identity_verified: boolean;
  kyc_status: 'pending' | 'approved' | 'rejected';
};

export type MeefiUser = {
  user_id: string;
  email: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  flags: MeefiUserFlags;
};

// src/lib/tools/fixtures/meefi-transfers.ts
export type MeefiTransferStatus = 'pendiente_rieles' | 'rechazada' | 'ya_conciliada';

export type MeefiTransfer = {
  transfer_id: string;
  user_id: string;
  amount: number;
  date: string; // ISO
  status: MeefiTransferStatus;
  explanation: string;
  eta_or_next_action: string;
  destination_bank?: string;
};

// src/lib/tools/executors/meefi-escalate-to-human.ts
export type EscalationTopic =
  | 'cuentas_docs'
  | 'transferencia_urgente'
  | 'bug_plataforma'
  | 'recovery_2fa'
  | 'otro';

export type EscalationPriority = 'baja' | 'media' | 'alta';
```

Todos los tool executors regresan `{ ok: boolean; ... }` con payload específico.

---

## Task 1: Discovery correo a Gera (Nazre, sin código)

**Files:** ninguno (correo enviado desde Gmail Nazre).

**Interfaces:**
- Produces: bloques de KB (contexto Intercom + docs), assets (screenshot dashboard meefi.io), listado de emails escalamiento (`ashley@`, `emilio@`, `jaime@` de Meefi para naming en alias).

- [ ] **Step 1: Redactar y enviar correo a Gera**

Contenido pedido:
1. Screenshot del dashboard meefi.io logueado (o permiso para maquetarlo).
2. Contexto/config actual del chatbot Intercom (system prompt, workflows, KB configurada).
3. Docs KB extras si los tiene (guías internas soporte).
4. Confirmar nombres y correos internos de Ashley, Emilio, Jaime (solo para naming visual del alias del lado nuestro; correo real llega a `nazre20+ashley@gmail.com`).
5. Preguntar sobre acceso APIs sandbox para plan B post-demo.

Sin WhatsApp per [[feedback-no-whatsapp]].

- [ ] **Step 2: Confirmar recibido a las 12h y a las 24h**

Si Gera no responde en 24h, proceder con supuestos razonables y KB pública Help Center scrapeado.

- [ ] **Step 3: Guardar assets recibidos**

Cuando llegue el screenshot: `public/demo/meefi/meefi-dashboard.png`. Cuando lleguen docs Intercom: `demos/meefi-gac/gera-context-intercom.md`.

---

## Task 2: Provisioning Nelia en org Meefi

**Files:**
- Create: `scripts/meefi/provision-nelia.ts`

**Interfaces:**
- Consumes: org Meefi ya existente (portal_token `5RP13tnLK6XX` per [[project-meefi-gac-demo-provisioning]]).
- Produces: `voice_agents` row con Nelia rol `servicio_al_cliente` en org Meefi. `agent_id` que tasks posteriores usan como constante `MEEFI_NELIA_AGENT_ID`.

- [ ] **Step 1: Consultar org Meefi + roster actual**

Vía `mcp__supabase__execute_sql`:
```sql
SELECT id, name, portal_token FROM organizations WHERE portal_token = '5RP13tnLK6XX';
SELECT id, name, role_slug, email FROM voice_agents WHERE org_id = <meefi_org_id>;
```

Esperado: Meefi org existe, roster tiene Nara + Nalú + Niva, no Nelia.

- [ ] **Step 2: Escribir script provisioning**

`scripts/meefi/provision-nelia.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('portal_token', '5RP13tnLK6XX')
    .single();

  if (!org) throw new Error('Meefi org no encontrada');

  const { data: nelia, error } = await supabase
    .from('voice_agents')
    .insert({
      org_id: org.id,
      name: 'Nelia',
      role_slug: 'servicio_al_cliente',
      display_name: 'Nelia · Asistente Meefi',
      voice_id: null, // solo chat por ahora
      active: true,
      features: {},
      role_knowledge_base: '', // se llena en Task 10
    })
    .select('id')
    .single();

  if (error) throw error;
  console.log('Nelia provisionada, agent_id:', nelia.id);
}

main();
```

- [ ] **Step 3: Correr script**

```bash
pnpm tsx scripts/meefi/provision-nelia.ts
```

Guardar `agent_id` de output. Se usa en Task 6, Task 9, Task 10.

- [ ] **Step 4: Verificar en portal**

Abrir `https://centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados` y confirmar que Nelia aparece.

- [ ] **Step 5: Commit**

```bash
git add scripts/meefi/provision-nelia.ts
git commit -m "feat(meefi): script provisioning Nelia en org Meefi"
```

---

## Task 3: Fixture data usuarios + transferencias

**Files:**
- Create: `src/lib/tools/fixtures/meefi-users.ts`
- Create: `src/lib/tools/fixtures/meefi-transfers.ts`
- Test: `src/lib/tools/executors/__tests__/meefi-fixtures.test.ts`

**Interfaces:**
- Produces: `getMeefiUser(email)`, `getMeefiTransfer(query)`, `MEEFI_USERS[]`, `MEEFI_TRANSFERS[]`.

- [ ] **Step 1: Escribir el test failing**

`src/lib/tools/executors/__tests__/meefi-fixtures.test.ts`:

```ts
import { getMeefiUser, MEEFI_USERS } from '../../fixtures/meefi-users';
import { getMeefiTransfer, MEEFI_TRANSFERS } from '../../fixtures/meefi-transfers';

describe('meefi fixtures', () => {
  it('has 6+ users with variety of flags', () => {
    expect(MEEFI_USERS.length).toBeGreaterThanOrEqual(6);
    const locked = MEEFI_USERS.filter(u => u.flags.password_reset_locked);
    const unverified = MEEFI_USERS.filter(u => !u.flags.identity_verified);
    expect(locked.length).toBeGreaterThan(0);
    expect(unverified.length).toBeGreaterThan(0);
  });

  it('getMeefiUser finds by email case-insensitive', () => {
    const u = getMeefiUser('demo1@meefi.io');
    expect(u).toBeDefined();
    expect(u!.email.toLowerCase()).toBe('demo1@meefi.io');
  });

  it('has all 3 transfer statuses represented', () => {
    const statuses = new Set(MEEFI_TRANSFERS.map(t => t.status));
    expect(statuses.has('pendiente_rieles')).toBe(true);
    expect(statuses.has('rechazada')).toBe(true);
    expect(statuses.has('ya_conciliada')).toBe(true);
  });

  it('getMeefiTransfer matches by amount+date approx', () => {
    const t = getMeefiTransfer({ amount: 50000, date_approx: '2026-09-10' });
    expect(t).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/lib/tools/executors/__tests__/meefi-fixtures.test.ts
```

Expected: FAIL con "cannot find module".

- [ ] **Step 3: Escribir fixtures**

`src/lib/tools/fixtures/meefi-users.ts`:

```ts
export type MeefiUserFlags = {
  password_reset_locked: boolean;
  has_2fa: boolean;
  passkey_registered: boolean;
  identity_verified: boolean;
  kyc_status: 'pending' | 'approved' | 'rejected';
};

export type MeefiUser = {
  user_id: string;
  email: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  flags: MeefiUserFlags;
};

export const MEEFI_USERS: MeefiUser[] = [
  {
    user_id: 'usr_001',
    email: 'demo1@meefi.io',
    name: 'Carlos Ramírez',
    status: 'active',
    flags: {
      password_reset_locked: true,
      has_2fa: true,
      passkey_registered: false,
      identity_verified: false,
      kyc_status: 'pending',
    },
  },
  {
    user_id: 'usr_002',
    email: 'demo2@meefi.io',
    name: 'María Fernández',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: true,
      passkey_registered: true,
      identity_verified: true,
      kyc_status: 'approved',
    },
  },
  {
    user_id: 'usr_003',
    email: 'demo3@meefi.io',
    name: 'Jorge Villarreal',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: true,
      passkey_registered: false,
      identity_verified: true,
      kyc_status: 'approved',
    },
  },
  {
    user_id: 'usr_004',
    email: 'demo4@meefi.io',
    name: 'Ana Sofía Guajardo',
    status: 'suspended',
    flags: {
      password_reset_locked: true,
      has_2fa: false,
      passkey_registered: false,
      identity_verified: true,
      kyc_status: 'rejected',
    },
  },
  {
    user_id: 'usr_005',
    email: 'demo5@meefi.io',
    name: 'Luis Enrique Cepeda',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: false,
      passkey_registered: false,
      identity_verified: false,
      kyc_status: 'pending',
    },
  },
  {
    user_id: 'usr_006',
    email: 'demo6@meefi.io',
    name: 'Regina Martínez',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: true,
      passkey_registered: true,
      identity_verified: true,
      kyc_status: 'approved',
    },
  },
];

export function getMeefiUser(email: string): MeefiUser | undefined {
  return MEEFI_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
}
```

`src/lib/tools/fixtures/meefi-transfers.ts`:

```ts
export type MeefiTransferStatus = 'pendiente_rieles' | 'rechazada' | 'ya_conciliada';

export type MeefiTransfer = {
  transfer_id: string;
  user_id: string;
  amount: number;
  date: string;
  status: MeefiTransferStatus;
  explanation: string;
  eta_or_next_action: string;
  destination_bank?: string;
};

export const MEEFI_TRANSFERS: MeefiTransfer[] = [
  {
    transfer_id: 'trf_001',
    user_id: 'usr_003',
    amount: 50000,
    date: '2026-09-10T14:30:00Z',
    status: 'pendiente_rieles',
    explanation: 'La transferencia salió de Meefi hace 2 horas y está viajando por los rieles SPEI. El destino es BBVA, que en horario pico puede tardar hasta 4 horas hábiles en reflejar.',
    eta_or_next_action: 'ETA reflejo antes de las 19:00 hora CDMX de hoy. Si a las 19:30 no aparece, escalamos con el equipo de operaciones.',
    destination_bank: 'BBVA',
  },
  {
    transfer_id: 'trf_002',
    user_id: 'usr_002',
    amount: 12500,
    date: '2026-09-09T10:15:00Z',
    status: 'rechazada',
    explanation: 'El banco destino (Banorte) rechazó la operación por CLABE inválida. El monto ya se abonó de regreso a la cuenta Meefi hace 40 minutos.',
    eta_or_next_action: 'Verificar la CLABE con el proveedor y reintentar. El monto ya está disponible en tu saldo.',
    destination_bank: 'Banorte',
  },
  {
    transfer_id: 'trf_003',
    user_id: 'usr_002',
    amount: 8500,
    date: '2026-09-08T16:45:00Z',
    status: 'ya_conciliada',
    explanation: 'Transferencia liquidada y conciliada el 8 de septiembre a las 17:12. Confirmación SPEI en tu historial.',
    eta_or_next_action: 'Puedes descargar el comprobante desde Movimientos > Detalle transferencia.',
    destination_bank: 'Santander',
  },
  {
    transfer_id: 'trf_004',
    user_id: 'usr_006',
    amount: 25000,
    date: '2026-09-10T11:00:00Z',
    status: 'pendiente_rieles',
    explanation: 'Salió a las 11:00, destino HSBC. HSBC tiene ventana de reflejo cada hora en punto.',
    eta_or_next_action: 'ETA próxima hora en punto (12:00). Si a las 13:00 no aparece, escalamos.',
    destination_bank: 'HSBC',
  },
];

type TransferQuery = { amount?: number; date_approx?: string; transfer_id?: string };

export function getMeefiTransfer(q: TransferQuery): MeefiTransfer | undefined {
  if (q.transfer_id) return MEEFI_TRANSFERS.find(t => t.transfer_id === q.transfer_id);
  return MEEFI_TRANSFERS.find(t => {
    const amountMatch = q.amount === undefined || Math.abs(t.amount - q.amount) < 100;
    const dateMatch = q.date_approx === undefined || t.date.startsWith(q.date_approx);
    return amountMatch && dateMatch;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/lib/tools/executors/__tests__/meefi-fixtures.test.ts
```

Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/fixtures/meefi-users.ts src/lib/tools/fixtures/meefi-transfers.ts src/lib/tools/executors/__tests__/meefi-fixtures.test.ts
git commit -m "feat(meefi): fixture users + transferencias para demo Nelia"
```

---

## Task 4: Tools de consulta (lookup + transfer status + help center)

**Files:**
- Create: `src/lib/tools/executors/meefi-lookup-user-account.ts`
- Create: `src/lib/tools/executors/meefi-check-transfer-status.ts`
- Create: `src/lib/tools/executors/meefi-search-help-center.ts`
- Test: `src/lib/tools/executors/__tests__/meefi-tools-lookup.test.ts`

**Interfaces:**
- Consumes: `getMeefiUser`, `getMeefiTransfer` de Task 3. KB de org Meefi (ingerida en Task 11).
- Produces: 3 executor functions con signature `(input, ctx) => Promise<ToolResult>`.

- [ ] **Step 1: Escribir tests failing**

`src/lib/tools/executors/__tests__/meefi-tools-lookup.test.ts`:

```ts
import { executeMeefiLookupUserAccount } from '../meefi-lookup-user-account';
import { executeMeefiCheckTransferStatus } from '../meefi-check-transfer-status';

describe('meefi-lookup-user-account', () => {
  it('regresa flags para usuario existente', async () => {
    const r = await executeMeefiLookupUserAccount({ email: 'demo1@meefi.io' }, {} as any);
    expect(r.ok).toBe(true);
    expect(r.user).toBeDefined();
    expect(r.user!.flags.password_reset_locked).toBe(true);
  });

  it('regresa ok:false para usuario inexistente', async () => {
    const r = await executeMeefiLookupUserAccount({ email: 'noexiste@meefi.io' }, {} as any);
    expect(r.ok).toBe(false);
  });
});

describe('meefi-check-transfer-status', () => {
  it('encuentra transferencia por monto+fecha', async () => {
    const r = await executeMeefiCheckTransferStatus(
      { amount: 50000, date_approx: '2026-09-10' },
      {} as any
    );
    expect(r.ok).toBe(true);
    expect(r.transfer?.status).toBe('pendiente_rieles');
  });

  it('regresa ok:false si no encuentra', async () => {
    const r = await executeMeefiCheckTransferStatus({ amount: 999999 }, {} as any);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test src/lib/tools/executors/__tests__/meefi-tools-lookup.test.ts
```

Expected: FAIL con "cannot find module".

- [ ] **Step 3: Implementar los 3 executors**

`src/lib/tools/executors/meefi-lookup-user-account.ts`:

```ts
import { getMeefiUser } from '../fixtures/meefi-users';
import type { ExecutorContext } from '../types'; // ajustar si el tipo se llama distinto

export async function executeMeefiLookupUserAccount(
  input: { email: string },
  _ctx: ExecutorContext
) {
  const user = getMeefiUser(input.email);
  if (!user) return { ok: false, reason: 'user_not_found', email: input.email };
  return { ok: true, user };
}
```

`src/lib/tools/executors/meefi-check-transfer-status.ts`:

```ts
import { getMeefiTransfer } from '../fixtures/meefi-transfers';
import type { ExecutorContext } from '../types';

export async function executeMeefiCheckTransferStatus(
  input: { amount?: number; date_approx?: string; transfer_id?: string },
  _ctx: ExecutorContext
) {
  const t = getMeefiTransfer(input);
  if (!t) return { ok: false, reason: 'transfer_not_found' };
  return { ok: true, transfer: t };
}
```

`src/lib/tools/executors/meefi-search-help-center.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import type { ExecutorContext } from '../types';

export async function executeMeefiSearchHelpCenter(
  input: { query: string },
  ctx: ExecutorContext
) {
  // Consulta knowledge_base pública de la org Meefi. La ingesta se hace en Task 11.
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase.rpc('search_meefi_help_center', { q: input.query, top_k: 3 });
  if (!data || data.length === 0) return { ok: false, reason: 'no_results' };
  return { ok: true, articles: data };
}
```

**Nota sobre types:** revisar el archivo `src/lib/tools/executors/registrar-incidencia.ts` (existente) para adoptar la misma firma exacta que los executors actuales. Si el context type se llama distinto, ajustar el import.

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test src/lib/tools/executors/__tests__/meefi-tools-lookup.test.ts
```

Expected: PASS 4/4 (search_help_center no tiene test aquí porque requiere KB en DB; se prueba en dry run).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executors/meefi-lookup-user-account.ts src/lib/tools/executors/meefi-check-transfer-status.ts src/lib/tools/executors/meefi-search-help-center.ts src/lib/tools/executors/__tests__/meefi-tools-lookup.test.ts
git commit -m "feat(meefi): tools lookup user + check transfer + search help center"
```

---

## Task 5: Tools de acción (password reset + 2FA recovery + bug report)

**Files:**
- Create: `src/lib/tools/executors/meefi-send-password-reset-link.ts`
- Create: `src/lib/tools/executors/meefi-initiate-2fa-recovery.ts`
- Create: `src/lib/tools/executors/meefi-capture-bug-report.ts`
- Test: `src/lib/tools/executors/__tests__/meefi-tools-action.test.ts`

**Interfaces:**
- Consumes: `getMeefiUser` de Task 3.
- Produces: 3 executor functions.

- [ ] **Step 1: Escribir tests failing**

```ts
import { executeMeefiSendPasswordResetLink } from '../meefi-send-password-reset-link';
import { executeMeefiInitiate2faRecovery } from '../meefi-initiate-2fa-recovery';
import { executeMeefiCaptureBugReport } from '../meefi-capture-bug-report';

describe('meefi-send-password-reset-link', () => {
  it('bloquea si password_reset_locked=true', async () => {
    const r = await executeMeefiSendPasswordResetLink({ user_id: 'usr_001' }, {} as any);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('account_not_verified');
    expect(r.suggestion).toContain('verify_email');
  });

  it('envía link si cuenta verificada', async () => {
    const r = await executeMeefiSendPasswordResetLink({ user_id: 'usr_002' }, {} as any);
    expect(r.ok).toBe(true);
    expect(r.delivered_to).toBe('demo2@meefi.io');
  });
});

describe('meefi-initiate-2fa-recovery', () => {
  it('regresa ticket + checklist evidencia', async () => {
    const r = await executeMeefiInitiate2faRecovery({ user_id: 'usr_002' }, {} as any);
    expect(r.ok).toBe(true);
    expect(r.recovery_ticket_id).toMatch(/^rec_/);
    expect(r.evidence_checklist).toEqual(
      expect.arrayContaining(['ine_frente', 'ine_reverso', 'selfie_con_ine', 'ultimos_4_cuenta'])
    );
  });
});

describe('meefi-capture-bug-report', () => {
  it('crea ticket con assignee sugerido', async () => {
    const r = await executeMeefiCaptureBugReport(
      {
        user_id: 'usr_003',
        description: 'no puedo entrar',
        technical_context: { browser: 'Chrome 128', last_url: '/dashboard' },
      },
      {} as any
    );
    expect(r.ok).toBe(true);
    expect(r.bug_ticket_id).toMatch(/^bug_/);
    expect(['emilio', 'jaime']).toContain(r.assignee_hint);
  });
});
```

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implementar executors**

`src/lib/tools/executors/meefi-send-password-reset-link.ts`:

```ts
import { MEEFI_USERS } from '../fixtures/meefi-users';
import type { ExecutorContext } from '../types';

export async function executeMeefiSendPasswordResetLink(
  input: { user_id: string },
  _ctx: ExecutorContext
) {
  const user = MEEFI_USERS.find(u => u.user_id === input.user_id);
  if (!user) return { ok: false, reason: 'user_not_found' };
  if (user.flags.password_reset_locked) {
    return {
      ok: false,
      reason: 'account_not_verified',
      suggestion: 'verify_email_first',
      message:
        'La cuenta tiene el reset bloqueado hasta verificar el correo. Le pedimos al usuario que abra el correo de bienvenida y confirme, después reintentamos.',
    };
  }
  return {
    ok: true,
    delivered_to: user.email,
    link_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    message: `Link de restablecimiento enviado a ${user.email}. Vigencia 60 minutos.`,
  };
}
```

`src/lib/tools/executors/meefi-initiate-2fa-recovery.ts`:

```ts
import type { ExecutorContext } from '../types';

const EVIDENCE = ['ine_frente', 'ine_reverso', 'selfie_con_ine', 'ultimos_4_cuenta'] as const;

export async function executeMeefiInitiate2faRecovery(
  input: { user_id: string },
  _ctx: ExecutorContext
) {
  const ticketId = `rec_${Math.random().toString(36).slice(2, 10)}`;
  return {
    ok: true,
    recovery_ticket_id: ticketId,
    evidence_checklist: [...EVIDENCE],
    next_action:
      'Solicitar al usuario los 4 documentos. Cuando estén completos, escalar con escalate_to_human topic recovery_2fa.',
  };
}
```

`src/lib/tools/executors/meefi-capture-bug-report.ts`:

```ts
import type { ExecutorContext } from '../types';

const TRANSFER_KEYWORDS = /transfer|pago|dinero|cobr/i;

export async function executeMeefiCaptureBugReport(
  input: { user_id: string; description: string; technical_context?: Record<string, unknown> },
  _ctx: ExecutorContext
) {
  const bugId = `bug_${Math.random().toString(36).slice(2, 10)}`;
  const assignee = TRANSFER_KEYWORDS.test(input.description) ? 'emilio' : 'jaime';
  return {
    ok: true,
    bug_ticket_id: bugId,
    assignee_hint: assignee,
    context_snapshot: {
      description: input.description,
      technical: input.technical_context ?? {},
      captured_at: new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executors/meefi-send-password-reset-link.ts src/lib/tools/executors/meefi-initiate-2fa-recovery.ts src/lib/tools/executors/meefi-capture-bug-report.ts src/lib/tools/executors/__tests__/meefi-tools-action.test.ts
git commit -m "feat(meefi): tools password reset + 2FA recovery + bug report"
```

---

## Task 6: Tool escalate_to_human con correo real

**Files:**
- Create: `src/lib/tools/executors/meefi-escalate-to-human.ts`
- Test: `src/lib/tools/executors/__tests__/meefi-escalate.test.ts`

**Interfaces:**
- Consumes: `EscalationTopic`, `EscalationPriority`, SMTP connector existente en Centinelia (`src/lib/email/send.ts` o equivalente — inspeccionar antes de escribir).
- Produces: `executeMeefiEscalateToHuman`. Manda correo real a alias Gmail + guarda evento en `notification_events`.

- [ ] **Step 1: Inspeccionar SMTP connector existente**

```bash
grep -r "sendMeerkatHtmlEmail\|nodemailer\|IMAP APPEND" src/lib/email/ src/lib/integrations/
```

Anotar función exacta a llamar. Aplica regla [[feedback-smtp-imap-append]].

- [ ] **Step 2: Escribir test failing**

`src/lib/tools/executors/__tests__/meefi-escalate.test.ts`:

```ts
import { executeMeefiEscalateToHuman } from '../meefi-escalate-to-human';

// Mock del sender
jest.mock('@/lib/email/send', () => ({
  sendMeerkatHtmlEmail: jest.fn().mockResolvedValue({ ok: true, message_id: 'abc' }),
}));

describe('meefi-escalate-to-human', () => {
  it('rutea transferencia_urgente a emilio alias', async () => {
    const r = await executeMeefiEscalateToHuman(
      {
        topic: 'transferencia_urgente',
        priority: 'alta',
        context_summary: 'Usuario reporta transferencia $50k retenida',
        user_id: 'usr_003',
        transcript: 'demo transcript',
      },
      { agent_id: 'nelia_meefi' } as any
    );
    expect(r.ok).toBe(true);
    expect(r.sent_to).toContain('nazre20+emilio@gmail.com');
    expect(r.ticket_id).toMatch(/^esc_/);
  });

  it('rutea cuentas_docs a ashley alias', async () => {
    const r = await executeMeefiEscalateToHuman(
      { topic: 'cuentas_docs', priority: 'media', context_summary: 'x', user_id: 'usr_001' },
      {} as any
    );
    expect(r.sent_to).toContain('nazre20+ashley@gmail.com');
  });

  it('rutea recovery_2fa a ashley', async () => {
    const r = await executeMeefiEscalateToHuman(
      { topic: 'recovery_2fa', priority: 'media', context_summary: 'x', user_id: 'usr_002' },
      {} as any
    );
    expect(r.sent_to).toContain('nazre20+ashley@gmail.com');
  });
});
```

- [ ] **Step 3: Run to verify fail**

- [ ] **Step 4: Implementar executor**

```ts
import type { ExecutorContext } from '../types';
import { sendMeerkatHtmlEmail } from '@/lib/email/send'; // ajustar al import real

export type EscalationTopic =
  | 'cuentas_docs'
  | 'transferencia_urgente'
  | 'bug_plataforma'
  | 'recovery_2fa'
  | 'otro';

export type EscalationPriority = 'baja' | 'media' | 'alta';

const ALIAS_MAP: Record<EscalationTopic, string> = {
  cuentas_docs: 'nazre20+ashley@gmail.com',
  transferencia_urgente: 'nazre20+emilio@gmail.com',
  bug_plataforma: 'nazre20+jaime@gmail.com',
  recovery_2fa: 'nazre20+ashley@gmail.com',
  otro: 'nazre20+gera@gmail.com',
};

const NAME_MAP: Record<EscalationTopic, string> = {
  cuentas_docs: 'Ashley (Cuentas)',
  transferencia_urgente: 'Emilio (Operaciones)',
  bug_plataforma: 'Jaime (Plataforma)',
  recovery_2fa: 'Ashley (Cuentas)',
  otro: 'Equipo Meefi',
};

export async function executeMeefiEscalateToHuman(
  input: {
    topic: EscalationTopic;
    priority: EscalationPriority;
    context_summary: string;
    user_id: string;
    transcript?: string;
    hypothesis?: string;
    evidence_urls?: string[];
    next_action?: string;
  },
  ctx: ExecutorContext
) {
  const to = ALIAS_MAP[input.topic];
  const humanName = NAME_MAP[input.topic];
  const ticketId = `esc_${Math.random().toString(36).slice(2, 10)}`;

  const subject = `[Meefi Soporte · ${input.priority.toUpperCase()}] ${input.topic} · ${input.user_id}`;

  const html = renderEscalationHtml({
    ticketId,
    userId: input.user_id,
    priority: input.priority,
    topic: input.topic,
    humanName,
    contextSummary: input.context_summary,
    transcript: input.transcript ?? '',
    hypothesis: input.hypothesis ?? '',
    evidenceUrls: input.evidence_urls ?? [],
    nextAction: input.next_action ?? '',
    timestamp: new Date().toISOString(),
  });

  const r = await sendMeerkatHtmlEmail({
    agent_id: ctx.agent_id,
    to,
    subject,
    html,
  });

  return {
    ok: r.ok,
    sent_to: to,
    routed_to_name: humanName,
    ticket_id: ticketId,
    message_id: r.message_id,
  };
}

function renderEscalationHtml(args: {
  ticketId: string;
  userId: string;
  priority: string;
  topic: string;
  humanName: string;
  contextSummary: string;
  transcript: string;
  hypothesis: string;
  evidenceUrls: string[];
  nextAction: string;
  timestamp: string;
}) {
  const rows = [
    ['Ticket ID', args.ticketId],
    ['Prioridad', args.priority],
    ['Tema', args.topic],
    ['Destinatario', args.humanName],
    ['Usuario', args.userId],
    ['Timestamp', args.timestamp],
  ]
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#666">${k}</td><td style="padding:6px 12px">${v}</td></tr>`)
    .join('');

  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:640px">
      <h2 style="color:#6C3BFF">Escalamiento de Nelia</h2>
      <table style="border-collapse:collapse;margin-bottom:16px">${rows}</table>
      <h3>Resumen</h3>
      <p>${escapeHtml(args.contextSummary)}</p>
      <h3>Hipótesis</h3>
      <p>${escapeHtml(args.hypothesis)}</p>
      <h3>Conversación</h3>
      <pre style="background:#f7f5ff;padding:12px;border-radius:8px;white-space:pre-wrap">${escapeHtml(args.transcript)}</pre>
      ${
        args.evidenceUrls.length
          ? `<h3>Evidencia</h3><ul>${args.evidenceUrls.map(u => `<li><a href="${u}">${u}</a></li>`).join('')}</ul>`
          : ''
      }
      <h3>Próxima acción sugerida</h3>
      <p>${escapeHtml(args.nextAction)}</p>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

- [ ] **Step 5: Run test**

Expected: PASS 3/3.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/executors/meefi-escalate-to-human.ts src/lib/tools/executors/__tests__/meefi-escalate.test.ts
git commit -m "feat(meefi): tool escalate_to_human con routing por topic + correo real"
```

---

## Task 7: Definitions + registry + channel-mapping

**Files:**
- Create: `src/lib/tools/definitions/meefi-demo.ts`
- Modify: `src/lib/tools/channel-mapping.ts`
- Modify: `src/lib/tools/registry.ts`
- Modify: `src/lib/tools/available-tools.ts`

**Interfaces:**
- Consumes: los 7 executors de Tasks 4-6.
- Produces: 7 tool definitions con JSON schema + registro en 3 canales.

- [ ] **Step 1: Inspeccionar convención existente**

```bash
grep -l "registerTool\|toolDefinition" src/lib/tools/definitions/
cat src/lib/tools/definitions/*.ts | head -100
```

Adoptar el mismo shape que las definitions existentes.

- [ ] **Step 2: Escribir definitions**

`src/lib/tools/definitions/meefi-demo.ts`:

```ts
import { z } from 'zod';

export const MEEFI_TOOL_DEFINITIONS = [
  {
    name: 'meefi_lookup_user_account',
    description: 'Busca la cuenta de un usuario Meefi por correo. Regresa flags: password_reset_locked, has_2fa, passkey_registered, identity_verified, kyc_status.',
    inputSchema: z.object({ email: z.string().email() }),
  },
  {
    name: 'meefi_send_password_reset_link',
    description: 'Envía link de restablecimiento de contraseña al correo del usuario. Falla si la cuenta tiene reset bloqueado.',
    inputSchema: z.object({ user_id: z.string() }),
  },
  {
    name: 'meefi_check_transfer_status',
    description: 'Consulta estado de una transferencia por monto+fecha aproximada o por transfer_id. Regresa: pendiente_rieles, rechazada, o ya_conciliada, con explicación.',
    inputSchema: z.object({
      amount: z.number().optional(),
      date_approx: z.string().optional(),
      transfer_id: z.string().optional(),
    }),
  },
  {
    name: 'meefi_initiate_2fa_recovery',
    description: 'Arranca proceso de recovery de 2FA. Regresa ticket_id + checklist de evidencia a pedir al usuario.',
    inputSchema: z.object({ user_id: z.string() }),
  },
  {
    name: 'meefi_capture_bug_report',
    description: 'Registra un bug técnico. Recibe descripción y contexto (navegador, URL, pasos). Regresa ticket_id + hint de quién lo atiende (Emilio o Jaime).',
    inputSchema: z.object({
      user_id: z.string(),
      description: z.string(),
      technical_context: z.record(z.unknown()).optional(),
    }),
  },
  {
    name: 'meefi_escalate_to_human',
    description: 'Escala a la persona correcta con contexto pre-empacado. Topic rutea el destinatario: cuentas_docs → Ashley, transferencia_urgente → Emilio, bug_plataforma → Jaime, recovery_2fa → Ashley, otro → Gera. Manda correo real con resumen ejecutivo.',
    inputSchema: z.object({
      topic: z.enum(['cuentas_docs', 'transferencia_urgente', 'bug_plataforma', 'recovery_2fa', 'otro']),
      priority: z.enum(['baja', 'media', 'alta']),
      context_summary: z.string(),
      user_id: z.string(),
      transcript: z.string().optional(),
      hypothesis: z.string().optional(),
      evidence_urls: z.array(z.string()).optional(),
      next_action: z.string().optional(),
    }),
  },
  {
    name: 'meefi_search_help_center',
    description: 'Busca artículos en el Help Center de meefi.io. Regresa top 3 con snippet y link.',
    inputSchema: z.object({ query: z.string() }),
  },
] as const;
```

- [ ] **Step 3: Registrar en channel-mapping**

Modificar `src/lib/tools/channel-mapping.ts` para incluir las 7 tools en `voice`, `chat`, `email` (per [[feedback-tool-3-canales]]).

- [ ] **Step 4: Registrar executors en registry**

Modificar `src/lib/tools/registry.ts` para wire cada definition a su executor.

- [ ] **Step 5: Exponer en available-tools**

Modificar `src/lib/tools/available-tools.ts` para que las 7 tools estén disponibles cuando el meerkat tiene `role_slug='servicio_al_cliente'` en la org Meefi.

- [ ] **Step 6: Run test suite**

```bash
pnpm test src/lib/tools/
pnpm run check:llm-logging
```

Expected: PASS. Si `check:llm-logging` falla, revisar si alguna nueva llamada Anthropic quedó sin log (no debería haber en tools mock, pero verificar).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/definitions/meefi-demo.ts src/lib/tools/channel-mapping.ts src/lib/tools/registry.ts src/lib/tools/available-tools.ts
git commit -m "feat(meefi): registrar 7 tools Nelia en definitions + registry + 3 canales"
```

---

## Task 8: Endpoint proxy /api/demo/meefi/chat

**Files:**
- Create: `src/app/api/demo/meefi/chat/route.ts`

**Interfaces:**
- Consumes: endpoint `agent-chat` existente, `MEEFI_NELIA_AGENT_ID` (de Task 2).
- Produces: `POST /api/demo/meefi/chat` que acepta `{ message, scenario?, user_email?, session_id }` y streamea la respuesta de Nelia.

- [ ] **Step 1: Inspeccionar endpoint agent-chat existente**

```bash
cat src/app/api/chat/route.ts
```

Copiar shape. El proxy es un wrapper delgado que fija `agent_id` y agrega `system_context` con el usuario de la scenario si viene el query param.

- [ ] **Step 2: Escribir route handler**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getMeefiUser } from '@/lib/tools/fixtures/meefi-users';

const MEEFI_NELIA_AGENT_ID = process.env.MEEFI_NELIA_AGENT_ID!; // set en .env local + Vercel

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message, scenario, user_email, session_id } = body;

  // Rate limit básico (adoptar helper existente si hay uno)
  // TODO en implementación: usar el helper de rate limit del portal

  const scenarioUser = user_email ? getMeefiUser(user_email) : undefined;

  const systemContextExtra = scenarioUser
    ? `Contexto de sesión: el usuario actual es ${scenarioUser.name} (${scenarioUser.email}, user_id: ${scenarioUser.user_id}). Cuando la tool lo pida, usa estos datos.`
    : '';

  // Delegar al agent-chat interno
  const upstream = await fetch(new URL('/api/chat', req.url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: MEEFI_NELIA_AGENT_ID,
      message,
      session_id,
      system_context_extra: systemContextExtra,
    }),
  });

  // Passthrough streaming
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
```

**Nota:** revisar cómo el `/api/chat` real acepta `system_context_extra` o el nombre equivalente. Si no existe, agregar el parámetro ahí (feature flag) o inyectar via prepend al system prompt en la config del meerkat.

- [ ] **Step 3: Set env var en local + Vercel**

`.env.local`:
```
MEEFI_NELIA_AGENT_ID=<uuid de Task 2>
```

Vercel: agregar via dashboard.

- [ ] **Step 4: Smoke test manual**

```bash
curl -X POST http://localhost:3000/api/demo/meefi/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hola","session_id":"test1"}'
```

Expected: streaming response de Nelia saludando.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/demo/meefi/chat/route.ts .env.example
git commit -m "feat(meefi): endpoint proxy /api/demo/meefi/chat sobre agent-chat"
```

---

## Task 9: Página /demo/meefi con clon UI + widget

**Files:**
- Create: `src/app/demo/meefi/page.tsx`
- Create: `src/app/demo/meefi/MeefiChatWidget.tsx`
- Create: `src/app/demo/meefi/scenarios.ts`

**Interfaces:**
- Consumes: `POST /api/demo/meefi/chat` (Task 8), assets estáticos en `/public/demo/meefi/`.
- Produces: URL pública `https://centinelia.mx/demo/meefi` para la cita.

- [ ] **Step 1: Escribir scenarios.ts**

```ts
export type Scenario = {
  id: 1 | 2 | 3 | 4;
  user_email: string;
  opening_message: string;
  shortcut_buttons: string[];
};

export const SCENARIOS: Record<number, Scenario> = {
  1: {
    id: 1,
    user_email: 'demo1@meefi.io',
    opening_message: 'Hola, necesito cambiar mi contraseña pero el sistema no me deja.',
    shortcut_buttons: ['Cambiar contraseña', 'No veo mi transferencia', 'Perdí mi 2FA', 'Otra duda'],
  },
  2: {
    id: 2,
    user_email: 'demo3@meefi.io',
    opening_message: 'Transferí 50 mil pesos hace 2 horas y no aparecen. ¿Qué está pasando?',
    shortcut_buttons: ['No veo mi transferencia', 'Cambiar contraseña', 'Perdí mi 2FA', 'Otra duda'],
  },
  3: {
    id: 3,
    user_email: 'demo2@meefi.io',
    opening_message: '¿Cuánto tarda una transferencia SPEI a otro banco?',
    shortcut_buttons: ['Comisiones', 'Tiempos SPEI', 'Cómo cambio contraseña', 'Otra duda'],
  },
  4: {
    id: 4,
    user_email: 'demo2@meefi.io',
    opening_message: 'Perdí mi celular con la app de autenticación. ¿Cómo recupero mi cuenta?',
    shortcut_buttons: ['Perdí mi 2FA', 'Cambiar contraseña', 'No veo mi transferencia', 'Otra duda'],
  },
};
```

- [ ] **Step 2: Escribir page.tsx**

```tsx
import { SCENARIOS } from './scenarios';
import { MeefiChatWidget } from './MeefiChatWidget';

export default function Page({ searchParams }: { searchParams: { scenario?: string } }) {
  const scenarioId = Number(searchParams.scenario ?? 2);
  const scenario = SCENARIOS[scenarioId] ?? SCENARIOS[2];

  return (
    <div className="relative min-h-screen">
      <img
        src="/demo/meefi/meefi-dashboard.png"
        alt=""
        className="fixed inset-0 w-full h-full object-cover object-top opacity-95"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent to-black/5" />
      <MeefiChatWidget scenario={scenario} />
    </div>
  );
}
```

- [ ] **Step 3: Escribir MeefiChatWidget.tsx**

Widget con:
- Estado cerrado: burbuja circular abajo-derecha, avatar Nelia, badge "Asistente" al hover.
- Estado abierto: panel 380x600px, header con nombre "Nelia · Asistente Meefi · en línea", chat body scrolleable, botones rápidos arriba del input, input libre.
- Streaming SSE del endpoint proxy.
- Upload de imágenes para el bloque 4 (INE, selfie) — usar `<input type="file" accept="image/*" />` y anexar como texto "[Adjunto: filename]" al mensaje (la implementación real de attachments queda como narrativa en la demo).

**Colores Meefi (no Centinelia):** revisar en el screenshot dashboard qué paleta usan; si morado/azul, matchear. Fallback: azul `#2E5BFF` con acento verde.

**Copy:**
- Placeholder input: "Escribe tu mensaje"
- Header: "Nelia · Asistente Meefi"
- Estado: "en línea"
- Botón cerrar: icono X sin texto.

Sin la palabra "IA" ni emojis per constraints globales.

Componente completo (~200 líneas). Estructura:

```tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import type { Scenario } from './scenarios';

export function MeefiChatWidget({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`demo_${Date.now()}`);

  async function send(text: string) {
    if (!text.trim()) return;
    setMessages(m => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    setMessages(m => [...m, { role: 'assistant', content: '' }]);

    const res = await fetch('/api/demo/meefi/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        scenario: scenario.id,
        user_email: scenario.user_email,
        session_id: sessionId.current,
      }),
    });

    // Consumir stream y actualizar último mensaje del assistant
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value);
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: acc };
        return copy;
      });
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-[#2E5BFF] shadow-2xl overflow-hidden"
        aria-label="Abrir asistente"
      >
        <img src="/meerkats/nelia-avatar.png" alt="" className="w-full h-full object-cover" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[380px] h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 p-4 bg-[#2E5BFF] text-white">
        <img src="/meerkats/nelia-avatar.png" alt="" className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <div className="font-semibold">Nelia</div>
          <div className="text-xs opacity-80">Asistente Meefi · en línea</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-neutral-500">
            Hola, soy Nelia. ¿En qué te ayudo hoy?
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user' ? 'text-right' : 'text-left'}
          >
            <div
              className={
                m.role === 'user'
                  ? 'inline-block bg-[#2E5BFF] text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%]'
                  : 'inline-block bg-neutral-100 rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] whitespace-pre-wrap'
              }
            >
              {m.content || (loading && i === messages.length - 1 ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 p-2 flex-wrap border-t">
        {scenario.shortcut_buttons.map(b => (
          <button
            key={b}
            onClick={() => send(b)}
            className="text-xs px-3 py-1 rounded-full border border-neutral-300 hover:bg-neutral-50"
          >
            {b}
          </button>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 border-t"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Escribe tu mensaje"
          className="flex-1 px-3 py-2 rounded-full border border-neutral-300 outline-none focus:border-[#2E5BFF]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-full bg-[#2E5BFF] text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Bajar/preparar fondo dashboard Meefi**

Si Gera mandó screenshot → `public/demo/meefi/meefi-dashboard.png`. Si no → capturar screenshot público de `meefi.io` + collage vista logueada creíble.

- [ ] **Step 5: Preparar avatar Nelia**

Usar imagen existente si ya está en `public/meerkats/nelia-avatar.png`. Si no, generar con estética [[feedback-meerkats-estetica-1prenda-1herramienta]] (blusa morada + audífono con mic).

- [ ] **Step 6: Smoke local**

```bash
pnpm dev
```

Abrir `http://localhost:3000/demo/meefi?scenario=2`. Verificar:
- Fondo simula meefi.io.
- Burbuja abajo-derecha.
- Click abre panel.
- Escribir mensaje regresa respuesta streamed.

- [ ] **Step 7: Commit**

```bash
git add src/app/demo/meefi/
git commit -m "feat(meefi): página demo /demo/meefi con clon UI + widget chat Nelia"
```

---

## Task 10: KB operativa Nelia (reglas escalamiento + guiones)

**Files:**
- Create: `demos/meefi-gac/22-kb-nelia-meefi.md`
- Modify: DB row `voice_agents` de Nelia → columna `role_knowledge_base`.

**Interfaces:**
- Consumes: agent_id Nelia (Task 2).
- Produces: Nelia con instrucciones operativas exhaustivas para los 4 bloques.

- [ ] **Step 1: Escribir KB operativa**

`demos/meefi-gac/22-kb-nelia-meefi.md`. Secciones:

1. **Identidad y tono** — Nelia es asistente de Meefi, tuteo suave estilo MTY, sin decir "IA", sin em-dash, sin emojis.
2. **Cuándo escalar y con quién**:
   - Cuentas, docs, KYC, verificación identidad → `escalate_to_human topic=cuentas_docs` (Ashley).
   - Transferencias con más de 4h sin reflejar, urgencia declarada por usuario → `topic=transferencia_urgente` (Emilio).
   - Bugs plataforma, errores UI, "no me deja entrar" → `topic=bug_plataforma` (Jaime).
   - 2FA/passkey perdido con evidencia completa → `topic=recovery_2fa` (Ashley).
   - Todo lo demás no clasificable → `topic=otro` (Gera).
3. **Cuándo NO escalar**:
   - Info pública que está en Help Center → responder con `search_help_center`.
   - Password reset simple (cuenta verificada) → `send_password_reset_link`.
   - Consulta de estado transferencia < 4h sin urgencia → `check_transfer_status` + explicación.
4. **Guion 2FA recovery step-by-step**:
   1. Pedir user_id o email.
   2. Llamar `initiate_2fa_recovery`.
   3. Pedir los 4 documentos uno por uno con explicación de cada uno.
   4. Cuando estén los 4, resumir y llamar `escalate_to_human` con `evidence_urls` (o "adjuntos capturados en chat" si no hay URLs reales) y `hypothesis`.
5. **Límites**:
   - NO afirmar montos exactos si el lookup regresó error.
   - NO prometer tiempos SLA fuera de rango (SPEI ≤4h, verificación docs ≤24h).
   - NO ofrecer reembolsos, comisiones especiales, o cambios de plan.
   - NO decir "IA" en el chat visible.
6. **Copy de saludo, despedida, no entendí**.

- [ ] **Step 2: Cargar a DB**

Vía Supabase MCP o script:

```sql
UPDATE voice_agents
SET role_knowledge_base = '<contenido del md como string>'
WHERE id = '<MEEFI_NELIA_AGENT_ID>';
```

- [ ] **Step 3: Verificar en portal**

`https://centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados/nelia` → tab knowledge base debe reflejar el texto.

- [ ] **Step 4: Commit**

```bash
git add demos/meefi-gac/22-kb-nelia-meefi.md
git commit -m "docs(meefi): KB operativa Nelia con reglas escalamiento + guiones"
```

---

## Task 11: Ingesta KB pública Help Center meefi.io

**Files:**
- Create: `scripts/meefi/ingest-help-center.ts`
- Migración SQL para `search_meefi_help_center` RPC (si no existe función search similar reutilizable).

**Interfaces:**
- Consumes: URLs públicas del Help Center meefi.io.
- Produces: rows en tabla `knowledge_base_articles` (o equivalente) asociadas a org Meefi, indexadas para RPC `search_meefi_help_center(q, top_k)`.

- [ ] **Step 1: Inspeccionar tabla existente**

```bash
```
Vía Supabase MCP `list_tables` para ver si ya hay tabla `knowledge_base_articles` o similar. Si existe, reutilizar. Si no, crear migración.

- [ ] **Step 2: Recolectar URLs Help Center**

Nazre revisa `meefi.io/help` (o dominio equivalente Intercom, típicamente `<workspace>.intercom-help.com`) y arma lista de 15-25 artículos relevantes:
- SPEI tiempos y comisiones.
- Cambio de contraseña.
- 2FA (activar, recuperar).
- Verificación KYC.
- Transferencias internas vs externas.
- Depósitos y retiros.
- Reportar problemas.
- Cuentas empresariales vs personales.
- Cambios de método de autenticación.

Guardar lista en `scripts/meefi/help-center-urls.txt`.

- [ ] **Step 3: Escribir script scraper**

```ts
// scripts/meefi/ingest-help-center.ts
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function fetchArticle(url: string) {
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim();
  const body = $('article, .article-content, main').first().text().trim();
  return { title, body, source_url: url };
}

async function main() {
  const urls = readFileSync('scripts/meefi/help-center-urls.txt', 'utf8')
    .split('\n')
    .filter(Boolean);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const orgId = process.env.MEEFI_ORG_ID!;

  for (const url of urls) {
    try {
      const a = await fetchArticle(url);
      await supabase.from('knowledge_base_articles').insert({
        org_id: orgId,
        title: a.title,
        body: a.body,
        source_url: a.source_url,
        source: 'meefi_help_center',
      });
      console.log('OK', a.title);
    } catch (e) {
      console.error('FAIL', url, e);
    }
  }
}

main();
```

**Fallback si Intercom bloquea scraping:** Nazre copia-pega manualmente los 15-25 títulos+cuerpos en un JSON y el script los inserta desde ahí.

- [ ] **Step 4: RPC search**

Si no existe, crear vía migración:

```sql
CREATE OR REPLACE FUNCTION search_meefi_help_center(q text, top_k int DEFAULT 3)
RETURNS TABLE (title text, snippet text, source_url text) AS $$
  SELECT title,
         substring(body from 1 for 240) as snippet,
         source_url
  FROM knowledge_base_articles
  WHERE source = 'meefi_help_center'
    AND (title ILIKE '%' || q || '%' OR body ILIKE '%' || q || '%')
  ORDER BY (
    CASE WHEN title ILIKE '%' || q || '%' THEN 2 ELSE 0 END
    + CASE WHEN body ILIKE '%' || q || '%' THEN 1 ELSE 0 END
  ) DESC
  LIMIT top_k;
$$ LANGUAGE sql;
```

Search puede mejorarse con full-text index después, para la demo con ILIKE alcanza.

- [ ] **Step 5: Correr ingesta**

```bash
pnpm tsx scripts/meefi/ingest-help-center.ts
```

Verificar counts: `SELECT count(*) FROM knowledge_base_articles WHERE source='meefi_help_center'` → esperado ≥15.

- [ ] **Step 6: Smoke tool**

```bash
curl -X POST http://localhost:3000/api/demo/meefi/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"cuánto tarda una SPEI","scenario":3,"user_email":"demo2@meefi.io","session_id":"kb1"}'
```

Expected: Nelia llama `search_help_center` y regresa artículo con cita.

- [ ] **Step 7: Commit**

```bash
git add scripts/meefi/ingest-help-center.ts scripts/meefi/help-center-urls.txt supabase/migrations/*_meefi_help_center_search.sql
git commit -m "feat(meefi): script ingesta Help Center + RPC search"
```

---

## Task 12: Pool grant inicial + verificar cobros

**Files:**
- Create: `scripts/meefi/pool-grant.ts`

**Interfaces:**
- Consumes: org Meefi id.
- Produces: grant grande en `ops_ledger` para sobrevivir dry runs sin agotar pool.

- [ ] **Step 1: Verificar saldo actual pool Meefi**

Vía Supabase MCP:
```sql
SELECT get_pool_balance('<meefi_org_id>');
```

- [ ] **Step 2: Escribir + correr grant**

```ts
// scripts/meefi/pool-grant.ts
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const orgId = process.env.MEEFI_ORG_ID!;
  await s.from('ops_ledger').insert({
    org_id: orgId,
    kind: 'grant',
    tareas: 1000,
    minutes: 300,
    note: 'Demo Meefi 15-sept: grant artificial pre-dry-runs',
  });
  console.log('Grant aplicado');
}
main();
```

**Nota:** revisar el shape real de `ops_ledger` en la codebase — puede llamarse `pool_ledger` o tener columnas distintas.

```bash
pnpm tsx scripts/meefi/pool-grant.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/meefi/pool-grant.ts
git commit -m "feat(meefi): script grant inicial pool para dry runs"
```

---

## Task 13: Screenshots Intercom mock (4)

**Files:**
- Create: `public/demo/meefi/intercom-mock-{1,2,3,4}.png`
- Create: `apps/centinelia/tools/intercom-mock-generator.html` (opcional, HTML→screenshot)

**Interfaces:**
- Produces: 4 imágenes usables en el guion, cada una simulando cómo respondería Intercom hoy.

- [ ] **Step 1: Referencia visual Intercom**

Nazre pide a Gera screenshot real del chatbot Intercom actual (con datos borrados) para calibrar look. Fallback: buscar screenshots públicos de Intercom Fin chat.

- [ ] **Step 2: Generar cada mock**

Vía HTML → screenshot con Puppeteer o Playwright, o directamente en Figma. Contenido de cada mock:

- `intercom-mock-1.png` — respuesta a "no puedo cambiar contraseña": "Aquí tienes el link para restablecer tu contraseña: [link]. Si el problema persiste, contacta soporte."
- `intercom-mock-2.png` — respuesta a "no veo mi transferencia": "Voy a transferirte con un especialista, un momento por favor."
- `intercom-mock-3.png` — respuesta a "cuánto tarda SPEI": "Puedes revisar nuestro Help Center para más información: [link raíz]."
- `intercom-mock-4.png` — respuesta a "perdí mi 2FA": "Voy a transferirte con nuestro equipo de soporte, un momento."

Look: chat blanco, mensajes usuario derecha azul Intercom (#0057FF), bot izquierda gris. Firma "Intercom · Meefi Bot".

- [ ] **Step 3: Guardar assets**

```
public/demo/meefi/intercom-mock-1.png
public/demo/meefi/intercom-mock-2.png
public/demo/meefi/intercom-mock-3.png
public/demo/meefi/intercom-mock-4.png
```

- [ ] **Step 4: Commit**

```bash
git add public/demo/meefi/intercom-mock-*.png
git commit -m "feat(meefi): 4 screenshots Intercom mock para contraste narrativo"
```

---

## Task 14: Slack mock composite

**Files:**
- Create: `public/demo/meefi/slack-mock.png`

**Interfaces:**
- Produces: 1 imagen del canal `#soporte-meefi` mostrando el resumen ejecutivo que llegaría después de escalamiento.

- [ ] **Step 1: Diseñar composite**

Layout: header Slack workspace "Meefi", canal `#soporte-meefi`, mensaje bot con avatar Nelia, contenido = mismo resumen ejecutivo del correo pero adaptado a formato Slack (bullets, thread reply de Emilio "yo tomo esto").

- [ ] **Step 2: Guardar**

```
public/demo/meefi/slack-mock.png
```

- [ ] **Step 3: Commit**

```bash
git add public/demo/meefi/slack-mock.png
git commit -m "feat(meefi): Slack mock composite para narrativa handoff"
```

---

## Task 15: Guion 13b nuevo

**Files:**
- Create: `demos/meefi-gac/13b-guion-detallado-15-sept-nelia.md`

**Interfaces:**
- Consumes: spec + bloques 1-4 + Niva recortado.
- Produces: guion verbatim Nazre-lee para los 45-50 minutos de la cita.

- [ ] **Step 1: Escribir guion completo**

Estructura per spec §4 "Guion narrativo":

- **Apertura (5 min)** — texto verbatim referenciando el intel discovery.
- **Beat 0** — captura de contexto (url `/demo/meefi?scenario=2` precargada).
- **Bloque 1 (8 min)** — texto Nazre + acciones + fallbacks. Screenshot Intercom mock 1 mostrado 3s antes.
- **Bloque 2 (10 min, HERO)** — igual, con mock 2.
- **Bloque 3 (5 min)** — igual, con mock 3.
- **Bloque 4 (10 min)** — igual, con mock 4. Termina con Slack mock 5s.
- **Bloque Niva (5 min)** — pivote + escenario compliance recortado.
- **Cierre (5 min)** — pricing (referencia [[project-centinelia-pricing]]), próximos pasos, pregunta owner operativo.

Formato heredado de `13a-guion-detallado-15-sept.md` (Nazre verbatim + acciones + fallbacks + timings).

- [ ] **Step 2: Commit**

```bash
git add demos/meefi-gac/13b-guion-detallado-15-sept-nelia.md
git commit -m "docs(meefi): guion detallado 13b para cita 15-sept con Nelia hero"
```

---

## Task 16: Runbook dry run 21

**Files:**
- Create: `demos/meefi-gac/21-dry-run-runbook-nelia.md`

**Interfaces:**
- Consumes: guion 13b + criterios pass/fail per spec §runbook.
- Produces: checklist ejecutable para dry runs.

- [ ] **Step 1: Escribir runbook**

Estructura heredada de `20-*` runbook. Secciones:

1. **Pre-flight** (5 min): saldo pool, `MEEFI_NELIA_AGENT_ID` en env, KB cargada, aliases Gmail funcionando.
2. **Bloque 1** — pasos, expected, criterio pass/fail.
3. **Bloque 2** — igual.
4. **Bloque 3** — igual.
5. **Bloque 4** — igual, verificar correo real llega en ≤10s.
6. **Bloque Niva** — verificar memo estructurado sin invento.
7. **Post-flight** — plantilla de gaps (bloque, tipo, severidad, hipótesis, fix propuesto).

Regla dura del runbook: si un escenario falla, anotar y seguir, no calibrar en el momento.

- [ ] **Step 2: Commit**

```bash
git add demos/meefi-gac/21-dry-run-runbook-nelia.md
git commit -m "docs(meefi): runbook dry run 21 para demo 15-sept Nelia"
```

---

## Task 17: Dry run corrida 1 (viernes 12-sept) + calibración batch

**Files:**
- Reporte gaps en `demos/meefi-gac/22-gaps-dry-run-1.md`

**Interfaces:**
- Consumes: runbook 21, entorno demo completo.
- Produces: lista de gaps consolidados para calibración batch.

- [ ] **Step 1: Nazre corre el runbook completo**

60-90 min. Anota cada gap sin calibrar en el momento.

- [ ] **Step 2: Consolidar gaps**

Formato:

```md
| Bloque | Tipo | Severidad | Hipótesis | Fix propuesto |
```

- [ ] **Step 3: Claude aplica calibración batch**

Categorías esperadas:
- KB operativa Nelia: agregar reglas nuevas si escaló mal.
- Tool descriptions: rewriting si el LLM llamó tools equivocados.
- Fixture data: agregar variantes si un caso no se cubrió.
- UI widget: bugs visuales.

Cada fix es un commit atómico.

- [ ] **Step 4: Commit gaps report + fixes**

```bash
git add demos/meefi-gac/22-gaps-dry-run-1.md
git commit -m "docs(meefi): gaps consolidados dry run 1 + calibraciones aplicadas"
```

---

## Task 18: Dry run corrida 2 + Loom fallback (sábado 13-sept)

**Files:**
- Loom videos: subir a Loom, guardar URLs en `demos/meefi-gac/23-loom-fallback-urls.md`.

**Interfaces:**
- Consumes: entorno calibrado post-corrida 1.
- Produces: verificación final + backup video por si algo falla en vivo el lunes.

- [ ] **Step 1: Nazre corre runbook nuevamente**

Debería pasar limpio. Si aparecen gaps residuales, Claude aplica micro-fixes.

- [ ] **Step 2: Grabar Loom por bloque**

5 videos cortos (2-3 min c/u): uno por bloque + Niva. Guardar URLs.

- [ ] **Step 3: Commit URLs**

```bash
git add demos/meefi-gac/23-loom-fallback-urls.md
git commit -m "docs(meefi): Loom fallback URLs post-dry-run 2"
```

---

## Task 19: Buffer + confirmación cita (domingo 14-sept)

**Files:**
- Correo Nazre a Gera desde Gmail.

**Interfaces:**
- Produces: cita confirmada.

- [ ] **Step 1: Correo confirmación**

Contenido:
- Confirmar hora, lugar, dirección.
- Quién opera pantalla (Nazre).
- Duración estimada (60 min + Q&A).
- Preguntar si Alan y Emilio asisten.
- No WhatsApp.

- [ ] **Step 2: Buffer día**

Si aparece algo roto: Claude arregla, Nazre valida. Si nada, día de descanso.

---

## Task 20: Cita 15-sept

- [ ] **Step 1: 7:30 AM** — enviar manual correo Nova consolidado si aplica (el guion nuevo puede no necesitarlo).
- [ ] **Step 2: Llegar 15 min antes**, setup laptop + hotspot.
- [ ] **Step 3: Correr guion 13b**.
- [ ] **Step 4: Post-cita** — correo de gracias + siguiente paso + owner operativo confirmado.

---

## Self-Review notes

**Spec coverage check:**
- ✅ Provisioning Nelia — Task 2.
- ✅ 7 tools — Tasks 4-6.
- ✅ Registration 3 canales — Task 7.
- ✅ Endpoint proxy — Task 8.
- ✅ UI clon meefi.io — Task 9.
- ✅ KB operativa — Task 10.
- ✅ Ingesta Help Center — Task 11.
- ✅ Pool grant — Task 12.
- ✅ Screenshots Intercom — Task 13.
- ✅ Slack mock — Task 14.
- ✅ Guion 13b — Task 15.
- ✅ Runbook 21 — Task 16.
- ✅ Dry runs — Tasks 17-18.
- ✅ Correo confirmación — Task 19.
- ✅ Cita — Task 20.
- ✅ Discovery correo Gera (Task 1) cubre gap del spec sobre "docs extras + confirmación nombres".

**Type consistency:** `MeefiUser`, `MeefiTransfer`, `EscalationTopic`, `EscalationPriority` definidos en Tasks 3 y 6, usados consistentemente en Tasks 4-8.

**Regla de corte martes 11 noche:** bloque 4 (2FA recovery) es el que se descarta si el chat no está andando end-to-end. Documentado en Global Constraints y spec §guion.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-10-demo-meefi-nelia-soporte.md`. Dos opciones de ejecución:**

1. **Subagent-Driven (recomendado)** — dispatch fresh subagent por task, review entre tasks, iteración rápida. Óptimo para runway de 5 días.

2. **Inline Execution** — ejecutar tasks en esta sesión con checkpoints. Más lento pero contexto único.

**¿Cuál?**
