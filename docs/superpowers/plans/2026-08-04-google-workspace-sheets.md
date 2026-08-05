# Google Workspace + Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar Gmail + Drive bajo una tarjeta "Google Workspace" en IntegrationsHub, y agregar integración nativa de Google Sheets con 4 tools en los 3 canales (voz/chat/correo) + sync opcional de `crear_lead`.

**Architecture:** Reutiliza OAuth Google existente añadiendo scope `spreadsheets`. Nueva tabla `sheets_mappings` (por org, por propósito). Servicio `lib/services/sheets.ts` centraliza toda I/O contra Sheets API. 4 tools se registran una vez en `executor.ts` y todos los canales las heredan (patrón sesión 30). UI IntegrationsHub reemplaza cards separadas de Gmail y Drive por una sola tarjeta con estado de scopes.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres), `googleapis` npm package, React 19, Tailwind, Lucide icons, Vapi para voz.

## Global Constraints

Aplican a todas las tasks:

- **3 canales obligatorio:** toda tool nueva se registra en `executor.ts` (chat/oficina + email/inbox lo heredan automáticamente) y se expone en `buildTools()` para voz. Regla de `feedback_3channel_tools.md` en memoria.
- **Contrato de tools:** todas retornan `{ok: true, ...data}` o `{ok: false, reason: string, detail?: string}`. Nunca throw dentro del executor.
- **IDOR:** toda ruta portal que lea/escriba por ID verifica ownership del org antes de la operación. Regla de sesión 36.
- **Dev bypass:** no tocar el `NODE_ENV === 'development'` en `proxy.ts`. Regla de `feedback_dev_bypass.md`.
- **Copy español sin em dash** (usar `:` `,` `.`). Sin emojis en UI (solo Lucide). Reglas de `feedback_no_em_dash.md` y `feedback_no_emojis.md`.
- **No columnas dropped:** al leer/escribir `voice_agents`, evitar las 13 columnas removidas en commit `e372013` (viven en `organizations`). Regla de `feedback_dropped_columns_bugs.md`.
- **Sub-agentes con Sonnet 4.6**, nunca Haiku. Regla de `feedback_subagent_sonnet.md` (aplica si algún tool loop dispara LLM adicional).
- **Copy visible sin "IA"** — usar "empleado digital". Reglas `feedback_no_ia_visible.md` y `feedback_empleado_digital.md`.

## Prerrequisitos

- Repo Centinelia clonado y funcional (dev server corre en localhost).
- Google Cloud Console: el OAuth client actual debe aceptar el scope `https://www.googleapis.com/auth/spreadsheets` (verificar en la consola antes de arrancar; si no, agregarlo en la pantalla de consentimiento).
- Supabase acceso admin para correr migrations.
- Un Google Sheet real de prueba en la cuenta `centinelia.dev@gmail.com` para integration tests (crear si no existe: 1 spreadsheet llamado "Centinelia Test Sheet" con tabs "Clientes" y "Leads" con headers de fila 1).

**Sobre paths:** los paths abajo asumen la convención Centinelia (`lib/services/`, `lib/tools/`, `components/integrations/`, `app/api/portal/`). Si el repo real difiere, el implementador ajusta antes de escribir código.

---

## Task 0: Discovery — verificar paths y patrones existentes

**Files:** ninguno se modifica; solo lectura.

**Objetivo:** Antes de codear, confirmar que la estructura asumida existe. Si algún path difiere, actualizar el resto del plan.

- [ ] **Step 1:** Localizar el executor central de tools.

Run: `grep -rn "executor" lib/ src/ --include="*.ts" | grep -i "tool\|dispatch" | head -20`
Expected: encontrar `lib/tools/executor.ts` o equivalente. Anotar path real.

- [ ] **Step 2:** Localizar `buildTools()` para voz.

Run: `grep -rn "buildTools" lib/ src/ --include="*.ts" | head -10`
Expected: encontrar el archivo (probable `lib/vapi/buildTools.ts` o similar).

- [ ] **Step 3:** Localizar OAuth Google existente y scopes.

Run: `grep -rn "gmail.modify\|drive.file\|GOOGLE_SCOPES\|expectedScopes" lib/ src/ --include="*.ts" | head -20`
Expected: encontrar dónde se declaran los scopes esperados.

- [ ] **Step 4:** Localizar cards de IntegrationsHub actuales.

Run: `grep -rn "GmailCard\|DriveCard\|IntegrationsHub" components/ src/ --include="*.tsx" | head -20`
Expected: encontrar componentes actuales; confirmar nombres.

- [ ] **Step 5:** Localizar policy engine registry.

Run: `grep -rn "capability\|registerCapability\|policy_engine" lib/ src/ --include="*.ts" | head -20`
Expected: encontrar el archivo de registro.

- [ ] **Step 6:** Anotar en un comentario TODO al inicio del plan (o en un scratch file) cualquier path que difiera de lo asumido. Ajustar todas las tasks siguientes con paths reales antes de continuar.

No commit — es discovery.

---

## Task 1: Migration — `sheets_mappings` + `voice_agents.sync_leads_to_sheets`

**Files:**
- Create: `supabase/migrations/20260804_sheets_mappings.sql`

**Interfaces:**
- Produces: tabla `sheets_mappings`, columna `voice_agents.sync_leads_to_sheets bool default false`

- [ ] **Step 1: Escribir la migration**

```sql
-- supabase/migrations/20260804_sheets_mappings.sql

CREATE TABLE sheets_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'clientes','leads','bitacoras','oc','cajas_chicas','custom'
  )),
  custom_purpose_label TEXT,
  spreadsheet_id TEXT NOT NULL,
  tab_name TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  headers_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (purpose = 'custom' AND custom_purpose_label IS NOT NULL)
    OR (purpose != 'custom' AND custom_purpose_label IS NULL)
  )
);

CREATE UNIQUE INDEX sheets_mappings_org_purpose_reserved
  ON sheets_mappings (org_id, purpose)
  WHERE purpose != 'custom';

CREATE UNIQUE INDEX sheets_mappings_org_custom_label
  ON sheets_mappings (org_id, custom_purpose_label)
  WHERE purpose = 'custom';

CREATE INDEX sheets_mappings_org_id ON sheets_mappings (org_id);

ALTER TABLE voice_agents
  ADD COLUMN sync_leads_to_sheets BOOLEAN NOT NULL DEFAULT false;

-- updated_at trigger si existe patrón; si no, saltar (Centinelia usa updated_at manual en algunas tablas)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sheets_mappings_updated_at ON sheets_mappings;
CREATE TRIGGER sheets_mappings_updated_at
  BEFORE UPDATE ON sheets_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Correr la migration en Supabase (dev)**

Aplicar via Supabase dashboard SQL editor o CLI. Verificar:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'sheets_mappings';
SELECT column_name FROM information_schema.columns WHERE table_name = 'voice_agents' AND column_name = 'sync_leads_to_sheets';
```

Expected: 9 columnas en `sheets_mappings`, columna nueva en `voice_agents`.

- [ ] **Step 3: Correr la migration en prod (al final del plan, no ahora)**

Reservado para la Task 12 (rollout). Anotar aquí como pendiente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260804_sheets_mappings.sql
git commit -m "feat(sheets): migration for sheets_mappings + sync_leads_to_sheets"
```

---

## Task 2: OAuth scope `spreadsheets` + Google Sheets API client wrapper

**Files:**
- Modify: archivo de scopes Google identificado en Task 0 (asumido `lib/oauth/google.ts` o `lib/integrations/google/scopes.ts`)
- Create: `lib/integrations/google/sheetsClient.ts`

**Interfaces:**
- Produces:
  - `getSheetsClient(orgId: string): Promise<sheets_v4.Sheets>` — retorna cliente autenticado con el token del org
  - Exportar constante `SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'`

- [ ] **Step 1: Escribir test para el client wrapper**

