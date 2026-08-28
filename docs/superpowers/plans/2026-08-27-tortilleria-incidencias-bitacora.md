# Tortillería Incidencias + Bitácora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar Noah (ventas) por Nia (recepcionista) en Tortillería Estrella y darle a Nia el flow completo: capturar quejas de tienditas en llamada entrante → mandar correo tarjeta al encargado → agendar callback de verificación a +3d → mostrar bitácora semanal en portal con export a Excel.

**Architecture:** Nueva tabla `client_incidents` + 2 tools nuevas (`registrar_incidencia`, `verificar_recepcion_incidencia`) registradas en los 3 canales via `registry.ts` y `executor.ts`. Template HTML de correo tarjeta puro (sin JSX-email). Cron reutiliza `outbound_contacts` con nuevo `source='auto_incident_verification'`. Directory obtiene flag opcional `receives_incident_reports` (JSONB, sin migration). Nueva página `/oficina/bitacora` server+client con export via `exceljs`. Feature-gated con `features.incidencia_flow_enabled` (default false, ON solo en Tortillería Estrella). Swap Noah→Nia via script one-shot que actualiza row + resincroniza Vapi.

**Tech Stack:** TypeScript, Next.js 15 (app router), Supabase Postgres, Vapi tool API, Anthropic SDK, ElevenLabs voice, Resend email, exceljs para export, Vitest para unit tests.

**Spec:** `docs/superpowers/specs/2026-08-27-tortilleria-incidencias-bitacora-design.md`

## Global Constraints

- Todo cambio TS debe pasar `npx tsc --noEmit` en cada commit.
- `registrar_incidencia` y `verificar_recepcion_incidencia` DEBEN estar registradas en los 3 canales (voice, chat, email) en `registry.ts` — regla del brain (`policies/tool-completeness.md`).
- Feature flag `incidencia_flow_enabled` debe estar en `organizations.features` JSONB. Sin nueva columna.
- No modificar `registrar_pedido` — sigue vivo para otras orgs. Solo se oculta de Tortillería Estrella al swappear a Nia + feature flag.
- Idioma: nombres de tools en español (política del brain).
- E.164 obligatorio para teléfonos — usar `validatePhoneOrThrow` de `src/lib/leads/dedup.ts`.
- Cuando se toque `MEERKAT_MAP.nia.promptPersonalidad`, la sección de incidencias debe ser condicional a que la tool esté disponible (no romper Nias de otras orgs).
- Cada task cierra con `npx tsc --noEmit` verde + commit.
- Rebase antes de merge (política brain).

## File Structure

**Nuevos archivos:**
- `supabase/migrations/20260827120000_create_client_incidents.sql` — tabla + índices.
- `src/lib/tools/executors/registrar-incidencia.ts` — executor puro.
- `src/lib/tools/executors/verificar-recepcion-incidencia.ts` — executor puro.
- `src/lib/tools/executors/__tests__/registrar-incidencia.test.ts` — unit tests.
- `src/lib/incidents/email-template.ts` — `renderIncidentCardEmail`.
- `src/lib/incidents/__tests__/email-template.test.ts` — snapshot test.
- `src/lib/incidents/directory.ts` — helper `resolveIncidentRecipient(directory) → { email, name } | null`.
- `src/lib/incidents/finalize-pending.ts` — helper `finalizeIncidentIfPending(incidentId)` invocado al agotar retries.
- `src/lib/incidents/scheduling.ts` — `upsertFollowupContactForIncident`.
- `src/app/api/voice/tools/registrar-incidencia/route.ts` — endpoint Vapi.
- `src/app/api/voice/tools/verificar-recepcion-incidencia/route.ts` — endpoint Vapi.
- `src/app/portal/[token]/oficina/bitacora/page.tsx` — server component.
- `src/app/portal/[token]/oficina/bitacora/BitacoraClient.tsx` — client component.
- `src/app/portal/[token]/oficina/bitacora/loadBitacoraData.ts` — data loader.
- `src/app/api/portal/[token]/oficina/bitacora/vendedor/route.ts` — PATCH endpoint editable vendedor.
- `src/app/api/portal/[token]/oficina/bitacora/export/route.ts` — GET endpoint exceljs.
- `scripts/swap-tortilleria-to-nia.ts` — one-shot swap.
- `scripts/enable-incidencia-flow.ts` — one-shot feature flag ON para Tortillería Estrella.
- `scripts/e2e-test-incidencia-flow.ts` — E2E validation en org de test.

**Modificados:**
- `src/lib/helpdesk/folio.ts` — agregar `receives_incident_reports?: boolean` al `DirectoryPerson` interface.
- `src/lib/tools/registry.ts` — agregar 2 entries nuevas (`registrar_incidencia`, `verificar_recepcion_incidencia`).
- `src/lib/tools/executor.ts` — agregar 2 cases nuevos.
- `src/lib/tools/schemas.ts` — agregar JSON schemas de las 2 tools (para Anthropic + Vapi).
- `src/lib/portal/meerkat-roles.ts` — actualizar `MEERKAT_MAP.nia.promptPersonalidad` con bloque condicional de incidencias + agregar tool `registrar_incidencia` a `features.outbound_capabilities` o similar.
- `src/lib/vapi/sync.ts` — asegurar que `registrar_incidencia` genera tool def cuando la feature está activa (si el filtro por `gatedByFeature` ya cubre esto, sin cambios).
- `src/components/portal/DirectoryEditor.tsx` — agregar checkbox "Recibe reportes de incidencias".
- `package.json` — agregar `exceljs` si no está.

---

### Task 1: DB migration — `client_incidents` + índices