Create: `lib/integrations/google/sheetsClient.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSheetsClient } from './sheetsClient';

vi.mock('googleapis', () => ({
  google: {
    sheets: vi.fn(() => ({ spreadsheets: { values: {} } })),
    auth: {
      OAuth2: vi.fn(() => ({
        setCredentials: vi.fn(),
      })),
    },
  },
}));

vi.mock('@/lib/integrations/accounts', () => ({
  getIntegrationAccount: vi.fn(),
}));

describe('getSheetsClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws sheets_no_conectado when no google account for org', async () => {
    const { getIntegrationAccount } = await import('@/lib/integrations/accounts');
    (getIntegrationAccount as any).mockResolvedValue(null);
    await expect(getSheetsClient('org-1')).rejects.toThrow('sheets_no_conectado');
  });

  it('throws scope_missing when spreadsheets scope not granted', async () => {
    const { getIntegrationAccount } = await import('@/lib/integrations/accounts');
    (getIntegrationAccount as any).mockResolvedValue({
      access_token: 'x',
      refresh_token: 'y',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });
    await expect(getSheetsClient('org-1')).rejects.toThrow('scope_missing');
  });

  it('returns sheets client when properly configured', async () => {
    const { getIntegrationAccount } = await import('@/lib/integrations/accounts');
    (getIntegrationAccount as any).mockResolvedValue({
      access_token: 'x',
      refresh_token: 'y',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await getSheetsClient('org-1');
    expect(client).toBeDefined();
    expect(client.spreadsheets).toBeDefined();
  });
});
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npm test lib/integrations/google/sheetsClient.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Actualizar scopes esperados en OAuth Google**

En el archivo identificado en Task 0 (`lib/oauth/google.ts` o similar), agregar `spreadsheets` a la lista:

```typescript
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets', // NUEVO
];
```

- [ ] **Step 4: Implementar el client wrapper**

Create: `lib/integrations/google/sheetsClient.ts`

```typescript
import { google, sheets_v4 } from 'googleapis';
import { getIntegrationAccount } from '@/lib/integrations/accounts';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export async function getSheetsClient(orgId: string): Promise<sheets_v4.Sheets> {
  const account = await getIntegrationAccount(orgId, 'google');
  if (!account) {
    throw new Error('sheets_no_conectado');
  }

  const grantedScopes: string[] = account.scopes || [];
  if (!grantedScopes.includes(SHEETS_SCOPE)) {
    throw new Error('scope_missing');
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  return google.sheets({ version: 'v4', auth: oauth2 });
}
```

- [ ] **Step 5: Correr tests — deben pasar**

Run: `npm test lib/integrations/google/sheetsClient.test.ts`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/oauth/google.ts lib/integrations/google/sheetsClient.ts lib/integrations/google/sheetsClient.test.ts
git commit -m "feat(sheets): add spreadsheets scope + Sheets API client wrapper"
```

---

## Task 3: Servicio Sheets — `getMapping` + `refreshHeaders`

**Files:**
- Create: `lib/services/sheets.ts`
- Create: `lib/services/sheets.test.ts`

**Interfaces:**
- Consumes: `getSheetsClient(orgId)` de Task 2, cliente supabase
- Produces:
  - `getMapping(orgId, purpose, customLabel?) → SheetsMapping | null`
  - `refreshHeaders(mappingId) → {ok, headers?, reason?}`
  - Type `SheetsMapping = {id, org_id, purpose, custom_purpose_label, spreadsheet_id, tab_name, headers: string[], headers_synced_at}`
  - Type `ToolResult<T> = {ok: true, data: T} | {ok: false, reason: string, detail?: string}`

- [ ] **Step 1: Escribir tests**

Create: `lib/services/sheets.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapping, refreshHeaders } from './sheets';

vi.mock('@/lib/integrations/google/sheetsClient');
vi.mock('@/lib/supabase/admin');

describe('getMapping', () => {
  it('returns mapping when found by reserved purpose', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const single = vi.fn().mockResolvedValue({ data: { id: 'm1', purpose: 'clientes' }, error: null });
    const eq3 = vi.fn().mockReturnValue({ single });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) });
    (getSupabaseAdmin as any).mockReturnValue({ from });

    const result = await getMapping('org-1', 'clientes');
    expect(result).toEqual({ id: 'm1', purpose: 'clientes' });
  });

  it('returns null when no mapping', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const single = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ single }) }) }) }) };
    (getSupabaseAdmin as any).mockReturnValue({ from: () => chain });

    const result = await getMapping('org-1', 'clientes');
    expect(result).toBeNull();
  });

  it('requires custom_purpose_label for purpose=custom', async () => {
    await expect(getMapping('org-1', 'custom')).rejects.toThrow('custom_purpose_label required');
  });
});

describe('refreshHeaders', () => {
  it('reads row 1 from tab and updates headers', async () => {
    const { getSheetsClient } = await import('@/lib/integrations/google/sheetsClient');
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');

    const values = { get: vi.fn().mockResolvedValue({ data: { values: [['Nombre','Telefono','Email']] } }) };
    (getSheetsClient as any).mockResolvedValue({ spreadsheets: { values } });

    const update = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ select: () => ({ single: () => ({ data: { id: 'm1' } }) }) });
    const from = vi.fn().mockImplementation(() => ({
      select: () => ({ eq: () => ({ single: () => ({
        data: { id: 'm1', org_id: 'org-1', spreadsheet_id: 'sheet-1', tab_name: 'Clientes' }
      }) }) }),
      update: () => ({ eq }),
    }));
    (getSupabaseAdmin as any).mockReturnValue({ from });

    const result = await refreshHeaders('m1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.headers).toEqual(['Nombre','Telefono','Email']);
    expect(values.get).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 'sheet-1',
      range: "Clientes!1:1",
    }));
  });

  it('returns error when mapping not found', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) })
    });
    const result = await refreshHeaders('missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mapping_not_found');
  });
});
```

- [ ] **Step 2: Correr tests — deben fallar**

Run: `npm test lib/services/sheets.test.ts`
Expected: FAIL (funciones no existen).

- [ ] **Step 3: Implementar `getMapping` + `refreshHeaders`**

Create: `lib/services/sheets.ts`

```typescript
import { getSheetsClient } from '@/lib/integrations/google/sheetsClient';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type SheetsMapping = {
  id: string;
  org_id: string;
  purpose: 'clientes'|'leads'|'bitacoras'|'oc'|'cajas_chicas'|'custom';
  custom_purpose_label: string | null;
  spreadsheet_id: string;
  tab_name: string;
  headers: string[];
  headers_synced_at: string;
};

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; detail?: string };

export async function getMapping(
  orgId: string,
  purpose: SheetsMapping['purpose'],
  customLabel?: string
): Promise<SheetsMapping | null> {
  if (purpose === 'custom' && !customLabel) {
    throw new Error('custom_purpose_label required when purpose=custom');
  }

  const sb = getSupabaseAdmin();
  let query = sb.from('sheets_mappings').select('*').eq('org_id', orgId).eq('purpose', purpose);
  if (purpose === 'custom') {
    query = query.eq('custom_purpose_label', customLabel!);
  }
  const { data, error } = await query.single();
  if (error && error.code !== 'PGRST116') throw error;
  return data as SheetsMapping | null;
}

export async function refreshHeaders(mappingId: string): Promise<ToolResult<{headers: string[]}>> {
  const sb = getSupabaseAdmin();
  const { data: mapping } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!mapping) return { ok: false, reason: 'mapping_not_found' };

  const client = await getSheetsClient(mapping.org_id);
  const range = `${mapping.tab_name}!1:1`;
  const res = await client.spreadsheets.values.get({
    spreadsheetId: mapping.spreadsheet_id,
    range,
  });

  const headers = (res.data.values?.[0] ?? []).map(String);

  await sb
    .from('sheets_mappings')
    .update({ headers, headers_synced_at: new Date().toISOString() })
    .eq('id', mappingId);

  return { ok: true, data: { headers } };
}
```

- [ ] **Step 4: Correr tests — deben pasar**

Run: `npm test lib/services/sheets.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sheets.ts lib/services/sheets.test.ts
git commit -m "feat(sheets): service — getMapping + refreshHeaders"
```

---

## Task 4: Servicio Sheets — `appendRow`

**Files:**
- Modify: `lib/services/sheets.ts` (append + export)
- Modify: `lib/services/sheets.test.ts` (nuevos tests)

**Interfaces:**
- Consumes: `getMapping`, `getSheetsClient`
- Produces: `appendRow(mappingId, data: Record<string, unknown>) → ToolResult<{row_number: number}>`

- [ ] **Step 1: Agregar tests**

Añadir al final de `lib/services/sheets.test.ts`:

```typescript
import { appendRow } from './sheets';

describe('appendRow', () => {
  const setupMock = (mapping: any, appendResult: any) => async () => {
    const { getSheetsClient } = await import('@/lib/integrations/google/sheetsClient');
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');

    const append = vi.fn().mockResolvedValue({
      data: { updates: { updatedRange: appendResult } }
    });
    (getSheetsClient as any).mockResolvedValue({ spreadsheets: { values: { append } } });
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: mapping }) }) }) })
    });
    return append;
  };

  it('maps data object to array by headers order', async () => {
    const setup = setupMock({
      id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes',
      headers: ['Nombre','Telefono','Email'],
    }, 'Clientes!A5:C5');
    const append = await setup();

    const res = await appendRow('m1', { Nombre: 'Juan', Telefono: '555', Email: 'j@x.com' });
    expect(res.ok).toBe(true);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Juan','555','j@x.com']] },
    }));
    if (res.ok) expect(res.data.row_number).toBe(5);
  });

  it('fills missing keys with empty string', async () => {
    const setup = setupMock({
      id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes',
      headers: ['Nombre','Telefono','Email'],
    }, 'Clientes!A5:C5');
    const append = await setup();

    await appendRow('m1', { Nombre: 'Ana' });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: { values: [['Ana','','']] },
    }));
  });

  it('returns headers_mismatch when data has key not in headers', async () => {
    await setupMock({
      id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes',
      headers: ['Nombre'],
    }, 'Clientes!A5:A5')();

    const res = await appendRow('m1', { Nombre: 'X', InexistentField: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('headers_mismatch');
  });

  it('returns mapping_not_found when mapping missing', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) })
    });
    const res = await appendRow('missing', { X: 'y' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('mapping_not_found');
  });
});
```

- [ ] **Step 2: Correr — deben fallar**

Run: `npm test lib/services/sheets.test.ts`
Expected: 4 nuevos FAIL.

- [ ] **Step 3: Implementar `appendRow`**

Añadir a `lib/services/sheets.ts`:

```typescript
export async function appendRow(
  mappingId: string,
  data: Record<string, unknown>
): Promise<ToolResult<{row_number: number}>> {
  const sb = getSupabaseAdmin();
  const { data: mapping } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!mapping) return { ok: false, reason: 'mapping_not_found' };

  const headers: string[] = mapping.headers ?? [];
  const dataKeys = Object.keys(data);
  const unknownKeys = dataKeys.filter(k => !headers.includes(k));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      reason: 'headers_mismatch',
      detail: `Keys not in sheet headers: ${unknownKeys.join(', ')}. Headers: ${headers.join(', ')}`,
    };
  }

  const row = headers.map(h => {
    const v = data[h];
    return v === undefined || v === null ? '' : String(v);
  });

  const client = await getSheetsClient(mapping.org_id);
  const res = await client.spreadsheets.values.append({
    spreadsheetId: mapping.spreadsheet_id,
    range: `${mapping.tab_name}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  const updatedRange = res.data.updates?.updatedRange || '';
  const match = updatedRange.match(/!\D+(\d+):/);
  const rowNumber = match ? parseInt(match[1], 10) : -1;

  return { ok: true, data: { row_number: rowNumber } };
}
```

- [ ] **Step 4: Correr — deben pasar**

Run: `npm test lib/services/sheets.test.ts`
Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sheets.ts lib/services/sheets.test.ts
git commit -m "feat(sheets): service — appendRow with header-based mapping"
```