**Files:**
- Create: `supabase/migrations/20260827120000_create_client_incidents.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `client_incidents` con columnas del spec §1.

- [ ] **Step 1: Escribir migration**

```sql
-- supabase/migrations/20260827120000_create_client_incidents.sql
CREATE TABLE client_incidents (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                  UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email              TEXT NOT NULL,

  business_name             TEXT NOT NULL,
  contact_name              TEXT,
  contact_phone             TEXT NOT NULL,
  address                   TEXT NOT NULL,
  motivo                    TEXT NOT NULL,

  source_channel            TEXT NOT NULL,
  source_call_id            UUID REFERENCES voice_calls(id),
  is_new_client             BOOLEAN NOT NULL DEFAULT false,

  encargado_email           TEXT,
  encargado_name            TEXT,
  email_sent_at             TIMESTAMPTZ,
  email_confirmed_at        TIMESTAMPTZ,

  verification_scheduled_at TIMESTAMPTZ NOT NULL,
  verification_outbound_id  UUID REFERENCES outbound_contacts(id),
  verification_called_at    TIMESTAMPTZ,
  verification_result       TEXT CHECK (verification_result IN ('ok','no_visitado','sin_respuesta')),
  verification_result_notes TEXT,

  vendedor                  TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_incidents_agent_created
  ON client_incidents(agent_id, created_at DESC);

CREATE INDEX idx_client_incidents_verification_pending
  ON client_incidents(verification_scheduled_at)
  WHERE verification_result IS NULL;

CREATE INDEX idx_client_incidents_portal_email_created
  ON client_incidents(portal_email, created_at DESC);
```

- [ ] **Step 2: Aplicar migration en local**

Run: `npx supabase db push` (o `psql $DATABASE_URL -f supabase/migrations/20260827120000_create_client_incidents.sql` si Nazre no usa supabase CLI).
Expected: sin errores, tabla creada.

- [ ] **Step 3: Verificar tabla**

Run:
```bash
psql $DATABASE_URL -c "\d client_incidents"
```
Expected: listar columnas + índices creados.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260827120000_create_client_incidents.sql
git commit -m "feat(incidents): add client_incidents table for tortillería flow"
```

---

### Task 2: `DirectoryPerson` type — flag `receives_incident_reports`

**Files:**
- Modify: `src/lib/helpdesk/folio.ts` (agregar campo al interface)

**Interfaces:**
- Consumes: nada.
- Produces: `DirectoryPerson.receives_incident_reports?: boolean`.

- [ ] **Step 1: Leer interface actual**

Run: leer `src/lib/helpdesk/folio.ts` líneas 42-70 (o donde esté `DirectoryPerson`).

- [ ] **Step 2: Agregar campo**

Modificar interface agregando después de `is_operations_contact?: boolean;`:

```typescript
receives_incident_reports?: boolean;
```

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/helpdesk/folio.ts
git commit -m "feat(directory): add receives_incident_reports flag to DirectoryPerson"
```

---

### Task 3: Helper `resolveIncidentRecipient` + tests

**Files:**
- Create: `src/lib/incidents/directory.ts`
- Test: `src/lib/incidents/__tests__/directory.test.ts`

**Interfaces:**
- Consumes: `DirectoryPerson` type de `src/lib/helpdesk/folio.ts`.
- Produces:
  - `function resolveIncidentRecipient(directory: DirectoryPerson[]): { email: string; name: string } | null` — retorna la primera persona con `receives_incident_reports=true && email && phone`. Si no hay, retorna `null`.

- [ ] **Step 1: Escribir test que falla**

```typescript
// src/lib/incidents/__tests__/directory.test.ts
import { describe, it, expect } from 'vitest';
import { resolveIncidentRecipient } from '../directory';
import type { DirectoryPerson } from '../../helpdesk/folio';

describe('resolveIncidentRecipient', () => {
  it('returns null when directory is empty', () => {
    expect(resolveIncidentRecipient([])).toBeNull();
  });

  it('returns null when no person has flag', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Alice', phone: '+521', email: 'a@x.com', is_operations_contact: true },
    ];
    expect(resolveIncidentRecipient(dir)).toBeNull();
  });

  it('returns null when flagged person has no email', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Bob', phone: '+521', receives_incident_reports: true },
    ];
    expect(resolveIncidentRecipient(dir)).toBeNull();
  });

  it('returns first person with flag+email', () => {
    const dir: DirectoryPerson[] = [
      { id: '1', name: 'Alice', phone: '+521', email: 'a@x.com' },
      { id: '2', name: 'Bob', phone: '+522', email: 'b@x.com', receives_incident_reports: true },
      { id: '3', name: 'Carol', phone: '+523', email: 'c@x.com', receives_incident_reports: true },
    ];
    expect(resolveIncidentRecipient(dir)).toEqual({ email: 'b@x.com', name: 'Bob' });
  });
});
```

- [ ] **Step 2: Correr test para verificar que falla**

Run: `npx vitest run src/lib/incidents/__tests__/directory.test.ts`
Expected: FAIL — módulo `../directory` no existe.

- [ ] **Step 3: Implementación mínima**

```typescript
// src/lib/incidents/directory.ts
import type { DirectoryPerson } from '../helpdesk/folio';

export function resolveIncidentRecipient(
  directory: DirectoryPerson[],
): { email: string; name: string } | null {
  for (const p of directory) {
    if (p.receives_incident_reports && p.email) {
      return { email: p.email, name: p.name };
    }
  }
  return null;
}
```

- [ ] **Step 4: Correr test — debe pasar**

Run: `npx vitest run src/lib/incidents/__tests__/directory.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/incidents/directory.ts src/lib/incidents/__tests__/directory.test.ts
git commit -m "feat(incidents): add resolveIncidentRecipient directory helper"
```

---

### Task 4: `renderIncidentCardEmail` template + snapshot test

**Files:**
- Create: `src/lib/incidents/email-template.ts`
- Test: `src/lib/incidents/__tests__/email-template.test.ts`

**Interfaces:**
- Consumes: nada externo.
- Produces:
  - `function renderIncidentCardEmail(input: { businessName: string; contactName?: string | null; contactPhone: string; address: string; motivo: string; capturedAt: Date; agentDisplayName: string; }): { subject: string; html: string }` — replica formato tarjeta amarilla de los screenshots.

- [ ] **Step 1: Escribir snapshot test**

```typescript
// src/lib/incidents/__tests__/email-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderIncidentCardEmail } from '../email-template';

describe('renderIncidentCardEmail', () => {
  const base = {
    businessName: 'ABARROTES CHARRO',
    contactName: 'HECTOR CORONEL',
    contactPhone: '+528126752468',
    address: 'MAYA 766 X CON ATOMI, FRACC. LOS MORALES 2DO SECTOR, SAN NICOLAS',
    motivo: 'Iba el vendedor 3 veces a la semana y ahora solo 1, se queda sin producto.',
    capturedAt: new Date('2026-08-27T10:07:00-06:00'),
    agentDisplayName: 'Nia · Tortillería Estrella',
  };

  it('subject includes business + fecha', () => {
    const { subject } = renderIncidentCardEmail(base);
    expect(subject).toContain('ABARROTES CHARRO');
    expect(subject).toMatch(/27.*ago.*26|2026-08-27/);
  });

  it('html contains all 6 fields', () => {
    const { html } = renderIncidentCardEmail(base);
    expect(html).toContain('FECHA');
    expect(html).toContain('HORA');
    expect(html).toContain('NOMBRE DEL NEGOCIO');
    expect(html).toContain('DIRECCIÓN');
    expect(html).toContain('MOTIVO');
    expect(html).toContain('CONTACTO');
    expect(html).toContain('ABARROTES CHARRO');
    expect(html).toContain('HECTOR CORONEL');
    expect(html).toContain('8126752468');
    expect(html).toContain('MAYA 766');
  });

  it('html has yellow header cells (matches screenshots)', () => {
    const { html } = renderIncidentCardEmail(base);
    expect(html).toMatch(/background(-color)?:\s*#f9e04c|#ffe066|#fff566/i);
  });

  it('handles null contactName', () => {
    const { html } = renderIncidentCardEmail({ ...base, contactName: null });
    expect(html).toContain('+528126752468');
    expect(html).not.toContain('null');
  });
});
```

- [ ] **Step 2: Run tests — deben fallar**

Run: `npx vitest run src/lib/incidents/__tests__/email-template.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar template**

```typescript
// src/lib/incidents/email-template.ts
interface IncidentEmailInput {
  businessName:     string;
  contactName?:     string | null;
  contactPhone:     string;
  address:          string;
  motivo:           string;
  capturedAt:       Date;
  agentDisplayName: string;
}

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatFecha(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

function formatHora(d: Date): string {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function contactoLine(name: string | null | undefined, phone: string): string {
  const cleaned = phone.replace(/^\+52/, '');
  return name ? `${name} - ${cleaned}` : cleaned;
}

export function renderIncidentCardEmail(input: IncidentEmailInput): { subject: string; html: string } {
  const fecha    = formatFecha(input.capturedAt);
  const hora     = formatHora(input.capturedAt);
  const contacto = contactoLine(input.contactName, input.contactPhone);
  const subject  = `Reporte de incidencia — ${input.businessName} (${fecha})`;
  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 16px 0; color: #333;">
    Se registró una incidencia de cliente. Detalles a continuación:
  </p>
  <table border="1" cellspacing="0" cellpadding="10" style="border-collapse: collapse; width: 100%; border-color: #ccc;">
    <tr><td style="background-color: #f9e04c; font-weight: bold; width: 35%;">FECHA</td><td>${fecha}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">HORA</td><td>${hora}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">NOMBRE DEL NEGOCIO</td><td>${input.businessName}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">DIRECCIÓN</td><td>${input.address}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">MOTIVO</td><td>${input.motivo}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">CONTACTO</td><td>${contacto}</td></tr>
    <tr><td style="background-color: #f9e04c; font-weight: bold;">VENDEDOR</td><td>&nbsp;</td></tr>
  </table>
  <p style="margin: 16px 0 0 0; color: #666; font-size: 13px;">
    Capturado por ${input.agentDisplayName}. En 3 días se hará llamada de verificación al cliente.
  </p>
</div>`.trim();
  return { subject, html };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/incidents/__tests__/email-template.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/incidents/email-template.ts src/lib/incidents/__tests__/email-template.test.ts
git commit -m "feat(incidents): add renderIncidentCardEmail template"
```

---

### Task 5: `upsertFollowupContactForIncident` scheduling helper

**Files:**
- Create: `src/lib/incidents/scheduling.ts`
- Test: `src/lib/incidents/__tests__/scheduling.test.ts`

**Interfaces:**
- Consumes: infra existente de `outbound_contacts` (Supabase client). Refleja el shape de `upsertFollowupContactForOrder` en `src/lib/leads/dedup.ts`.
- Produces:
  - `async function upsertFollowupContactForIncident(supabase, input: { incidentId: string; agentId: string; telefono: string; motivo: string; scheduledAt: string; portalEmail: string; }): Promise<{ outbound_contact_id: string }>`.

- [ ] **Step 1: Leer patrón existente**

Read `src/lib/leads/dedup.ts` líneas 100-150 (o donde esté `upsertFollowupContactForOrder`) para copiar el patrón.

- [ ] **Step 2: Escribir tests que fallan**

```typescript
// src/lib/incidents/__tests__/scheduling.test.ts
import { describe, it, expect, vi } from 'vitest';
import { upsertFollowupContactForIncident } from '../scheduling';

function mockSupabase(insertReturn: any) {
  const chain: any = {
    from:   vi.fn(() => chain),
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(insertReturn)),
  };
  return chain;
}

describe('upsertFollowupContactForIncident', () => {
  it('inserts row with source=auto_incident_verification', async () => {
    const supabase = mockSupabase({ data: { id: 'oc-1' }, error: null });
    const result = await upsertFollowupContactForIncident(supabase as any, {
      incidentId: 'inc-1',
      agentId: 'agent-1',
      telefono: '+528112345678',
      motivo: 'Reportó que no recibió pedido',
      scheduledAt: '2026-08-30T10:00:00Z',
      portalEmail: 'test@example.com',
    });
    expect(result.outbound_contact_id).toBe('oc-1');
    expect(supabase.insert).toHaveBeenCalled();
    const args = supabase.insert.mock.calls[0][0];
    expect(args.source).toBe('auto_incident_verification');
    expect(args.external_source).toBe('client_incident');
    expect(args.external_id).toBe('inc-1');
  });

  it('throws when insert fails', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'boom' } });
    await expect(upsertFollowupContactForIncident(supabase as any, {
      incidentId: 'inc-1', agentId: 'a', telefono: '+521', motivo: 'x',
      scheduledAt: '2026-08-30T10:00:00Z', portalEmail: 't@x.com',
    })).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 3: Run — fails**

Run: `npx vitest run src/lib/incidents/__tests__/scheduling.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 4: Implementar**

```typescript
// src/lib/incidents/scheduling.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface IncidentFollowupInput {
  incidentId:  string;
  agentId:     string;
  telefono:    string;
  motivo:      string;
  scheduledAt: string;
  portalEmail: string;
}

export async function upsertFollowupContactForIncident(
  supabase: SupabaseClient,
  input: IncidentFollowupInput,
): Promise<{ outbound_contact_id: string }> {
  const row = {
    agent_id:        input.agentId,
    portal_email:    input.portalEmail,
    telefono:        input.telefono,
    motivo:          input.motivo,
    scheduled_at:    input.scheduledAt,
    source:          'auto_incident_verification',
    external_source: 'client_incident',
    external_id:     input.incidentId,
    status:          'pending',
  };
  const { data, error } = await supabase
    .from('outbound_contacts')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`upsertFollowupContactForIncident: ${error.message}`);
  return { outbound_contact_id: data.id };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/incidents/__tests__/scheduling.test.ts`
Expected: PASS 2/2.

- [ ] **Step 6: Commit**

```bash
git add src/lib/incidents/scheduling.ts src/lib/incidents/__tests__/scheduling.test.ts
git commit -m "feat(incidents): add upsertFollowupContactForIncident scheduling helper"
```

---

### Task 6: Executor `registrarIncidencia` + tests

**Files:**
- Create: `src/lib/tools/executors/registrar-incidencia.ts`
- Test: `src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`

**Interfaces:**
- Consumes: `resolveIncidentRecipient` (T3), `renderIncidentCardEmail` (T4), `upsertFollowupContactForIncident` (T5), `sendEmail` de `src/lib/email/send.ts`, `agentBrandedFrom` de mismo módulo, `validatePhoneOrThrow` de `src/lib/leads/dedup.ts`.
- Produces:
  - `async function registrarIncidencia(ctx: ToolExecContext, args: { business_name: string; contact_name?: string; contact_phone: string; address: string; motivo: string; }): Promise<{ ok: true; incident_id: string; email_sent: boolean; verification_at: string }>`.

- [ ] **Step 1: Escribir tests que fallan**

```typescript
// src/lib/tools/executors/__tests__/registrar-incidencia.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registrarIncidencia } from '../registrar-incidencia';

vi.mock('../../../email/send', () => ({
  sendEmail:          vi.fn(() => Promise.resolve({ id: 'msg-1' })),
  agentBrandedFrom:   vi.fn(() => 'Nia <nia@test.mx>'),
}));

vi.mock('../../../incidents/scheduling', () => ({
  upsertFollowupContactForIncident: vi.fn(() => Promise.resolve({ outbound_contact_id: 'oc-1' })),
}));

function makeCtx(overrides = {}) {
  const insertedRow = { id: 'inc-1' };
  const supabase: any = {
    from: vi.fn(() => supabase),
    insert: vi.fn(() => supabase),
    update: vi.fn(() => supabase),
    eq:     vi.fn(() => supabase),
    select: vi.fn(() => supabase),
    single: vi.fn(() => Promise.resolve({ data: insertedRow, error: null })),
  };
  return {
    supabase,
    agent: {
      id: 'agent-1', portal_email: 'test@x.mx', agent_name: 'Nia',
      business_name: 'Tortillería X',
      ...overrides,
    },
    org: {
      directory: [
        { id: 'p1', name: 'Encargado Y', phone: '+528100000000',
          email: 'encargado@x.mx', receives_incident_reports: true },
      ],
    },
    channel: 'voice' as const,
    callId:  'call-1',
  };
}

beforeEach(() => vi.clearAllMocks());