---

## Task 5: Servicio Sheets — `updateRow` + `readRange` + `searchInTab`

**Files:**
- Modify: `lib/services/sheets.ts`
- Modify: `lib/services/sheets.test.ts`

**Interfaces:**
- Produces:
  - `updateRow(mappingId, matchBy: string, matchValue: string, data: Record<string, unknown>) → ToolResult<{row_number}>`
  - `readRange(mappingId, range?: string) → ToolResult<{rows: Record<string, string>[]}>`
  - `searchInTab(mappingId, query: string) → ToolResult<{rows: Record<string, string>[]}>`

- [ ] **Step 1: Tests para las 3 funciones**

Añadir a `lib/services/sheets.test.ts`:

```typescript
import { updateRow, readRange, searchInTab } from './sheets';

const mkClient = (values: any[][]) => {
  const get = vi.fn().mockResolvedValue({ data: { values } });
  const update = vi.fn().mockResolvedValue({ data: {} });
  return { spreadsheets: { values: { get, update } } };
};

describe('readRange', () => {
  it('returns rows as objects using headers as keys', async () => {
    const { getSheetsClient } = await import('@/lib/integrations/google/sheetsClient');
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    (getSheetsClient as any).mockResolvedValue(mkClient([
      ['Nombre','Telefono'],
      ['Ana','111'],
      ['Beto','222'],
    ]));
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({
        data: { id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre','Telefono'] }
      }) }) }) })
    });

    const res = await readRange('m1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.rows).toEqual([
      { Nombre: 'Ana', Telefono: '111' },
      { Nombre: 'Beto', Telefono: '222' },
    ]);
  });
});

describe('searchInTab', () => {
  it('filters rows case-insensitive across all columns', async () => {
    const { getSheetsClient } = await import('@/lib/integrations/google/sheetsClient');
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    (getSheetsClient as any).mockResolvedValue(mkClient([
      ['Nombre','Telefono'],
      ['Ana Torres','111'],
      ['Beto Ruiz','222'],
      ['Carla ana','333'],
    ]));
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({
        data: { id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'X', headers: ['Nombre','Telefono'] }
      }) }) }) })
    });

    const res = await searchInTab('m1', 'ana');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.rows).toHaveLength(2);
  });
});

describe('updateRow', () => {
  it('finds row by match_by column and updates values', async () => {
    const { getSheetsClient } = await import('@/lib/integrations/google/sheetsClient');
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const client = mkClient([
      ['Nombre','Telefono','Email'],
      ['Ana','111','a@x.com'],
      ['Beto','222','b@x.com'],
    ]);
    (getSheetsClient as any).mockResolvedValue(client);
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({
        data: { id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'Clientes', headers: ['Nombre','Telefono','Email'] }
      }) }) }) })
    });

    const res = await updateRow('m1', 'Nombre', 'Beto', { Telefono: '999' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.row_number).toBe(3);
    expect(client.spreadsheets.values.update).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: 's1',
      range: 'Clientes!A3:C3',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['Beto','999','b@x.com']] },
    }));
  });

  it('returns row_not_found when match_value missing', async () => {
    const { getSheetsClient } = await import('@/lib/integrations/google/sheetsClient');
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    (getSheetsClient as any).mockResolvedValue(mkClient([
      ['Nombre','Telefono'],
      ['Ana','111'],
    ]));
    (getSupabaseAdmin as any).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: () => ({
        data: { id: 'm1', org_id: 'o1', spreadsheet_id: 's1', tab_name: 'X', headers: ['Nombre','Telefono'] }
      }) }) }) })
    });

    const res = await updateRow('m1', 'Nombre', 'Zoe', { Telefono: '999' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('row_not_found');
  });
});
```

- [ ] **Step 2: Correr — deben fallar**

Run: `npm test lib/services/sheets.test.ts`
Expected: 4 nuevos FAIL.

- [ ] **Step 3: Implementar las 3 funciones**

Añadir a `lib/services/sheets.ts`:

```typescript
async function loadAllRows(mappingId: string): Promise<
  | { ok: true; mapping: SheetsMapping; rows: string[][] }
  | { ok: false; reason: string; detail?: string }
> {
  const sb = getSupabaseAdmin();
  const { data: mapping } = await sb.from('sheets_mappings').select('*').eq('id', mappingId).single();
  if (!mapping) return { ok: false, reason: 'mapping_not_found' };

  const client = await getSheetsClient(mapping.org_id);
  const res = await client.spreadsheets.values.get({
    spreadsheetId: mapping.spreadsheet_id,
    range: mapping.tab_name,
  });
  const values = (res.data.values ?? []) as string[][];
  return { ok: true, mapping, rows: values };
}

function rowsToObjects(headers: string[], dataRows: string[][]): Record<string, string>[] {
  return dataRows.map(row => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = row[i] ?? ''; });
    return o;
  });
}

export async function readRange(
  mappingId: string,
  _range?: string
): Promise<ToolResult<{rows: Record<string, string>[]}>> {
  const loaded = await loadAllRows(mappingId);
  if (!loaded.ok) return loaded;
  const headers = loaded.mapping.headers ?? [];
  const dataRows = loaded.rows.slice(1);
  return { ok: true, data: { rows: rowsToObjects(headers, dataRows) } };
}

export async function searchInTab(
  mappingId: string,
  query: string
): Promise<ToolResult<{rows: Record<string, string>[]}>> {
  const loaded = await loadAllRows(mappingId);
  if (!loaded.ok) return loaded;
  const headers = loaded.mapping.headers ?? [];
  const dataRows = loaded.rows.slice(1);
  const q = query.toLowerCase();
  const matched = dataRows.filter(row => row.some(cell => (cell ?? '').toLowerCase().includes(q)));
  return { ok: true, data: { rows: rowsToObjects(headers, matched) } };
}

export async function updateRow(
  mappingId: string,
  matchBy: string,
  matchValue: string,
  data: Record<string, unknown>
): Promise<ToolResult<{row_number: number}>> {
  const loaded = await loadAllRows(mappingId);
  if (!loaded.ok) return loaded;
  const { mapping, rows } = loaded;
  const headers = mapping.headers ?? [];

  const colIdx = headers.indexOf(matchBy);
  if (colIdx === -1) {
    return { ok: false, reason: 'headers_mismatch', detail: `match_by '${matchBy}' not in headers` };
  }

  const dataRows = rows.slice(1);
  const rowIdx = dataRows.findIndex(r => (r[colIdx] ?? '') === matchValue);
  if (rowIdx === -1) return { ok: false, reason: 'row_not_found' };

  const currentRow = [...dataRows[rowIdx]];
  while (currentRow.length < headers.length) currentRow.push('');

  const unknownKeys = Object.keys(data).filter(k => !headers.includes(k));
  if (unknownKeys.length > 0) {
    return { ok: false, reason: 'headers_mismatch', detail: `Keys not in headers: ${unknownKeys.join(', ')}` };
  }

  headers.forEach((h, i) => {
    if (h in data) {
      const v = data[h];
      currentRow[i] = v === undefined || v === null ? '' : String(v);
    }
  });

  const rowNumber = rowIdx + 2; // +1 for headers, +1 to 1-indexed
  const lastCol = String.fromCharCode(65 + headers.length - 1); // A + n
  const client = await getSheetsClient(mapping.org_id);
  await client.spreadsheets.values.update({
    spreadsheetId: mapping.spreadsheet_id,
    range: `${mapping.tab_name}!A${rowNumber}:${lastCol}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [currentRow] },
  });

  return { ok: true, data: { row_number: rowNumber } };
}
```

Nota: `lastCol` con `String.fromCharCode` solo funciona hasta 26 columnas (A-Z). Si un sheet tiene más de 26 columnas, necesita helper A1-notation. Para v1 documentar como limitación conocida.

- [ ] **Step 4: Correr — deben pasar**

Run: `npm test lib/services/sheets.test.ts`
Expected: 13 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sheets.ts lib/services/sheets.test.ts
git commit -m "feat(sheets): service — updateRow + readRange + searchInTab"
```