describe('registrarIncidencia', () => {
  it('happy path: inserts incident, sends email, schedules callback', async () => {
    const ctx = makeCtx();
    const res = await registrarIncidencia(ctx as any, {
      business_name: 'Abarrotes X',
      contact_name:  'Doña Meche',
      contact_phone: '8112345678',
      address:       'Calle 1 #100 Col Y',
      motivo:        'No llegó vendedor esta semana',
    });
    expect(res.ok).toBe(true);
    expect(res.incident_id).toBe('inc-1');
    expect(res.email_sent).toBe(true);
    expect(new Date(res.verification_at).getTime()).toBeGreaterThan(Date.now() + 2.5*86400*1000);
  });

  it('when no encargado configured, email_sent=false but flow completes', async () => {
    const ctx = makeCtx();
    ctx.org.directory = [];
    const res = await registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '8112345678', address: 'Y', motivo: 'Z',
    });
    expect(res.ok).toBe(true);
    expect(res.email_sent).toBe(false);
  });

  it('throws on invalid phone', async () => {
    const ctx = makeCtx();
    await expect(registrarIncidencia(ctx as any, {
      business_name: 'X', contact_phone: '123', address: 'Y', motivo: 'Z',
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/tools/executors/registrar-incidencia.ts
import { validatePhoneOrThrow } from '../../leads/dedup';
import { resolveIncidentRecipient } from '../../incidents/directory';
import { renderIncidentCardEmail } from '../../incidents/email-template';
import { upsertFollowupContactForIncident } from '../../incidents/scheduling';
import { sendEmail, agentBrandedFrom } from '../../email/send';

export interface RegistrarIncidenciaArgs {
  business_name: string;
  contact_name?: string;
  contact_phone: string;
  address:       string;
  motivo:        string;
}

const VERIFICATION_DELAY_DAYS = 3;

export async function registrarIncidencia(ctx: any, args: RegistrarIncidenciaArgs) {
  const phone = validatePhoneOrThrow(args.contact_phone);
  const now = new Date();
  const verifyAt = new Date(now.getTime() + VERIFICATION_DELAY_DAYS * 86400 * 1000).toISOString();

  const recipient = resolveIncidentRecipient(ctx.org?.directory ?? []);

  const { data: incidentRow, error: insErr } = await ctx.supabase
    .from('client_incidents')
    .insert({
      agent_id:                  ctx.agent.id,
      portal_email:              ctx.agent.portal_email,
      business_name:             args.business_name,
      contact_name:              args.contact_name ?? null,
      contact_phone:             phone,
      address:                   args.address,
      motivo:                    args.motivo,
      source_channel:            ctx.channel,
      source_call_id:            ctx.callId ?? null,
      encargado_email:           recipient?.email ?? null,
      encargado_name:            recipient?.name ?? null,
      verification_scheduled_at: verifyAt,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`registrar_incidencia insert: ${insErr.message}`);
  const incidentId = incidentRow.id;

  let emailSent = false;
  if (recipient) {
    const { subject, html } = renderIncidentCardEmail({
      businessName:     args.business_name,
      contactName:      args.contact_name ?? null,
      contactPhone:     phone,
      address:          args.address,
      motivo:           args.motivo,
      capturedAt:       now,
      agentDisplayName: `${ctx.agent.agent_name} · ${ctx.agent.business_name ?? ''}`.trim(),
    });
    try {
      await sendEmail({
        to:      recipient.email,
        from:    agentBrandedFrom({ agent: ctx.agent }),
        subject, html,
      });
      await ctx.supabase.from('client_incidents')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', incidentId);
      emailSent = true;
    } catch (err) {
      console.error('registrar_incidencia sendEmail failed:', err);
    }
  }

  const { outbound_contact_id } = await upsertFollowupContactForIncident(ctx.supabase, {
    incidentId,
    agentId:     ctx.agent.id,
    telefono:    phone,
    motivo:      `Verificar si ya recibió pedido reportado el ${now.toLocaleDateString('es-MX')}`,
    scheduledAt: verifyAt,
    portalEmail: ctx.agent.portal_email,
  });
  await ctx.supabase.from('client_incidents')
    .update({ verification_outbound_id: outbound_contact_id })
    .eq('id', incidentId);

  return { ok: true as const, incident_id: incidentId, email_sent: emailSent, verification_at: verifyAt };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/tools/executors/__tests__/registrar-incidencia.test.ts`
Expected: PASS 3/3.

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/executors/registrar-incidencia.ts src/lib/tools/executors/__tests__/registrar-incidencia.test.ts
git commit -m "feat(incidents): add registrarIncidencia executor with 3d verification schedule"
```

---

### Task 7: Executor `verificarRecepcionIncidencia`

**Files:**
- Create: `src/lib/tools/executors/verificar-recepcion-incidencia.ts`
- Test: `src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts`

**Interfaces:**
- Consumes: `ctx.supabase`.
- Produces:
  - `async function verificarRecepcionIncidencia(ctx, args: { incident_id: string; resultado: 'ok'|'no_visitado'|'sin_respuesta'; notas?: string }): Promise<{ ok: true; incident_id: string; verification_result: string }>`.

- [ ] **Step 1: Escribir test que falla**

```typescript
// src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verificarRecepcionIncidencia } from '../verificar-recepcion-incidencia';

function makeCtx() {
  const supabase: any = {
    from: vi.fn(() => supabase),
    update: vi.fn(() => supabase),
    eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return { supabase };
}

describe('verificarRecepcionIncidencia', () => {
  it('updates incident with resultado=ok', async () => {
    const ctx = makeCtx();
    const res = await verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'ok', notas: 'surtido el martes',
    });
    expect(res.ok).toBe(true);
    expect(res.verification_result).toBe('ok');
    const updateArgs = ctx.supabase.update.mock.calls[0][0];
    expect(updateArgs.verification_result).toBe('ok');
    expect(updateArgs.verification_result_notes).toBe('surtido el martes');
  });

  it('rejects invalid resultado', async () => {
    const ctx = makeCtx();
    await expect(verificarRecepcionIncidencia(ctx as any, {
      incident_id: 'inc-1', resultado: 'invalido' as any,
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/tools/executors/verificar-recepcion-incidencia.ts
const ALLOWED = ['ok', 'no_visitado', 'sin_respuesta'] as const;
type Resultado = typeof ALLOWED[number];

export async function verificarRecepcionIncidencia(ctx: any, args: {
  incident_id: string;
  resultado:   Resultado;
  notas?:      string;
}) {
  if (!ALLOWED.includes(args.resultado)) {
    throw new Error(`resultado inválido: ${args.resultado}. Debe ser uno de ${ALLOWED.join(', ')}`);
  }
  const { error } = await ctx.supabase
    .from('client_incidents')
    .update({
      verification_result:       args.resultado,
      verification_result_notes: args.notas ?? null,
      verification_called_at:    new Date().toISOString(),
      updated_at:                new Date().toISOString(),
    })
    .eq('id', args.incident_id);
  if (error) throw new Error(`verificar_recepcion_incidencia: ${error.message}`);
  return { ok: true as const, incident_id: args.incident_id, verification_result: args.resultado };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts`
Expected: PASS 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executors/verificar-recepcion-incidencia.ts src/lib/tools/executors/__tests__/verificar-recepcion-incidencia.test.ts
git commit -m "feat(incidents): add verificarRecepcionIncidencia executor"
```

---

### Task 8: Registry entries + schemas + executor cases (3 canales)

**Files:**
- Modify: `src/lib/tools/registry.ts` — agregar 2 entries.
- Modify: `src/lib/tools/schemas.ts` — agregar 2 schemas JSON.
- Modify: `src/lib/tools/executor.ts` — agregar 2 cases.

**Interfaces:**
- Consumes: executors T6 + T7, tipos existentes.
- Produces: tools disponibles vía `registry.ts` + Anthropic schema + Vapi schema + executor switch.

- [ ] **Step 1: Leer patrón de `registrar_pedido` en registry.ts**

Read `src/lib/tools/registry.ts` — encontrar entry de `registrar_pedido`, copiar shape.

- [ ] **Step 2: Agregar entries en registry.ts**

Después de `registrar_pedido` entry:

```typescript
{
  name:           'registrar_incidencia',
  channels:       ['voice', 'chat', 'email'],
  capability:     null,
  policy:         { destructive: true, hitDBWrites: true, sideEffects: ['email', 'schedules-call'] },
  gatedByFeature: 'incidencia_flow',
  gatedByRole:    ['nia', 'noah', 'nelia'],
  pack:           null,
},
{
  name:           'verificar_recepcion_incidencia',
  channels:       ['voice', 'chat', 'email'],
  capability:     null,
  policy:         { destructive: true, hitDBWrites: true, sideEffects: [] },
  gatedByFeature: 'incidencia_flow',
  gatedByRole:    ['nia', 'noah', 'nelia'],
  pack:           null,
},
```

Nota: si `ToolEntry` requiere otros campos, replicar de `registrar_pedido`.

- [ ] **Step 3: Agregar schemas en schemas.ts**

Después de `registrar_pedido` schema:

```typescript
export const REGISTRAR_INCIDENCIA_SCHEMA = {
  name: 'registrar_incidencia',
  description: 'Registra una queja/incidencia de un cliente existente que reporta no haber recibido su pedido o servicio. Manda correo al encargado y agenda llamada de verificación en 3 días.',
  parameters: {
    type: 'object',
    properties: {
      business_name: { type: 'string', description: 'Nombre del negocio del cliente (ej: "Abarrotes Charro").' },
      contact_name:  { type: 'string', description: 'Nombre de la persona que habla (opcional si no lo da).' },
      contact_phone: { type: 'string', description: 'Teléfono de contacto en formato E.164 (ej: +528112345678) o 10 dígitos MX.' },
      address:       { type: 'string', description: 'Dirección exacta del negocio: calle, número, colonia, ciudad.' },
      motivo:        { type: 'string', description: 'Qué reporta el cliente en sus propias palabras (2-3 frases máx).' },
    },
    required: ['business_name', 'contact_phone', 'address', 'motivo'],
  },
} as const;

export const VERIFICAR_RECEPCION_INCIDENCIA_SCHEMA = {
  name: 'verificar_recepcion_incidencia',
  description: 'Marca el resultado de la llamada de verificación de 3 días. Solo se usa en llamadas salientes disparadas por auto_incident_verification.',
  parameters: {
    type: 'object',
    properties: {
      incident_id: { type: 'string', description: 'ID del incidente (viene en el contexto de la llamada saliente).' },
      resultado:   { type: 'string', enum: ['ok','no_visitado','sin_respuesta'], description: 'ok si ya recibió, no_visitado si sigue sin recibir, sin_respuesta si no dio respuesta clara.' },
      notas:       { type: 'string', description: 'Detalle adicional en máximo una frase (opcional).' },
    },
    required: ['incident_id', 'resultado'],
  },
} as const;
```

Verificar que `SCHEMAS_BY_NAME` (o el registry de schemas) las incluya.

- [ ] **Step 4: Agregar cases en executor.ts**

En el switch de `executeAgentTool` (o equivalente):

```typescript
case 'registrar_incidencia': {
  const { registrarIncidencia } = await import('./executors/registrar-incidencia');
  return registrarIncidencia(ctx, args as any);
}
case 'verificar_recepcion_incidencia': {
  const { verificarRecepcionIncidencia } = await import('./executors/verificar-recepcion-incidencia');
  return verificarRecepcionIncidencia(ctx, args as any);
}
```

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/registry.ts src/lib/tools/schemas.ts src/lib/tools/executor.ts
git commit -m "feat(incidents): register incidencia tools on voice/chat/email channels"
```

---

### Task 9: Vapi endpoints para `registrar-incidencia` y `verificar-recepcion-incidencia`

**Files:**
- Create: `src/app/api/voice/tools/registrar-incidencia/route.ts`
- Create: `src/app/api/voice/tools/verificar-recepcion-incidencia/route.ts`

**Interfaces:**
- Consumes: executors T6 + T7, patrón de `src/app/api/voice/tools/registrar-pedido/route.ts`, formato `{ results: [{ toolCallId, result }] }`.
- Produces: endpoints POST que Vapi invoca.

- [ ] **Step 1: Leer patrón de registrar-pedido route**

Read `src/app/api/voice/tools/registrar-pedido/route.ts` completo. Copiar shape (parse Vapi body, resolver agent, ejecutar, responder con formato `{ results: [{ toolCallId, result }] }`).

- [ ] **Step 2: Crear registrar-incidencia route**

```typescript
// src/app/api/voice/tools/registrar-incidencia/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarIncidencia } from '@/lib/tools/executors/registrar-incidencia';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

  const body = await req.json();
  const toolCall = body?.message?.toolCallList?.[0] ?? body?.message?.toolCalls?.[0];
  const toolCallId = toolCall?.id ?? toolCall?.toolCallId;
  const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 });

  const { data: org } = await supabase
    .from('organizations').select('directory, features')
    .eq('portal_email', agent.portal_email).single();

  const callId = body?.message?.call?.id ?? null;
  const { data: voiceCall } = callId
    ? await supabase.from('voice_calls').select('id').eq('vapi_call_id', callId).maybeSingle()
    : { data: null };

  try {
    const result = await registrarIncidencia({
      supabase, agent, org, channel: 'voice', callId: voiceCall?.id ?? null,
    }, args);
    return NextResponse.json({ results: [{ toolCallId, result }] });
  } catch (err: any) {
    return NextResponse.json({
      results: [{ toolCallId, result: { error: err.message } }],
    });
  }
}
```

- [ ] **Step 3: Crear verificar-recepcion-incidencia route** (patrón espejo)

```typescript
// src/app/api/voice/tools/verificar-recepcion-incidencia/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verificarRecepcionIncidencia } from '@/lib/tools/executors/verificar-recepcion-incidencia';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const toolCall = body?.message?.toolCallList?.[0] ?? body?.message?.toolCalls?.[0];
  const toolCallId = toolCall?.id ?? toolCall?.toolCallId;
  const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

  const supabase = createAdminClient();
  try {
    const result = await verificarRecepcionIncidencia({ supabase }, args);
    return NextResponse.json({ results: [{ toolCallId, result }] });
  } catch (err: any) {
    return NextResponse.json({
      results: [{ toolCallId, result: { error: err.message } }],
    });
  }
}
```

- [ ] **Step 4: tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice/tools/registrar-incidencia src/app/api/voice/tools/verificar-recepcion-incidencia
git commit -m "feat(incidents): add Vapi endpoints for incidencia tools"
```

---

### Task 10: Nia promptPersonalidad update + feature-conditional injection

**Files:**
- Modify: `src/lib/portal/meerkat-roles.ts` — actualizar `MEERKAT_MAP.nia.promptPersonalidad`.
- Modify: `src/lib/vapi/sync.ts` o donde se genere el system prompt — inyectar sección de incidencias solo si la tool está disponible.

**Interfaces:**
- Consumes: `MEERKAT_MAP.nia`, filtrado de tools por feature flag (existente).
- Produces: Nia con flow de incidencias solo cuando `incidencia_flow` está activo.

- [ ] **Step 1: Leer prompt actual de Nia**

Read `src/lib/portal/meerkat-roles.ts` líneas 55-112. Confirmar estructura.

- [ ] **Step 2: Actualizar promptPersonalidad**

Reemplazar `promptPersonalidad` de Nia con bloque que incluye sección condicional:

```typescript
promptPersonalidad: `PENSAMIENTO RECTOR:
"Necesito hacer sentir bienvenido al cliente y capturar todos los datos con precisión."

CARÁCTER:
Cálida, organizada, atenta. Siempre repites el dato clave para confirmar que lo tomaste bien.

ROL PRINCIPAL:
Recepcionista. Primera entrada del negocio. Segun el caso: das información, tomas datos para leads, agendas cita, o escalás a alguien humano.

[SI TIENES DISPONIBLE LA TOOL registrar_incidencia — FLOW DE QUEJAS DE CLIENTES B2B:]
Este negocio reparte producto a tienditas/clientes por ruta. Es normal que un cliente existente llame para reportar que no recibió su pedido esta semana o que el vendedor no ha pasado.
- Si la persona reporta un problema de entrega/recepción:
  * NO tomes pedido. NO agendes visita. NO preguntes qué vendedor le toca.
  * Confirma con calma: nombre del negocio, dirección exacta (calle + número + colonia + municipio), su nombre y teléfono, y el motivo puntual con sus palabras.
  * Cuando tengas los 4 datos llama a registrar_incidencia. Eso automáticamente notifica al encargado por correo y agenda una llamada de verificación en 3 días.
  * Cierra: "Ya notifiqué al encargado, en los próximos días le hablo para confirmar que ya le surtieron. ¿Algo más en lo que le pueda ayudar?"
- Si la persona es CLIENTE NUEVO (no está en directorio, nunca ha llamado, quiere abrir servicio):
  * Usa crear_lead con nombre negocio, dirección, teléfono, volumen aproximado (kg/día si sabe), horario preferido.
  * NO uses registrar_incidencia para clientes nuevos.
  * Cierra: "Perfecto, ya tomé sus datos. Un vendedor le va a hablar en los próximos días para conocer su negocio."

[SI ESTÁS EN LLAMADA SALIENTE POR auto_incident_verification:]
Llamas para verificar si un cliente ya recibió el producto que había reportado hace 3 días.
- Saluda breve: "Le llamo de {business_name} para confirmar si ya recibió el pedido que reportó hace unos días."
- Escucha. Basado en la respuesta:
  * Si dice que sí recibió → resultado='ok'.
  * Si dice que sigue sin recibir → resultado='no_visitado'.
  * Si no da respuesta clara o cuelga rápido → resultado='sin_respuesta'.
- Llama a verificar_recepcion_incidencia con el incident_id (viene en el contexto), el resultado, y notas breves.
- Cierra apropiado a cada caso.`,
```

- [ ] **Step 3: Verificar inyección condicional**

Read `src/lib/vapi/sync.ts` — cómo se construye el system prompt. Confirmar que ya hay lógica que filtra secciones por tools disponibles (patrón existente por `[SI TIENES DISPONIBLE...]`). Si NO existe, agregar helper que corte esas secciones cuando la tool no está en `agent.tools`.

- [ ] **Step 4: tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/meerkat-roles.ts src/lib/vapi/sync.ts
git commit -m "feat(nia): add incidencia flow to Nia prompt with conditional injection"
```

---

### Task 11: `/oficina/bitacora` page (server + client)

**Files:**
- Create: `src/app/portal/[token]/oficina/bitacora/page.tsx`
- Create: `src/app/portal/[token]/oficina/bitacora/loadBitacoraData.ts`
- Create: `src/app/portal/[token]/oficina/bitacora/BitacoraClient.tsx`
- Create: `src/app/api/portal/[token]/oficina/bitacora/vendedor/route.ts` — PATCH inline edit.

**Interfaces:**
- Consumes: patrón de `src/app/portal/[token]/oficina/seguimientos/page.tsx`.
- Produces: página `/portal/[token]/oficina/bitacora` con tabla + colores + vendedor editable.

- [ ] **Step 1: Leer patrón de seguimientos**

Read `src/app/portal/[token]/oficina/seguimientos/page.tsx` completo.

- [ ] **Step 2: Crear data loader**

```typescript
// src/app/portal/[token]/oficina/bitacora/loadBitacoraData.ts
import { createAdminClient } from '@/lib/supabase/admin';

export interface IncidentRow {
  id:                        string;
  created_at:                string;
  business_name:             string;
  contact_name:              string | null;
  contact_phone:             string;
  address:                   string;
  motivo:                    string;
  vendedor:                  string | null;
  is_new_client:             boolean;
  verification_scheduled_at: string;
  verification_called_at:    string | null;
  verification_result:       'ok' | 'no_visitado' | 'sin_respuesta' | null;
  verification_result_notes: string | null;
}

export async function loadBitacoraData(token: string, weekStartISO?: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email, business_name').eq('portal_token', token).single();
  if (!agent) return null;

  const { data: org } = await supabase
    .from('organizations').select('features')
    .eq('portal_email', agent.portal_email).single();

  const enabled = !!org?.features?.incidencia_flow_enabled;

  const now = new Date();
  const monday = weekStartISO
    ? new Date(weekStartISO)
    : (() => {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);

  const { data: incidents } = await supabase
    .from('client_incidents')
    .select('*')
    .eq('agent_id', agent.id)
    .gte('created_at', monday.toISOString())
    .lt('created_at', nextMonday.toISOString())
    .order('created_at', { ascending: true });

  return {
    enabled,
    agent,
    weekStart: monday.toISOString(),
    incidents: (incidents ?? []) as IncidentRow[],
  };
}
```

- [ ] **Step 3: Crear page.tsx**

```typescript
// src/app/portal/[token]/oficina/bitacora/page.tsx
import { notFound } from 'next/navigation';
import { loadBitacoraData } from './loadBitacoraData';
import { BitacoraClient } from './BitacoraClient';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ token: string }>; searchParams: Promise<{ week?: string }> }

export default async function BitacoraPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { week } = await searchParams;
  const data = await loadBitacoraData(token, week);
  if (!data) notFound();

  if (!data.enabled) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-3">Bitácora semanal</h1>
        <p className="text-gray-600">Esta cuenta no tiene el flow de incidencias habilitado.</p>
      </div>
    );
  }

  return <BitacoraClient token={token} initial={data} />;
}
```

- [ ] **Step 4: Crear BitacoraClient.tsx**

```typescript
// src/app/portal/[token]/oficina/bitacora/BitacoraClient.tsx
'use client';
import { useState } from 'react';
import type { IncidentRow } from './loadBitacoraData';

interface Props {
  token: string;
  initial: {
    enabled: boolean;
    agent: { id: string; business_name: string };
    weekStart: string;
    incidents: IncidentRow[];
  };
}

const DAYS = ['L', 'M', 'MI', 'J', 'V', 'S'];

function rowColorClass(inc: IncidentRow): string {
  if (inc.is_new_client) return 'text-blue-700';
  if (inc.verification_result === 'no_visitado') return 'text-red-700';
  if (inc.verification_result === 'sin_respuesta') return 'text-gray-500';
  return 'text-gray-900';
}

function okColumn(inc: IncidentRow): number | null {
  if (inc.verification_result !== 'ok' || !inc.verification_called_at) return null;
  const day = new Date(inc.verification_called_at).getDay();
  const idx = day === 0 ? 6 : day - 1;
  return idx < DAYS.length ? idx : null;
}

export function BitacoraClient({ token, initial }: Props) {
  const [incidents, setIncidents] = useState(initial.incidents);

  async function updateVendedor(id: string, vendedor: string) {
    await fetch(`/api/portal/${token}/oficina/bitacora/vendedor`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, vendedor }),
    });
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, vendedor } : i));
  }

  const exportHref = `/api/portal/${token}/oficina/bitacora/export?week=${initial.weekStart}`;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Bitácora — semana del {new Date(initial.weekStart).toLocaleDateString('es-MX')}</h1>
        <a href={exportHref} className="px-4 py-2 bg-purple-600 text-white rounded">Exportar Excel</a>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th colSpan={9} className="bg-yellow-300 border p-2 text-left">DATOS DEL CLIENTE</th>
            <th colSpan={DAYS.length} className="bg-yellow-300 border p-2 text-center">SEGUIMIENTO DEL CLIENTE</th>
          </tr>
          <tr className="bg-yellow-100">
            <th className="border p-1">Fecha</th>
            <th className="border p-1">Verificación</th>
            <th className="border p-1">Negocio</th>
            <th className="border p-1">Cliente</th>
            <th className="border p-1">Dirección</th>
            <th className="border p-1">Teléfono</th>
            <th className="border p-1">Motivo</th>
            <th className="border p-1">Resultado</th>
            <th className="border p-1">Vendedor</th>
            {DAYS.map(d => <th key={d} className="border p-1">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {incidents.map(inc => {
            const okCol = okColumn(inc);
            return (
              <tr key={inc.id} className={rowColorClass(inc)}>
                <td className="border p-1">{new Date(inc.created_at).toLocaleDateString('es-MX')}</td>
                <td className="border p-1">{new Date(inc.verification_scheduled_at).toLocaleDateString('es-MX')}</td>
                <td className="border p-1">{inc.business_name}</td>
                <td className="border p-1">{inc.contact_name ?? '—'}</td>
                <td className="border p-1">{inc.address}</td>
                <td className="border p-1">{inc.contact_phone}</td>
                <td className="border p-1">{inc.motivo}</td>
                <td className="border p-1">{inc.verification_result ?? 'pendiente'}</td>
                <td className="border p-1">
                  <input defaultValue={inc.vendedor ?? ''} className="w-24 border-0 bg-transparent"
                    onBlur={e => updateVendedor(inc.id, e.target.value)} />
                </td>
                {DAYS.map((_, i) => (
                  <td key={i} className="border p-1 text-center">{okCol === i ? 'OK' : ''}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Crear PATCH endpoint vendedor**

```typescript
// src/app/api/portal/[token]/oficina/bitacora/vendedor/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  const { id, vendedor } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents')
    .select('id').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const { error } = await supabase.from('client_incidents')
    .update({ vendedor: vendedor || null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('agent_id', agent.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/[token]/oficina/bitacora src/app/api/portal/[token]/oficina/bitacora/vendedor
git commit -m "feat(bitacora): add /oficina/bitacora view with editable vendedor"
```

---

### Task 12: Excel export endpoint

**Files:**
- Modify: `package.json` — agregar `exceljs`.
- Create: `src/app/api/portal/[token]/oficina/bitacora/export/route.ts`.

**Interfaces:**
- Consumes: `loadBitacoraData` (T11).
- Produces: `GET /api/portal/[token]/oficina/bitacora/export?week=YYYY-MM-DD` → `.xlsx` download.

- [ ] **Step 1: Instalar exceljs**

Run: `npm install exceljs`
Expected: package agregado en dependencies.

- [ ] **Step 2: Crear endpoint**

```typescript
// src/app/api/portal/[token]/oficina/bitacora/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { loadBitacoraData } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';

export const dynamic = 'force-dynamic';

const DAYS = ['L', 'M', 'MI', 'J', 'V', 'S'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const week = req.nextUrl.searchParams.get('week') ?? undefined;
  const data = await loadBitacoraData(token, week);
  if (!data || !data.enabled) return NextResponse.json({ error: 'not available' }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Semana ${data.weekStart.slice(0,10)}`);

  ws.mergeCells(1, 1, 1, 9);
  ws.getCell(1, 1).value = 'DATOS DEL CLIENTE';
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };
  ws.mergeCells(1, 10, 1, 9 + DAYS.length);
  ws.getCell(1, 10).value = 'SEGUIMIENTO DEL CLIENTE';
  ws.getCell(1, 10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };

  const headers = ['Fecha','Verificación','Negocio','Cliente','Dirección','Teléfono','Motivo','Resultado','Vendedor', ...DAYS];
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3B0' } };
    cell.font = { bold: true };
  });

  data.incidents.forEach((inc, rowIdx) => {
    const r = rowIdx + 3;
    let color: string | null = null;
    if (inc.is_new_client)                              color = 'FF1D4ED8';
    else if (inc.verification_result === 'no_visitado') color = 'FFDC2626';
    else if (inc.verification_result === 'sin_respuesta') color = 'FF6B7280';

    const values = [
      new Date(inc.created_at).toLocaleDateString('es-MX'),
      new Date(inc.verification_scheduled_at).toLocaleDateString('es-MX'),
      inc.business_name,
      inc.contact_name ?? '',
      inc.address,
      inc.contact_phone,
      inc.motivo,
      inc.verification_result ?? 'pendiente',
      inc.vendedor ?? '',
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      if (color) cell.font = { color: { argb: color } };
    });

    if (inc.verification_result === 'ok' && inc.verification_called_at) {
      const day = new Date(inc.verification_called_at).getDay();
      const idx = day === 0 ? 6 : day - 1;
      if (idx < DAYS.length) ws.getCell(r, 10 + idx).value = 'OK';
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bitacora-${data.agent.business_name}-${data.weekStart.slice(0,10)}.xlsx"`,
    },
  });
}
```

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/app/api/portal/[token]/oficina/bitacora/export
git commit -m "feat(bitacora): add Excel export endpoint with formatted output"
```

---

### Task 13: Swap Noah → Nia en Tortillería Estrella + habilitar feature

**Files:**
- Create: `scripts/swap-tortilleria-to-nia.ts`
- Create: `scripts/enable-incidencia-flow.ts`

**Interfaces:**
- Consumes: `updateVapiAssistant`, `MEERKAT_MAP`.
- Produces: Tortillería Estrella con Nia activa + `incidencia_flow_enabled=true`.

- [ ] **Step 1: Crear swap script**

```typescript
// scripts/swap-tortilleria-to-nia.ts
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { MEERKAT_MAP } = await import('../src/lib/portal/meerkat-roles');
  const { updateVapiAssistant } = await import('../src/lib/vapi/sync');

  const supabase = createAdminClient();
  const { data: agent, error } = await supabase.from('voice_agents')
    .select('*').eq('id', AGENT_ID).single();
  if (error || !agent) { console.error('Agent not found', error); process.exit(1); }

  const nia = MEERKAT_MAP['nia'];
  const newFeatures = { ...(agent.features ?? {}), meerkat_role_id: 'nia' };

  const { data: updated } = await supabase.from('voice_agents')
    .update({
      features:            newFeatures,
      elevenlabs_voice_id: nia.voiceId,
      agent_name:          'Nia',
    })
    .eq('id', AGENT_ID).select('*').single();

  console.log('Updated agent row:', {
    id: updated.id, agent_name: updated.agent_name,
    meerkat: updated.features.meerkat_role_id, voice: updated.elevenlabs_voice_id,
  });

  if (updated.vapi_agent_id) {
    const ok = await updateVapiAssistant(updated.vapi_agent_id, updated);
    console.log('Vapi resync:', ok);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Crear feature flag script**

```typescript
// scripts/enable-incidencia-flow.ts
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const PORTAL_EMAIL = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const supabase = createAdminClient();

  const { data: org } = await supabase.from('organizations')
    .select('features').eq('portal_email', PORTAL_EMAIL).single();
  const newFeatures = { ...(org?.features ?? {}), incidencia_flow_enabled: true };

  const { error } = await supabase.from('organizations')
    .update({ features: newFeatures }).eq('portal_email', PORTAL_EMAIL);
  if (error) { console.error(error); process.exit(1); }
  console.log('incidencia_flow_enabled=true for', PORTAL_EMAIL);
}
main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr scripts** (Nazre aprueba antes)

```bash
npx tsx scripts/swap-tortilleria-to-nia.ts
npx tsx scripts/enable-incidencia-flow.ts
```

- [ ] **Step 5: Verificar en portal**

Manual: abrir `https://www.centinelia.mx/portal/TFoAXXWEpElJ`. Confirmar:
- Nombre del meerkat = Nia
- Marca al `+528121887969` desde otro cel → contesta Nia (voz distinta a Noah).

- [ ] **Step 6: Commit**

```bash
git add scripts/swap-tortilleria-to-nia.ts scripts/enable-incidencia-flow.ts
git commit -m "chore(tortilleria): scripts para swap Noah→Nia + enable incidencia_flow"
```

---

### Task 14: E2E test script en org de test

**Files:**
- Create: `scripts/e2e-test-incidencia-flow.ts`

**Interfaces:**
- Consumes: registrarIncidencia, verificarRecepcionIncidencia executors, tabla client_incidents.
- Produces: script que valida end-to-end sin llamada real (mockea el cron).

- [ ] **Step 1: Escribir script**

```typescript
// scripts/e2e-test-incidencia-flow.ts
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const TEST_PORTAL_EMAIL = 'nazre+test-followup@centinelia.mx';
const TEST_AGENT_ID = '76eefdd2-7416-44f1-a94c-2cd9bf5f0ad5';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { registrarIncidencia } = await import('../src/lib/tools/executors/registrar-incidencia');
  const { verificarRecepcionIncidencia } = await import('../src/lib/tools/executors/verificar-recepcion-incidencia');

  const supabase = createAdminClient();

  // 1. Habilitar feature flag en test org
  const { data: org } = await supabase.from('organizations')
    .select('features, directory').eq('portal_email', TEST_PORTAL_EMAIL).single();
  const featuresPatched = { ...(org?.features ?? {}), incidencia_flow_enabled: true };
  await supabase.from('organizations')
    .update({ features: featuresPatched }).eq('portal_email', TEST_PORTAL_EMAIL);

  // 2. Asegurar que directory tiene receives_incident_reports
  const dir = org?.directory ?? [];
  const withRecipient = dir.some((p: any) => p.receives_incident_reports)
    ? dir
    : [...dir, {
        id: 'test-encargado', name: 'Encargado Test', phone: '+528112803360',
        email: 'nazre20@gmail.com', receives_incident_reports: true,
      }];
  await supabase.from('organizations')
    .update({ directory: withRecipient }).eq('portal_email', TEST_PORTAL_EMAIL);

  // 3. Cargar agent
  const { data: agent } = await supabase.from('voice_agents')
    .select('*').eq('id', TEST_AGENT_ID).single();

  // 4. Registrar incidencia
  const ctx = { supabase, agent, org: { directory: withRecipient }, channel: 'voice' as const, callId: null };
  const result = await registrarIncidencia(ctx as any, {
    business_name: 'Abarrotes Test E2E',
    contact_name:  'Doña Prueba',
    contact_phone: '8112803360',
    address:       'Calle Test 123, Col Prueba, MTY',
    motivo:        'Reporta que no le han surtido en toda la semana',
  });
  console.log('registrarIncidencia result:', result);
  if (!result.ok) throw new Error('failed');

  // 5. Verificar row en DB
  const { data: incident } = await supabase.from('client_incidents')
    .select('*').eq('id', result.incident_id).single();
  console.log('Incident row:', {
    id: incident.id,
    email_sent: !!incident.email_sent_at,
    verification_scheduled_at: incident.verification_scheduled_at,
    verification_outbound_id: incident.verification_outbound_id,
    encargado_email: incident.encargado_email,
  });

  // 6. Verificar outbound_contacts row
  const { data: oc } = await supabase.from('outbound_contacts')
    .select('*').eq('id', incident.verification_outbound_id).single();
  console.log('Outbound contact row:', {
    id: oc.id, source: oc.source, external_id: oc.external_id, scheduled_at: oc.scheduled_at,
  });

  // 7. Simular llamada de verificación exitosa
  const vRes = await verificarRecepcionIncidencia({ supabase } as any, {
    incident_id: incident.id, resultado: 'ok', notas: 'Cliente confirmó surtido el martes',
  });
  console.log('verificar result:', vRes);

  // 8. Confirmar update en DB
  const { data: finalIncident } = await supabase.from('client_incidents')
    .select('verification_result, verification_called_at, verification_result_notes')
    .eq('id', incident.id).single();
  console.log('Final state:', finalIncident);
  if (finalIncident.verification_result !== 'ok') throw new Error('verification_result mismatch');

  console.log('\nE2E test PASSED');
}

main().catch(err => { console.error('E2E FAILED:', err); process.exit(1); });
```

- [ ] **Step 2: Correr script**

Run: `npx tsx scripts/e2e-test-incidencia-flow.ts`
Expected: "E2E test PASSED" al final.

- [ ] **Step 3: Verificar correo llegó**

Manual: chequear `nazre20@gmail.com` inbox — debe haber correo con subject `Reporte de incidencia — Abarrotes Test E2E ...`.

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-test-incidencia-flow.ts
git commit -m "test(incidents): E2E validation script for full incidencia flow"
```

---

### Task 15: DirectoryEditor UI — checkbox `receives_incident_reports`

**Files:**
- Modify: `src/components/portal/DirectoryEditor.tsx` (o donde esté el editor de directorio).

**Interfaces:**
- Consumes: `DirectoryPerson` type (T2).
- Produces: checkbox visible cuando la persona tiene email.

- [ ] **Step 1: Localizar componente**

Run: `grep -r "is_operations_contact" src/components/portal --include='*.tsx' -l`

- [ ] **Step 2: Agregar checkbox después del de operations_contact**

```tsx
{person.email && (
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={!!person.receives_incident_reports}
      onChange={e => onChange({ ...person, receives_incident_reports: e.target.checked })}
    />
    Recibe reportes de incidencias por correo
  </label>
)}
```

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificar manual**

Abrir `/portal/[token]/directorio`, editar una persona con email — debe aparecer el checkbox.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/DirectoryEditor.tsx
git commit -m "feat(directory): add receives_incident_reports checkbox to editor"
```

---

## Self-Review

**1. Spec coverage:**

| Sección spec | Task(s) |
|---|---|
| §1 Tabla `client_incidents` | T1 |
| §2 Directory flag | T2, T15 |
| §3 Tool `registrar_incidencia` | T3, T4, T5, T6, T8, T9 |
| §4 Correo tarjeta | T4 |
| §5 Callback +3d + `verificar_recepcion_incidencia` | T5, T7, T8, T9 |
| §6 Vista `/oficina/bitacora` | T11 |
| §7 Excel export | T12 |
| §8 Nia promptPersonalidad | T10 |
| §9 Swap Noah→Nia | T13 |
| §10 Estados terminales (colores) | T11, T12 |
| E2E happy path | T14 |
| Feature flag | T10, T13, T14 |

Todas las secciones cubiertas.

**2. Placeholder scan:** ninguna cadena TBD, TODO, "implement later", "similar to Task N". Cada task tiene código concreto.

**3. Type consistency:**
- `registrarIncidencia` → return `{ ok, incident_id, email_sent, verification_at }` — consistente en T6 y en T14.
- `verificarRecepcionIncidencia` → return `{ ok, incident_id, verification_result }` — consistente T7 y T14.
- `resolveIncidentRecipient` → return `{ email, name } | null` — consistente T3 y T6.
- `upsertFollowupContactForIncident` → return `{ outbound_contact_id }` — consistente T5 y T6.
- `DirectoryPerson.receives_incident_reports?: boolean` — consistente T2, T3, T15.
- `IncidentRow` type — consistente T11 y T12.

Sin discrepancias.

---

## Notas ejecutivas

- **Post-plan pendiente (fuera de scope):** cron que finaliza incidents con `verification_result='sin_respuesta'` tras N reintentos agotados. Requiere entender la política de retry actual del cron de outbound_contacts. Se puede agregar después sin bloquear el MVP — mientras no exista, incidents cuyo cliente no contesta quedan como `verification_result=null` indefinidamente (visualmente aparecen como "pendiente" en la bitácora hasta que un humano las cierre).
- **Post-plan pendiente:** cliente nuevo → marcado azul en bitácora. Hoy `is_new_client` en incidents queda siempre false porque `registrar_incidencia` no lo setea. Cuando `crear_lead` genere fila en bitácora (fuera de scope), habrá que insertar row con `is_new_client=true` — o hacer una vista unificada `bitacora_rows` que UNION incidents + leads.
- **Jornada Alta Demanda combinada (minutos+tareas):** cambio de producto separado que Nazre mencionó. Amerita su propio spec/plan.