---

## Task 6: Definir 4 tools + registrar en executor

**Files:**
- Create: `lib/tools/definitions/sheets.ts`
- Modify: `lib/tools/executor.ts` (path real de Task 0)

**Interfaces:**
- Consumes: service functions de Tasks 3-5
- Produces: 4 tools registradas en el executor: `sheets_agregar_fila`, `sheets_actualizar_fila`, `sheets_leer`, `sheets_buscar`. Cada una acepta arg `purpose` + opcional `custom_purpose_label`, resuelve mapping por `(orgId, purpose)`, delega al servicio.

- [ ] **Step 1: Escribir tests de las tools**

Create: `lib/tools/definitions/sheets.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { sheetsTools } from './sheets';

vi.mock('@/lib/services/sheets', () => ({
  getMapping: vi.fn(),
  appendRow: vi.fn(),
  updateRow: vi.fn(),
  readRange: vi.fn(),
  searchInTab: vi.fn(),
}));

describe('sheets_agregar_fila', () => {
  it('resolves mapping and calls appendRow', async () => {
    const { getMapping, appendRow } = await import('@/lib/services/sheets');
    (getMapping as any).mockResolvedValue({ id: 'm1' });
    (appendRow as any).mockResolvedValue({ ok: true, data: { row_number: 5 } });

    const tool = sheetsTools.find(t => t.name === 'sheets_agregar_fila')!;
    const res = await tool.execute(
      { purpose: 'clientes', data: { Nombre: 'X' } },
      { orgId: 'org-1' } as any
    );
    expect(res).toEqual({ ok: true, row_number: 5 });
    expect(getMapping).toHaveBeenCalledWith('org-1', 'clientes', undefined);
    expect(appendRow).toHaveBeenCalledWith('m1', { Nombre: 'X' });
  });

  it('returns sheet_no_configurado when mapping missing', async () => {
    const { getMapping } = await import('@/lib/services/sheets');
    (getMapping as any).mockResolvedValue(null);

    const tool = sheetsTools.find(t => t.name === 'sheets_agregar_fila')!;
    const res = await tool.execute(
      { purpose: 'clientes', data: { Nombre: 'X' } },
      { orgId: 'org-1' } as any
    );
    expect(res).toEqual({ ok: false, reason: 'sheet_no_configurado', purpose: 'clientes' });
  });
});
```

Añadir tests análogos para las otras 3 tools (mismo patrón: mock + verify delegation).

- [ ] **Step 2: Correr — deben fallar**

Run: `npm test lib/tools/definitions/sheets.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar las 4 tools**

Create: `lib/tools/definitions/sheets.ts`

```typescript
import * as sheetsService from '@/lib/services/sheets';

type ToolContext = { orgId: string; agentId?: string };

type SheetsTool = {
  name: string;
  description: string;
  parameters: any; // JSONSchema, definido abajo por tool
  capability: string;
  execute: (args: any, ctx: ToolContext) => Promise<any>;
};

const purposeEnum = ['clientes','leads','bitacoras','oc','cajas_chicas','custom'] as const;

async function resolveMapping(
  orgId: string,
  purpose: typeof purposeEnum[number],
  customLabel?: string
) {
  const mapping = await sheetsService.getMapping(orgId, purpose, customLabel);
  if (!mapping) return { error: { ok: false, reason: 'sheet_no_configurado', purpose } };
  return { mapping };
}

export const sheetsTools: SheetsTool[] = [
  {
    name: 'sheets_agregar_fila',
    description: 'Agrega una fila al Google Sheet configurado para un propósito (clientes, leads, bitácoras, órdenes de compra, cajas chicas, o personalizado).',
    capability: 'sheets.write',
    parameters: {
      type: 'object',
      required: ['purpose', 'data'],
      properties: {
        purpose: { type: 'string', enum: [...purposeEnum] },
        custom_purpose_label: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
    },
    async execute({ purpose, custom_purpose_label, data }, ctx) {
      const r = await resolveMapping(ctx.orgId, purpose, custom_purpose_label);
      if ('error' in r) return r.error;
      const res = await sheetsService.appendRow(r.mapping.id, data);
      return res.ok
        ? { ok: true, row_number: res.data.row_number }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
  {
    name: 'sheets_actualizar_fila',
    description: 'Actualiza una fila existente en el Google Sheet, buscando por una columna y valor.',
    capability: 'sheets.write',
    parameters: {
      type: 'object',
      required: ['purpose', 'match_by', 'match_value', 'data'],
      properties: {
        purpose: { type: 'string', enum: [...purposeEnum] },
        custom_purpose_label: { type: 'string' },
        match_by: { type: 'string', description: 'Nombre de columna para buscar' },
        match_value: { type: 'string', description: 'Valor a buscar en esa columna' },
        data: { type: 'object', additionalProperties: true },
      },
    },
    async execute({ purpose, custom_purpose_label, match_by, match_value, data }, ctx) {
      const r = await resolveMapping(ctx.orgId, purpose, custom_purpose_label);
      if ('error' in r) return r.error;
      const res = await sheetsService.updateRow(r.mapping.id, match_by, match_value, data);
      return res.ok
        ? { ok: true, row_number: res.data.row_number }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
  {
    name: 'sheets_leer',
    description: 'Lee el contenido del Google Sheet configurado para un propósito, devuelve las filas como objetos.',
    capability: 'sheets.read',
    parameters: {
      type: 'object',
      required: ['purpose'],
      properties: {
        purpose: { type: 'string', enum: [...purposeEnum] },
        custom_purpose_label: { type: 'string' },
        range: { type: 'string', description: 'Rango A1 opcional' },
      },
    },
    async execute({ purpose, custom_purpose_label, range }, ctx) {
      const r = await resolveMapping(ctx.orgId, purpose, custom_purpose_label);
      if ('error' in r) return r.error;
      const res = await sheetsService.readRange(r.mapping.id, range);
      return res.ok
        ? { ok: true, rows: res.data.rows }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
  {
    name: 'sheets_buscar',
    description: 'Busca filas en el Google Sheet configurado que contengan un texto (case-insensitive).',
    capability: 'sheets.read',
    parameters: {
      type: 'object',
      required: ['purpose', 'query'],
      properties: {
        purpose: { type: 'string', enum: [...purposeEnum] },
        custom_purpose_label: { type: 'string' },
        query: { type: 'string' },
      },
    },
    async execute({ purpose, custom_purpose_label, query }, ctx) {
      const r = await resolveMapping(ctx.orgId, purpose, custom_purpose_label);
      if ('error' in r) return r.error;
      const res = await sheetsService.searchInTab(r.mapping.id, query);
      return res.ok
        ? { ok: true, rows: res.data.rows }
        : { ok: false, reason: res.reason, detail: res.detail };
    },
  },
];
```

- [ ] **Step 4: Registrar tools en el executor**

Modify: `lib/tools/executor.ts` (path real de Task 0)

```typescript
import { sheetsTools } from './definitions/sheets';

// En el array/map de tools registradas:
export const ALL_TOOLS = [
  ...existingTools,
  ...sheetsTools,
];
```

Exacto depende del patrón actual del executor. Si el executor es un switch/map, agregar cada tool por nombre. Sesión 30 estableció que executor es fuente única — verificar.

- [ ] **Step 5: Correr tests — deben pasar**

Run: `npm test lib/tools/definitions/sheets.test.ts`
Expected: PASS todas (mínimo 8 tests si duplicaste el patrón para las 4 tools).

- [ ] **Step 6: Commit**

```bash
git add lib/tools/definitions/sheets.ts lib/tools/definitions/sheets.test.ts lib/tools/executor.ts
git commit -m "feat(sheets): 4 tools registered in executor (chat + email inherit)"
```

---

## Task 7: Exponer tools de sheets en voz (`buildTools`)

**Files:**
- Modify: `lib/vapi/buildTools.ts` (path real de Task 0)

**Interfaces:**
- Produces: las 4 tools de sheets disponibles en el prompt de voz cuando la org tiene mapping configurado

- [ ] **Step 1: Escribir test**

Modify test file de buildTools (identificar en Task 0):

```typescript
it('includes sheets tools when org has any sheets_mapping', async () => {
  // Mock getMappingsForOrg to return [{purpose: 'clientes'}]
  const tools = await buildTools({ orgId: 'org-1', agentId: 'a-1' });
  const names = tools.map(t => t.function.name);
  expect(names).toContain('sheets_agregar_fila');
  expect(names).toContain('sheets_actualizar_fila');
  expect(names).toContain('sheets_leer');
  expect(names).toContain('sheets_buscar');
});

it('omits sheets tools when org has no mappings', async () => {
  // Mock getMappingsForOrg to return []
  const tools = await buildTools({ orgId: 'org-2', agentId: 'a-2' });
  const names = tools.map(t => t.function.name);
  expect(names).not.toContain('sheets_agregar_fila');
});
```

- [ ] **Step 2: Correr — falla**

Run: `npm test lib/vapi/buildTools.test.ts`
Expected: FAIL.

- [ ] **Step 3: Agregar sheets tools condicional en `buildTools`**

Añadir a `lib/services/sheets.ts`:

```typescript
export async function hasAnyMapping(orgId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { count } = await sb
    .from('sheets_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  return (count ?? 0) > 0;
}
```

En `buildTools.ts`:

```typescript
import { sheetsTools } from '@/lib/tools/definitions/sheets';
import { hasAnyMapping } from '@/lib/services/sheets';

// Al final del builder, antes del return:
if (await hasAnyMapping(orgId)) {
  for (const t of sheetsTools) {
    tools.push({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    });
  }
}
```

Formato exacto del push depende del schema Vapi actual — verificar cómo se agregan otras tools en el mismo archivo y seguir el patrón.

- [ ] **Step 4: Correr — pasa**

Run: `npm test lib/vapi/buildTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sheets.ts lib/vapi/buildTools.ts lib/vapi/buildTools.test.ts
git commit -m "feat(sheets): expose 4 sheets tools in Vapi buildTools (conditional on mapping)"
```

---

## Task 8: Sync opcional `crear_lead → sheets_agregar_fila`

**Files:**
- Modify: `lib/tools/definitions/crearLead.ts` (path exacto verificar en repo)

**Interfaces:**
- Consumes: `hasAnyMapping`, `getMapping`, `appendRow`, campo `voice_agents.sync_leads_to_sheets`

- [ ] **Step 1: Test para el sync**

Añadir a `lib/tools/definitions/crearLead.test.ts`:

```typescript
it('appends to sheets when agent.sync_leads_to_sheets=true and mapping exists', async () => {
  // mock voice_agents.sync_leads_to_sheets = true
  // mock getMapping(purpose='leads') returns {id: 'm1'}
  // mock appendRow returns {ok:true, data:{row_number: 3}}
  const res = await crearLead.execute({ nombre: 'X', telefono: '555' }, { orgId: 'o1', agentId: 'a1' });
  expect(appendRow).toHaveBeenCalledWith('m1', expect.objectContaining({ nombre: 'X' }));
  expect(res.ok).toBe(true); // main flow succeeds regardless
});

it('does not append when sync_leads_to_sheets=false', async () => {
  // mock voice_agents.sync_leads_to_sheets = false
  await crearLead.execute({ nombre: 'X' }, { orgId: 'o1', agentId: 'a1' });
  expect(appendRow).not.toHaveBeenCalled();
});

it('does not fail crear_lead when sheets sync throws', async () => {
  // mock sync=true, mapping=null (or appendRow throws)
  const res = await crearLead.execute({ nombre: 'X' }, { orgId: 'o1', agentId: 'a1' });
  expect(res.ok).toBe(true);
});
```

- [ ] **Step 2: Correr — falla**

Run: `npm test lib/tools/definitions/crearLead.test.ts`
Expected: FAIL.

- [ ] **Step 3: Agregar sync fire-and-forget**

En el executor de `crear_lead`, después del insert exitoso en `leads_voice`:

```typescript
// Fire-and-forget sync a Sheets, no bloquea respuesta al usuario
(async () => {
  try {
    const sb = getSupabaseAdmin();
    const { data: agent } = await sb
      .from('voice_agents')
      .select('sync_leads_to_sheets')
      .eq('id', ctx.agentId)
      .single();
    if (!agent?.sync_leads_to_sheets) return;

    const mapping = await getMapping(ctx.orgId, 'leads');
    if (!mapping) return;

    const result = await appendRow(mapping.id, {
      nombre: args.nombre,
      telefono: args.telefono,
      email: args.email ?? '',
      notas: args.notas ?? '',
      fuente: 'voz',
      fecha: new Date().toISOString(),
    });

    if (!result.ok) {
      // Log a agent_learnings para visibilidad, no romper crear_lead
      await sb.from('agent_learnings').insert({
        agent_id: ctx.agentId,
        source: 'sheets_sync_fail',
        content: `crear_lead sync a Sheets falló: ${result.reason} ${result.detail ?? ''}`,
      });
    }
  } catch (e: any) {
    // Silent — no romper el flujo principal
    console.error('[sheets sync leads]', e?.message);
  }
})();
```

Nota: keys del `data` deben matchear headers del sheet. Si el negocio tiene headers distintos (ej. "Nombre" vs "nombre"), el sync retorna `headers_mismatch` — se loguea pero no rompe. Documentar en UI la recomendación de usar headers estándar para leads.

- [ ] **Step 4: Correr — pasa**

Run: `npm test lib/tools/definitions/crearLead.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tools/definitions/crearLead.ts lib/tools/definitions/crearLead.test.ts
git commit -m "feat(sheets): fire-and-forget sync crear_lead → Sheets when enabled"
```

---

## Task 9: Policy engine — registrar capabilities `sheets.read` + `sheets.write`

**Files:**
- Modify: archivo de policy engine registry (path de Task 0)

**Interfaces:**
- Produces: capabilities `sheets.read` (default allow) y `sheets.write` (default requires_approval) registradas, mapeadas a las 4 tools

- [ ] **Step 1: Test**

Añadir al test del policy engine:

```typescript
it('sheets.read default policy is allow', () => {
  const policy = getDefaultPolicy('sheets.read');
  expect(policy).toBe('allow');
});

it('sheets.write default policy is requires_approval', () => {
  const policy = getDefaultPolicy('sheets.write');
  expect(policy).toBe('requires_approval');
});

it('sheets_agregar_fila maps to sheets.write capability', () => {
  expect(getToolCapability('sheets_agregar_fila')).toBe('sheets.write');
});

it('sheets_leer maps to sheets.read capability', () => {
  expect(getToolCapability('sheets_leer')).toBe('sheets.read');
});
```

- [ ] **Step 2: Correr — falla**

Run: `npm test` con el filtro del archivo policy engine.
Expected: FAIL.

- [ ] **Step 3: Registrar en el registry**

En el archivo del policy registry (sesión 6 estableció el patrón `provider_capabilities`), agregar:

```typescript
export const CAPABILITY_DEFAULTS = {
  // ... existentes
  'sheets.read': 'allow',
  'sheets.write': 'requires_approval',
};

export const TOOL_TO_CAPABILITY = {
  // ... existentes
  'sheets_agregar_fila': 'sheets.write',
  'sheets_actualizar_fila': 'sheets.write',
  'sheets_leer': 'sheets.read',
  'sheets_buscar': 'sheets.read',
};
```

- [ ] **Step 4: Correr — pasa**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/policies/registry.ts lib/policies/registry.test.ts
git commit -m "feat(sheets): register sheets.read (allow) + sheets.write (requires_approval)"
```

---

## Task 10: API routes — CRUD de sheets_mappings + listar spreadsheets/tabs + refresh headers

**Files:**
- Create: `app/api/portal/sheets-mappings/route.ts` (GET list, POST create)
- Create: `app/api/portal/sheets-mappings/[id]/route.ts` (GET, PATCH, DELETE)
- Create: `app/api/portal/sheets-mappings/[id]/refresh-headers/route.ts` (POST)
- Create: `app/api/portal/sheets/spreadsheets/route.ts` (GET list Drive spreadsheets)
- Create: `app/api/portal/sheets/spreadsheets/[spreadsheetId]/tabs/route.ts` (GET tabs)

**Interfaces:**
- Consumes: session helper para verificar org ownership (patrón IDOR de sesión 36); `refreshHeaders`; cliente Drive existente
- Produces: 5 endpoints portal

- [ ] **Step 1: Test para POST + GET list**

Create: `app/api/portal/sheets-mappings/route.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { POST, GET } from './route';

vi.mock('@/lib/auth/session');
vi.mock('@/lib/supabase/admin');
vi.mock('@/lib/services/sheets');

describe('POST /api/portal/sheets-mappings', () => {
  it('returns 401 when no session', async () => {
    const { getSession } = await import('@/lib/auth/session');
    (getSession as any).mockResolvedValue(null);
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('creates mapping and refreshes headers on success', async () => {
    // mock session, mock supabase insert returning {id: 'm1'}, mock refreshHeaders
    // POST body: {purpose:'clientes', spreadsheet_id:'s1', tab_name:'Clientes'}
    // expect insert called with org_id from session
    // expect refreshHeaders('m1') called
    // expect 200 with {id:'m1'}
  });

  it('rejects invalid purpose', async () => {
    // POST body: {purpose:'invalid', ...}
    // expect 400
  });
});
```

- [ ] **Step 2: Falla**

Expected: FAIL.

- [ ] **Step 3: Implementar la ruta**

Create: `app/api/portal/sheets-mappings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { refreshHeaders } from '@/lib/services/sheets';

const PURPOSES = ['clientes','leads','bitacoras','oc','cajas_chicas','custom'] as const;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('sheets_mappings')
    .select('*')
    .eq('org_id', session.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mappings: data });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { purpose, custom_purpose_label, spreadsheet_id, tab_name } = body;

  if (!PURPOSES.includes(purpose)) {
    return NextResponse.json({ error: 'invalid_purpose' }, { status: 400 });
  }
  if (purpose === 'custom' && !custom_purpose_label) {
    return NextResponse.json({ error: 'custom_purpose_label_required' }, { status: 400 });
  }
  if (!spreadsheet_id || !tab_name) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('sheets_mappings')
    .insert({
      org_id: session.orgId,
      purpose,
      custom_purpose_label: purpose === 'custom' ? custom_purpose_label : null,
      spreadsheet_id,
      tab_name,
      headers: [],
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await refreshHeaders(data.id);

  return NextResponse.json({ id: data.id });
}
```

- [ ] **Step 4: Test para PATCH + DELETE por id (verifica IDOR)**

Create: `app/api/portal/sheets-mappings/[id]/route.test.ts`

```typescript
it('DELETE returns 404 when mapping belongs to another org', async () => {
  // mock session with orgId='o1'
  // mock supabase to return mapping with org_id='o2'
  // expect 404
});
```

- [ ] **Step 5: Implementar PATCH + DELETE con IDOR**

Create: `app/api/portal/sheets-mappings/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

async function verifyOwn(id: string, orgId: string) {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('sheets_mappings').select('id, org_id').eq('id', id).single();
  return data && data.org_id === orgId ? data : null;
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await verifyOwn(params.id, session.orgId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const sb = getSupabaseAdmin();
  await sb.from('sheets_mappings').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await verifyOwn(params.id, session.orgId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json();
  const allowedFields = ['spreadsheet_id', 'tab_name', 'custom_purpose_label'];
  const patch: any = {};
  for (const k of allowedFields) if (k in body) patch[k] = body[k];
  patch.updated_at = new Date().toISOString();

  const sb = getSupabaseAdmin();
  await sb.from('sheets_mappings').update(patch).eq('id', params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Implementar refresh-headers route**

Create: `app/api/portal/sheets-mappings/[id]/refresh-headers/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { refreshHeaders } from '@/lib/services/sheets';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data: mapping } = await sb.from('sheets_mappings').select('org_id').eq('id', params.id).single();
  if (!mapping || mapping.org_id !== session.orgId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const result = await refreshHeaders(params.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });
  return NextResponse.json({ headers: result.data.headers });
}
```

- [ ] **Step 7: Implementar list de spreadsheets desde Drive**

Create: `app/api/portal/sheets/spreadsheets/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { google } from 'googleapis';
import { getIntegrationAccount } from '@/lib/integrations/accounts';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await getIntegrationAccount(session.orgId, 'google');
  if (!account) return NextResponse.json({ error: 'google_no_conectado' }, { status: 400 });

  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth.setCredentials({ access_token: account.access_token, refresh_token: account.refresh_token });

  const drive = google.drive({ version: 'v3', auth: oauth });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 100,
    fields: 'files(id, name)',
  });

  return NextResponse.json({ spreadsheets: res.data.files ?? [] });
}
```

- [ ] **Step 8: Implementar list de tabs**

Create: `app/api/portal/sheets/spreadsheets/[spreadsheetId]/tabs/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSheetsClient } from '@/lib/integrations/google/sheetsClient';

export async function GET(
  req: NextRequest,
  { params }: { params: { spreadsheetId: string } }
) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const client = await getSheetsClient(session.orgId);
    const res = await client.spreadsheets.get({
      spreadsheetId: params.spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const tabs = (res.data.sheets ?? []).map(s => s.properties?.title).filter(Boolean);
    return NextResponse.json({ tabs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 9: Correr todos los tests**

Run: `npm test app/api/portal/sheets`
Expected: PASS todos.

- [ ] **Step 10: Commit**

```bash
git add app/api/portal/sheets-mappings/ app/api/portal/sheets/
git commit -m "feat(sheets): portal API routes for mappings CRUD + Drive/Sheets metadata"
```

---

## Task 11: IntegrationsHub — nueva `GoogleWorkspaceCard` (reemplaza Gmail + Drive cards)

**Files:**
- Delete: `components/integrations/GmailCard.tsx`
- Delete: `components/integrations/DriveCard.tsx`
- Create: `components/integrations/GoogleWorkspaceCard.tsx`
- Modify: `components/integrations/IntegrationsHub.tsx` (o el parent que renderiza las cards)

**Interfaces:**
- Consumes: hook/endpoint existente que retorna estado de `integration_accounts` para el org
- Produces: 1 card unificada que muestra 3 líneas de capability (Gmail, Drive, Sheets) con check/warning

- [ ] **Step 1: Escribir componente Story o test visual (si tienen Storybook — si no, saltar)**

Si no hay setup de testing visual, este componente se valida por E2E manual en Task 13.

- [ ] **Step 2: Crear `GoogleWorkspaceCard`**

Create: `components/integrations/GoogleWorkspaceCard.tsx`

```tsx
'use client';

import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type ScopeStatus = 'granted' | 'missing' | 'expired';

type Props = {
  connected: boolean;
  email: string | null;
  scopes: {
    gmail: ScopeStatus;
    drive: ScopeStatus;
    sheets: ScopeStatus;
  };
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
};

const CAPS = [
  { key: 'gmail', label: 'Correo (Gmail)', helper: null },
  { key: 'drive', label: 'Archivos (Drive)', helper: 'Almacena documentos generados en formato Word, Excel y PowerPoint.' },
  { key: 'sheets', label: 'Hojas de cálculo (Sheets)', helper: null },
] as const;

export function GoogleWorkspaceCard({ connected, email, scopes, onConnect, onReconnect, onDisconnect }: Props) {
  const hasMissing = Object.values(scopes).some(s => s === 'missing');
  const hasExpired = Object.values(scopes).some(s => s === 'expired');

  return (
    <div className="rounded-lg border border-slate-200 p-5 bg-white">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center">
            <GoogleLogo className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Google Workspace</h3>
            {email && <p className="text-sm text-slate-500">{email}</p>}
          </div>
        </div>
        <StatusBadge connected={connected} hasExpired={hasExpired} hasMissing={hasMissing} />
      </div>

      <ul className="mt-4 space-y-2">
        {CAPS.map(cap => {
          const status = scopes[cap.key];
          return (
            <li key={cap.key} className="flex items-start gap-2">
              <ScopeIcon status={status} />
              <div>
                <span className={status === 'granted' ? 'text-slate-800' : 'text-slate-500'}>
                  {cap.label}
                </span>
                {cap.helper && <p className="text-xs text-slate-500 mt-0.5">{cap.helper}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        {!connected && (
          <button onClick={onConnect} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm">
            Conectar Google Workspace
          </button>
        )}
        {connected && (hasMissing || hasExpired) && (
          <button onClick={onReconnect} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm">
            Reconectar
          </button>
        )}
        {connected && (
          <button onClick={onDisconnect} className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 text-sm">
            Desconectar
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ connected, hasExpired, hasMissing }: any) {
  if (!connected) return <span className="text-sm text-slate-500">Desconectado</span>;
  if (hasExpired) return <span className="text-sm text-amber-600">Token expirado</span>;
  if (hasMissing) return <span className="text-sm text-amber-600">Scope pendiente</span>;
  return <span className="text-sm text-emerald-600">Conectado</span>;
}

function ScopeIcon({ status }: { status: ScopeStatus }) {
  if (status === 'granted') return <Check className="w-4 h-4 text-emerald-600 mt-0.5" />;
  return <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />;
}

function GoogleLogo({ className }: { className?: string }) {
  return <span className={className}>G</span>; // placeholder — reemplazar con SVG oficial de Google Brand
}
```

Reglas: sin emojis (Lucide only ✓), sin em dash en copy ✓, sin "IA" ✓.

- [ ] **Step 3: Reemplazar en `IntegrationsHub`**

Modify: `components/integrations/IntegrationsHub.tsx`

Eliminar imports de `GmailCard` y `DriveCard`. Importar `GoogleWorkspaceCard`. Reemplazar los 2 renders por 1. El estado de scopes se calcula así:

```typescript
const googleAccount = accounts.find(a => a.provider === 'google');
const grantedScopes = googleAccount?.scopes ?? [];
const scopeStatus = {
  gmail: grantedScopes.includes('https://www.googleapis.com/auth/gmail.modify') ? 'granted' : 'missing',
  drive: grantedScopes.includes('https://www.googleapis.com/auth/drive.file') ? 'granted' : 'missing',
  sheets: grantedScopes.includes('https://www.googleapis.com/auth/spreadsheets') ? 'granted' : 'missing',
};
if (googleAccount?.status === 'expired') {
  // marcar todos como expired
  Object.keys(scopeStatus).forEach(k => scopeStatus[k] = 'expired');
}
```

- [ ] **Step 4: Borrar componentes viejos**

```bash
rm components/integrations/GmailCard.tsx components/integrations/DriveCard.tsx
```

Verificar que no queden imports huérfanos:

Run: `grep -rn "GmailCard\|DriveCard" src/ app/ components/ --include="*.ts*"`
Expected: sin resultados.

- [ ] **Step 5: Correr type check + build**

Run: `npm run typecheck && npm run build`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add components/integrations/GoogleWorkspaceCard.tsx components/integrations/IntegrationsHub.tsx
git rm components/integrations/GmailCard.tsx components/integrations/DriveCard.tsx
git commit -m "feat(integrations): unify Gmail + Drive + Sheets under Google Workspace card"
```

---

## Task 12: UI config del agente — sección "Sheets del negocio"

**Files:**
- Create: `components/agent/SheetsConfigSection.tsx`
- Create: `components/agent/SheetMappingCard.tsx`
- Modify: página de config del agente (path a identificar — probablemente `app/portal/agentes/[id]/configurar/page.tsx` o similar)

**Interfaces:**
- Consumes: rutas API de Task 10 (`GET /api/portal/sheets-mappings`, `POST`, `PATCH`, `DELETE`, `GET .../spreadsheets`, `GET .../tabs`, `POST .../refresh-headers`)
- Produces: sección UI con 5 tarjetas de purposes + botón agregar custom + toggle sync leads

- [ ] **Step 1: Crear `SheetMappingCard`**

Create: `components/agent/SheetMappingCard.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';

type Props = {
  purpose: string;
  label: string;
  customLabel?: string;
  existingMapping: {id: string, spreadsheet_id: string, tab_name: string, headers: string[]} | null;
  onSaved: () => void;
  onDeleted: () => void;
};

export function SheetMappingCard({ purpose, label, customLabel, existingMapping, onSaved, onDeleted }: Props) {
  const [spreadsheets, setSpreadsheets] = useState<{id: string, name: string}[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(existingMapping?.spreadsheet_id ?? '');
  const [selectedTab, setSelectedTab] = useState(existingMapping?.tab_name ?? '');
  const [headers, setHeaders] = useState<string[]>(existingMapping?.headers ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/portal/sheets/spreadsheets')
      .then(r => r.json())
      .then(d => setSpreadsheets(d.spreadsheets ?? []));
  }, []);

  useEffect(() => {
    if (!selectedSheet) { setTabs([]); return; }
    fetch(`/api/portal/sheets/spreadsheets/${selectedSheet}/tabs`)
      .then(r => r.json())
      .then(d => setTabs(d.tabs ?? []));
  }, [selectedSheet]);

  const save = async () => {
    setSaving(true);
    const body = { purpose, custom_purpose_label: customLabel, spreadsheet_id: selectedSheet, tab_name: selectedTab };
    const res = await fetch('/api/portal/sheets-mappings', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
    });
    if (res.ok) {
      const d = await res.json();
      // refresh headers response ya vino en el POST via refreshHeaders interno
      onSaved();
    }
    setSaving(false);
  };

  const refresh = async () => {
    if (!existingMapping) return;
    const res = await fetch(`/api/portal/sheets-mappings/${existingMapping.id}/refresh-headers`, { method: 'POST' });
    if (res.ok) {
      const d = await res.json();
      setHeaders(d.headers);
    }
  };

  const del = async () => {
    if (!existingMapping) return;
    if (!confirm(`Desconectar sheet de ${label}?`)) return;
    await fetch(`/api/portal/sheets-mappings/${existingMapping.id}`, { method: 'DELETE' });
    onDeleted();
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-white">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-slate-900">{customLabel || label}</h4>
        {existingMapping && (
          <div className="flex gap-1">
            <button onClick={refresh} className="p-1 text-slate-500 hover:text-slate-900" title="Re-detectar headers">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={del} className="p-1 text-slate-500 hover:text-red-600" title="Desconectar">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <select
          value={selectedSheet}
          onChange={e => setSelectedSheet(e.target.value)}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">Elige un spreadsheet</option>
          {spreadsheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select
          value={selectedTab}
          onChange={e => setSelectedTab(e.target.value)}
          disabled={!selectedSheet}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">Elige un tab</option>
          {tabs.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {headers.length > 0 && (
          <div className="pt-2">
            <p className="text-xs text-slate-500 mb-1">Columnas detectadas:</p>
            <div className="flex flex-wrap gap-1">
              {headers.map(h => (
                <span key={h} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {!existingMapping && selectedSheet && selectedTab && (
          <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `SheetsConfigSection`**

Create: `components/agent/SheetsConfigSection.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { SheetMappingCard } from './SheetMappingCard';

const RESERVED = [
  { purpose: 'clientes', label: 'Clientes' },
  { purpose: 'leads', label: 'Leads' },
  { purpose: 'bitacoras', label: 'Bitácoras' },
  { purpose: 'oc', label: 'Órdenes de Compra' },
  { purpose: 'cajas_chicas', label: 'Cajas Chicas' },
];

type Mapping = {
  id: string;
  purpose: string;
  custom_purpose_label: string | null;
  spreadsheet_id: string;
  tab_name: string;
  headers: string[];
};

type Props = {
  agentId: string;
  syncLeadsEnabled: boolean;
  onToggleSyncLeads: (v: boolean) => void;
};

export function SheetsConfigSection({ agentId, syncLeadsEnabled, onToggleSyncLeads }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/portal/sheets-mappings');
    const d = await res.json();
    setMappings(d.mappings ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const byPurpose = (p: string) => mappings.find(m => m.purpose === p && !m.custom_purpose_label);
  const customs = mappings.filter(m => m.purpose === 'custom');

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Sheets del negocio</h3>
        <p className="text-sm text-slate-500">
          Conecta un Google Sheet a cada tipo de dato. El empleado escribirá y leerá directamente en tus sheets existentes, respetando los encabezados que ya tienes.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando...</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {RESERVED.map(r => (
              <SheetMappingCard
                key={r.purpose}
                purpose={r.purpose}
                label={r.label}
                existingMapping={byPurpose(r.purpose) ?? null}
                onSaved={load}
                onDeleted={load}
              />
            ))}
            {customs.map(c => (
              <SheetMappingCard
                key={c.id}
                purpose="custom"
                label="Personalizado"
                customLabel={c.custom_purpose_label ?? ''}
                existingMapping={c}
                onSaved={load}
                onDeleted={load}
              />
            ))}
          </div>

          {!addingCustom && (
            <button
              onClick={() => setAddingCustom(true)}
              className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900"
            >
              <Plus className="w-4 h-4" />
              Agregar sheet personalizado
            </button>
          )}

          {addingCustom && (
            <div className="rounded-lg border border-dashed border-slate-300 p-3">
              <input
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                placeholder="Nombre del propósito (ej. Inventario)"
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-2"
              />
              {customLabel && (
                <SheetMappingCard
                  purpose="custom"
                  label={customLabel}
                  customLabel={customLabel}
                  existingMapping={null}
                  onSaved={() => { setAddingCustom(false); setCustomLabel(''); load(); }}
                  onDeleted={load}
                />
              )}
              <button
                onClick={() => { setAddingCustom(false); setCustomLabel(''); }}
                className="mt-2 text-sm text-slate-500"
              >
                Cancelar
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={syncLeadsEnabled}
                onChange={e => onToggleSyncLeads(e.target.checked)}
              />
              <span>Sincronizar automáticamente los leads capturados por este empleado al sheet de Leads</span>
            </label>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Integrar la sección en la página de config del agente**

Modificar la página identificada, importar y renderizar `<SheetsConfigSection agentId={agent.id} syncLeadsEnabled={agent.sync_leads_to_sheets} onToggleSyncLeads={handleToggle} />` donde tenga sentido en el layout (probable: después de la sección Integraciones).

`handleToggle` debe llamar al endpoint PATCH que ya existe para actualizar `voice_agents.sync_leads_to_sheets` (verificar que el endpoint acepta este campo; si no, agregarlo a la whitelist).

- [ ] **Step 4: Type check + build**

Run: `npm run typecheck && npm run build`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add components/agent/SheetsConfigSection.tsx components/agent/SheetMappingCard.tsx app/portal/agentes/
git commit -m "feat(sheets): agent config UI — 5 reserved purposes + custom + sync leads toggle"
```

---

## Task 13: E2E integration test contra sheet real de Pneuma

**Files:**
- Create: `tests/integration/sheets.e2e.test.ts`

**Interfaces:**
- Consumes: sheet real "Centinelia Test Sheet" en `centinelia.dev@gmail.com` Drive con tab "Clientes" (headers: Nombre, Telefono, Email)
- Produces: test que valida los 4 flows end-to-end contra Google API real

- [ ] **Step 1: Escribir el test**

Create: `tests/integration/sheets.e2e.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { getSheetsClient } from '@/lib/integrations/google/sheetsClient';
import { getMapping, refreshHeaders, appendRow, updateRow, readRange, searchInTab } from '@/lib/services/sheets';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const TEST_ORG_ID = process.env.TEST_ORG_ID!; // org de Pneuma con Google conectado + scope sheets
const TEST_SPREADSHEET_ID = process.env.TEST_SPREADSHEET_ID!;
const TEST_TAB = 'Clientes';

let mappingId: string;

beforeAll(async () => {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('sheets_mappings').upsert({
    org_id: TEST_ORG_ID,
    purpose: 'clientes',
    spreadsheet_id: TEST_SPREADSHEET_ID,
    tab_name: TEST_TAB,
    headers: [],
  }, { onConflict: 'org_id,purpose' }).select('id').single();
  mappingId = data!.id;
  await refreshHeaders(mappingId);
});

describe('Sheets E2E', () => {
  it('reads current headers from row 1', async () => {
    const mapping = await getMapping(TEST_ORG_ID, 'clientes');
    expect(mapping?.headers.length).toBeGreaterThan(0);
  });

  it('appends a row and finds it by search', async () => {
    const uniqueName = `TestUser-${Date.now()}`;
    const appendRes = await appendRow(mappingId, { Nombre: uniqueName, Telefono: '5555555555', Email: 'test@x.com' });
    expect(appendRes.ok).toBe(true);

    const searchRes = await searchInTab(mappingId, uniqueName);
    expect(searchRes.ok).toBe(true);
    if (searchRes.ok) expect(searchRes.data.rows.length).toBe(1);
  });

  it('updates a row by match', async () => {
    const uniqueName = `TestUpdate-${Date.now()}`;
    await appendRow(mappingId, { Nombre: uniqueName, Telefono: '111', Email: 'a@x.com' });

    const upd = await updateRow(mappingId, 'Nombre', uniqueName, { Telefono: '999' });
    expect(upd.ok).toBe(true);

    const search = await searchInTab(mappingId, uniqueName);
    expect(search.ok).toBe(true);
    if (search.ok) expect(search.data.rows[0].Telefono).toBe('999');
  });

  it('reads all rows as objects', async () => {
    const read = await readRange(mappingId);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(Array.isArray(read.data.rows)).toBe(true);
      if (read.data.rows.length > 0) {
        expect(read.data.rows[0]).toHaveProperty('Nombre');
      }
    }
  });
});
```

- [ ] **Step 2: Configurar env vars**

Añadir a `.env.local`:

```
TEST_ORG_ID=<uuid del org de Pneuma en Supabase>
TEST_SPREADSHEET_ID=<id del sheet real creado en prerrequisitos>
```

- [ ] **Step 3: Correr el test**

Run: `npm test tests/integration/sheets.e2e.test.ts`
Expected: 4 PASS con datos reales en el sheet (verificar visualmente en el navegador).

- [ ] **Step 4: Commit**

```bash
git add tests/integration/sheets.e2e.test.ts
git commit -m "test(sheets): E2E integration against real Google Sheet"
```

---

## Task 14: Rollout — feature flag Pneuma → llamada real → producción → AC

**Files:**
- Ninguno de código; documentar en release notes + memory

**Objetivo:** Validar la integración end-to-end antes de exponer a clientes.

- [ ] **Step 1: Correr migration en Supabase producción**

En Supabase prod SQL editor, aplicar `20260804_sheets_mappings.sql`. Verificar tabla y columna nueva creadas.

- [ ] **Step 2: Reconectar Google en org de Pneuma**

En IntegrationsHub (prod, org Pneuma), click "Reconectar" en tarjeta Google Workspace. Aceptar scope de Sheets en el consent. Verificar que la línea "Hojas de cálculo (Sheets)" queda con check verde.

- [ ] **Step 3: Configurar sheet real de prueba en Sofia**

En config de Sofia (agente Pneuma), sección "Sheets del negocio", conectar "Clientes" → seleccionar el spreadsheet real de Pneuma → tab "Clientes" → verificar headers detectados.

Activar toggle "Sincronizar automáticamente los leads capturados".

- [ ] **Step 4: Llamada real a Sofia — probar los 4 flows**

Llamar al número de Sofia y probar:

1. "Agrega a Juan Pérez como cliente, teléfono 8118181818" → verificar fila nueva en el sheet
2. "Actualiza el teléfono de Juan Pérez a 8119191919" → verificar update en el sheet
3. "¿Qué clientes tengo?" → Sofia debe leer y contar
4. "Búscame al cliente Pérez" → Sofia debe encontrarlo

- [ ] **Step 5: Probar sync automático `crear_lead`**

En la misma llamada: "Soy Ricardo, quiero información sobre sus servicios, mi teléfono es 8177777777, mi correo ricardo@ejemplo.com" → verificar que aparece fila en el sheet de leads además de en `leads_voice` de Supabase.

- [ ] **Step 6: Verificar en chat/oficina**

En portal, abrir chat con Sofia, escribir "agrega a Ana López como cliente con teléfono 555" → verificar fila.

- [ ] **Step 7: Actualizar memory con estado**

Editar `handoff_google_sheets_integration.md`: cambiar status a "shipped en Pneuma, listo para AC". Actualizar `project_centinelia_ac_proyectos_pilot.md`: quitar Sheets del bloqueador.

- [ ] **Step 8: Conectar AC Proyectos**

Cuando arranque el piloto:
- Onboarding: Ana conecta Google Workspace en portal, autoriza los 3 scopes
- Config del agente asignado a Ana: mapear "Clientes" a su sheet real de clientes AC
- Prueba controlada: 3 llamadas de prueba + verificar comportamiento con headers reales de AC

- [ ] **Step 9: Commit doc (opcional, si escribes release notes)**

```bash
git add docs/releases/2026-08-sheets.md
git commit -m "docs: release notes Google Workspace + Sheets integration"
```

---

## Self-Review

**Spec coverage:**
- Arquitectura (OAuth, tabla, servicio) → Tasks 1, 2, 3, 4, 5 ✓
- 4 tools en 3 canales → Tasks 6, 7 (voz), executor cubre chat/email por herencia ✓
- Sync opcional crear_lead → Task 8 ✓
- Policy engine capabilities → Task 9 ✓
- UI IntegrationsHub unificada → Task 11 ✓
- UI config agente → Task 12 ✓
- API routes portal → Task 10 ✓
- Error handling (mapping_not_found, scope_missing, row_not_found, headers_mismatch, token expired) → cubierto en Tasks 2, 3, 4, 5, 10 ✓
- Testing (unit + integration + E2E manual) → Tasks 3-8 unit, Task 13 integration, Task 14 E2E manual ✓
- Deprecación de GmailCard/DriveCard → Task 11 ✓
- Rollout Pneuma → AC → Task 14 ✓

**Placeholder scan:** ninguno crítico. Los paths marcados con "identificar en Task 0" son intencionales — el implementador debe verificar. Rate limit backoff mencionado en spec pero no implementado como task separado; asumo que retry es parte del cliente de googleapis o se agrega si aparece en testing.

**Type consistency:** `SheetsMapping.purpose` es enum consistente en todos los tasks. `ToolResult<T>` mismo shape en servicio y tools. Tool names consistentes (`sheets_agregar_fila`, etc.). Capability names (`sheets.read`, `sheets.write`) consistentes en Tasks 6 y 9.

**Ambiguity check:** un tema: `sync_leads_to_sheets` es per-agente pero mappings son per-org. Está bien porque el mapping "leads" es único por org; múltiples agentes en la misma org pueden opt-in individualmente al mismo sheet. Documentado en Task 8.

**Limitación conocida documentada:** `updateRow` solo soporta sheets con ≤26 columnas (A-Z). Suficiente para v1 según spec.
