# Industry Field + Daily Availability Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `industry` subtype under the `negocio` vertical and ship a generic `actualizar_disponibilidad_diaria` tool that only surfaces for orgs whose industry needs it (starting with `restaurante`), so a manager can update daily availability once and every employee across voice + chat + email uses the same source of truth.

**Architecture:** New optional `industry` field inside `voice_agents.features` JSONB (no schema change for the flag itself). New `organizations.daily_availability` JSONB column stores the current-day snapshot (org-level, single row per org). Tool `actualizar_disponibilidad_diaria` writes to that column and is gated by `features.industry` presence in all 3 channels (voice, chat, email executor). The prompt-builder appends a formatted section of that column to the system prompt so the employee always knows the state without needing to call a `consultar_` tool. Industry selector lives in `ClientEditForm` (admin), and a portal card lets the org owner edit it manually from `/portal/[token]/organizacion`.

**Tech Stack:** Next.js 15/16, React 19, TypeScript, Supabase Postgres (JSONB), Vapi.ai voice tools, Anthropic SDK for chat/executor tools.

**Spec:** This plan implements the design agreed inline in the conversation of 2026-08-17. Key spec points restated in Global Constraints below.

## Global Constraints

- **3-channel parity** ([[feedback-tool-3-canales]]): every new tool MUST be registered in voice (`src/lib/vapi/sync.ts`), chat (`src/app/api/portal/[token]/agent-chat/route.ts`) and email executor (`src/lib/ops/task-executor.ts`). No skipping.
- **Industry is the gate, not a UI toggle** ([[feedback-no-unilateral-toggles]]): the tool appears iff `features.industry` is set to a value in the whitelist. No independent on/off switch.
- **Generic naming, not restaurant-specific**: tool is `actualizar_disponibilidad_diaria` and column is `daily_availability`. Labels shown to the user change per industry (restaurante → "Disponibilidad del menú"; retail → "Stock del día"; etc.), but the schema is one.
- **Org-level, not per-employee** ([[feedback-integraciones-org-level]]): `daily_availability` lives on `organizations`, not on `voice_agents`. All employees in the org read the same snapshot.
- **No em-dash, no emojis, no visible "IA"** in any user-facing copy ([[feedback-no-em-dash]], [[feedback-no-emojis]], [[feedback-no-ia-visible]]).
- **Existing `features.vertical` stays as-is**: `'negocio' | 'gobierno'`. `industry` is a NEW optional subtype only meaningful when `vertical === 'negocio'`. The gating for the new tool checks `industry` directly, not vertical.
- **Whitelist of industries this iteration**: `'restaurante' | 'retail' | 'clinica' | 'hotel'`. Only `restaurante` gets a copy-tailored label in this first pass; the other three ship with generic label so the tool is present but validated later per industry.
- **Editing surface for the owner**: portal card at `/portal/[token]/organizacion` (existing `OrgCard` area). Not a separate top-level route.
- **KB injection**: the daily availability appends to the effective system prompt via `src/lib/voice/prompt-builder.ts` (voice) and the equivalent chat prompt assembly, so the agent always knows without needing to call `consultar_`.
- **All new file paths are relative to `C:\Users\Nazre\centinelia\`.**

## File Structure

**Create:**
- `supabase/migrations/2026-08-17-daily-availability.sql` — adds `daily_availability` JSONB column to `organizations`.
- `src/lib/industry.ts` — single source of truth for the industry whitelist, labels, and helpers (`getAgentIndustry`, `getIndustryLabel`, `INDUSTRIES_WITH_DAILY_AVAILABILITY`).
- `src/lib/daily-availability.ts` — helpers to read, validate and format a `DailyAvailability` object into a system-prompt-ready block.
- `src/app/api/portal/[token]/daily-availability/route.ts` — GET/PUT the org's `daily_availability`.
- `src/app/api/voice/tools/actualizar-disponibilidad-diaria/route.ts` — voice tool handler; also reused by chat and email executor.
- `src/app/portal/[token]/organizacion/DailyAvailabilityCard.tsx` — portal UI for the owner.

**Modify:**
- `src/types/agent.ts` — add `industry?: string` to the features type.
- `src/app/admin/clientes/[key]/editar/ClientEditForm.tsx:72-212` — new industry `<Card>` after the vertical one, only enabled when `vertical === 'negocio'`.
- `src/app/api/admin/clientes/[key]/route.ts:84-128` — parse `industry` from PATCH body, merge into features per agent.
- `src/lib/vapi/sync.ts:219-570` — register the tool in `buildToolDef`, gate on industry in `createVapiTools`.
- `src/app/api/portal/[token]/agent-chat/route.ts` — declare `ACTUALIZAR_DISPONIBILIDAD_DIARIA_TOOL`, gate its inclusion by industry, wire handler to `/api/voice/tools/actualizar-disponibilidad-diaria`.
- `src/lib/ops/task-executor.ts:25-140` — add the tool to `DELEGATION_TOOLS` and `routeMap`; gate by industry when building the array for the target agent.
- `src/lib/voice/prompt-builder.ts` — append formatted `daily_availability` to the KB block if industry has it and column is non-null.
- `src/app/portal/[token]/organizacion/page.tsx` (or the OrgCard container) — mount `DailyAvailabilityCard` when industry qualifies.

**Test:**
- `src/lib/__tests__/daily-availability.test.ts` — formatting + validation.
- `src/lib/__tests__/industry.test.ts` — whitelist + label helpers.
- Manual E2E checklist at end of plan for cross-channel verification.

---

### Task 1: Industry helpers (single source of truth)

**Files:**
- Create: `src/lib/industry.ts`
- Create: `src/lib/__tests__/industry.test.ts`
- Modify: `src/types/agent.ts` (add `industry?: string` to the features type)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Industry = 'restaurante' | 'retail' | 'clinica' | 'hotel'`
  - `const INDUSTRIES: readonly Industry[]`
  - `const INDUSTRIES_WITH_DAILY_AVAILABILITY: readonly Industry[]` (all four this iteration)
  - `function getAgentIndustry(agent: { features?: { industry?: string } }): Industry | null`
  - `function getIndustryLabel(industry: Industry, key: 'daily_availability_title' | 'daily_availability_item_word'): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/industry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getAgentIndustry,
  getIndustryLabel,
  INDUSTRIES_WITH_DAILY_AVAILABILITY,
} from '../industry';

describe('getAgentIndustry', () => {
  it('returns null when features is missing', () => {
    expect(getAgentIndustry({})).toBeNull();
  });

  it('returns null when industry is not in whitelist', () => {
    expect(getAgentIndustry({ features: { industry: 'petshop' } })).toBeNull();
  });

  it('returns the industry when whitelisted', () => {
    expect(getAgentIndustry({ features: { industry: 'restaurante' } })).toBe('restaurante');
  });
});

describe('getIndustryLabel', () => {
  it('returns tailored restaurant label for daily availability title', () => {
    expect(getIndustryLabel('restaurante', 'daily_availability_title')).toBe('Disponibilidad del menú');
  });

  it('returns retail label for daily availability title', () => {
    expect(getIndustryLabel('retail', 'daily_availability_title')).toBe('Disponibilidad del día');
  });

  it('returns item word for restaurante', () => {
    expect(getIndustryLabel('restaurante', 'daily_availability_item_word')).toBe('platillo');
  });
});

describe('INDUSTRIES_WITH_DAILY_AVAILABILITY', () => {
  it('includes restaurante', () => {
    expect(INDUSTRIES_WITH_DAILY_AVAILABILITY).toContain('restaurante');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/__tests__/industry.test.ts
```

Expected: FAIL — module `../industry` not found.

- [ ] **Step 3: Add `industry` to features type**

Edit `src/types/agent.ts`. Find the features type/interface and add:

```typescript
industry?: 'restaurante' | 'retail' | 'clinica' | 'hotel';
```

If the features type is currently loosely typed (e.g., `Record<string, unknown>`), still add the exact key under a documented union so downstream code auto-completes.

- [ ] **Step 4: Implement `src/lib/industry.ts`**

```typescript
export const INDUSTRIES = ['restaurante', 'retail', 'clinica', 'hotel'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRIES_WITH_DAILY_AVAILABILITY: readonly Industry[] = INDUSTRIES;

const INDUSTRY_LABELS: Record<Industry, { daily_availability_title: string; daily_availability_item_word: string }> = {
  restaurante: { daily_availability_title: 'Disponibilidad del menú',    daily_availability_item_word: 'platillo' },
  retail:      { daily_availability_title: 'Disponibilidad del día',      daily_availability_item_word: 'producto' },
  clinica:     { daily_availability_title: 'Disponibilidad de la agenda', daily_availability_item_word: 'servicio' },
  hotel:       { daily_availability_title: 'Disponibilidad del hotel',    daily_availability_item_word: 'servicio' },
};

export function getAgentIndustry(agent: { features?: { industry?: string } | null }): Industry | null {
  const raw = agent.features?.industry;
  if (!raw) return null;
  return (INDUSTRIES as readonly string[]).includes(raw) ? (raw as Industry) : null;
}

export function getIndustryLabel(
  industry: Industry,
  key: 'daily_availability_title' | 'daily_availability_item_word',
): string {
  return INDUSTRY_LABELS[industry][key];
}
```

- [ ] **Step 5: Run tests to verify they pass**

```
npx vitest run src/lib/__tests__/industry.test.ts
```

Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/industry.ts src/lib/__tests__/industry.test.ts src/types/agent.ts
git commit -m "feat(industry): add industry subtype whitelist + helpers"
```

---

### Task 2: Daily availability schema + formatter

**Files:**
- Create: `supabase/migrations/2026-08-17-daily-availability.sql`
- Create: `src/lib/daily-availability.ts`
- Create: `src/lib/__tests__/daily-availability.test.ts`

**Interfaces:**
- Consumes: `Industry` from `src/lib/industry.ts`.
- Produces:
  - ```ts
    type DailyAvailability = {
      updated_at: string;              // ISO
      updated_by: string;              // portal_email or 'agent:<uuid>'
      unavailable: string[];           // items completely out
      limited: string[];               // low stock / limited
      special: string | null;          // free text special of the day, e.g. "tacos de barbacoa 180"
      notes: string | null;            // any other note
    };
    ```
  - `function formatDailyAvailabilityForPrompt(data: DailyAvailability | null, industry: Industry): string` returns a KB-ready block or empty string when null.
  - `function validateDailyAvailability(input: unknown): DailyAvailability` throws on malformed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/daily-availability.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatDailyAvailabilityForPrompt, validateDailyAvailability } from '../daily-availability';

describe('formatDailyAvailabilityForPrompt', () => {
  it('returns empty string when data is null', () => {
    expect(formatDailyAvailabilityForPrompt(null, 'restaurante')).toBe('');
  });

  it('formats restaurante block with title, agotados y especial', () => {
    const out = formatDailyAvailabilityForPrompt(
      {
        updated_at: '2026-08-17T10:00:00Z',
        updated_by: 'owner@x.com',
        unavailable: ['Ceviche', 'Arrachera'],
        limited: ['Postre de la casa'],
        special: 'Tacos de barbacoa a 180',
        notes: null,
      },
      'restaurante',
    );
    expect(out).toContain('Disponibilidad del menú');
    expect(out).toContain('Ceviche');
    expect(out).toContain('Arrachera');
    expect(out).toContain('Tacos de barbacoa a 180');
    expect(out).toContain('Postre de la casa');
  });
});

describe('validateDailyAvailability', () => {
  it('throws when unavailable is not array', () => {
    expect(() => validateDailyAvailability({ unavailable: 'nope' })).toThrow();
  });

  it('accepts minimal valid object', () => {
    const v = validateDailyAvailability({
      updated_at: '2026-08-17T10:00:00Z',
      updated_by: 'x@y.com',
      unavailable: [],
      limited: [],
      special: null,
      notes: null,
    });
    expect(v.updated_by).toBe('x@y.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/lib/__tests__/daily-availability.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/2026-08-17-daily-availability.sql`:

```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS daily_availability jsonb;

COMMENT ON COLUMN public.organizations.daily_availability IS
  'Per-day operational snapshot updated by owners/employees for industries that need it (restaurante, retail, clinica, hotel). Schema: { updated_at, updated_by, unavailable[], limited[], special, notes }. See src/lib/daily-availability.ts.';
```

- [ ] **Step 4: Apply migration to remote Supabase**

Use the Supabase MCP `apply_migration` tool with name `daily_availability` and the SQL above. Verify with:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name = 'daily_availability';
```

Expected: one row with `data_type = 'jsonb'`.

- [ ] **Step 5: Implement `src/lib/daily-availability.ts`**

```typescript
import type { Industry } from './industry';
import { getIndustryLabel } from './industry';

export type DailyAvailability = {
  updated_at: string;
  updated_by: string;
  unavailable: string[];
  limited: string[];
  special: string | null;
  notes: string | null;
};

export function validateDailyAvailability(input: unknown): DailyAvailability {
  if (!input || typeof input !== 'object') throw new Error('daily_availability must be an object');
  const o = input as Record<string, unknown>;
  const arr = (k: string): string[] => {
    const v = o[k];
    if (!Array.isArray(v)) throw new Error(`${k} must be an array`);
    return v.map(String);
  };
  const strOrNull = (k: string): string | null => {
    const v = o[k];
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') throw new Error(`${k} must be a string or null`);
    return v;
  };
  return {
    updated_at:  typeof o.updated_at  === 'string' ? o.updated_at  : new Date().toISOString(),
    updated_by:  typeof o.updated_by  === 'string' ? o.updated_by  : 'unknown',
    unavailable: arr('unavailable'),
    limited:     arr('limited'),
    special:     strOrNull('special'),
    notes:       strOrNull('notes'),
  };
}

export function formatDailyAvailabilityForPrompt(
  data: DailyAvailability | null,
  industry: Industry,
): string {
  if (!data) return '';
  const title    = getIndustryLabel(industry, 'daily_availability_title');
  const itemWord = getIndustryLabel(industry, 'daily_availability_item_word');
  const lines: string[] = [`\n### ${title} (actualizado ${data.updated_at})`];
  if (data.unavailable.length) lines.push(`No disponibles hoy: ${data.unavailable.join(', ')}.`);
  if (data.limited.length)     lines.push(`${itemWord.charAt(0).toUpperCase() + itemWord.slice(1)}s con existencia limitada: ${data.limited.join(', ')}.`);
  if (data.special)            lines.push(`Especial del día: ${data.special}.`);
  if (data.notes)              lines.push(`Nota: ${data.notes}.`);
  return lines.join('\n');
}
```

- [ ] **Step 6: Run tests to verify they pass**

```
npx vitest run src/lib/__tests__/daily-availability.test.ts
```

Expected: PASS 4/4.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/2026-08-17-daily-availability.sql src/lib/daily-availability.ts src/lib/__tests__/daily-availability.test.ts
git commit -m "feat(daily-availability): schema + formatter for org daily snapshot"
```

---

### Task 3: Admin form — industry selector

**Files:**
- Modify: `src/app/admin/clientes/[key]/editar/ClientEditForm.tsx:72-212`
- Modify: `src/app/api/admin/clientes/[key]/route.ts:84-128`

**Interfaces:**
- Consumes: `INDUSTRIES` and `Industry` from `src/lib/industry.ts`.
- Produces: `voice_agents.features.industry` gets populated per agent when saved.

- [ ] **Step 1: Update the form state**

In `ClientEditForm.tsx`, near line 74 (after the `vertical` state):

```typescript
import { INDUSTRIES, type Industry } from '@/lib/industry';

const [industry, setIndustry] = useState<Industry | ''>(
  (primary.features?.industry as Industry) ?? ''
);
```

- [ ] **Step 2: Add the industry Card to the JSX**

Immediately after the existing "Vertical" `<Card>` block (line 212), add:

```tsx
{vertical === 'negocio' && (
  <Card title="Industria" icon={<Briefcase size={13} />}
        subtitle="Habilita herramientas específicas de esta industria (opcional).">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <button onClick={() => setIndustry('')}
        style={{ background: industry === '' ? '#F3F0FF' : '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6, padding: 12, textAlign: 'left' }}>
        Ninguna
      </button>
      {INDUSTRIES.map(opt => {
        const active = industry === opt;
        const label = opt.charAt(0).toUpperCase() + opt.slice(1);
        return (
          <button key={opt} onClick={() => setIndustry(opt)}
            style={{ background: active ? '#F3F0FF' : '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6, padding: 12, textAlign: 'left' }}>
            {label}
          </button>
        );
      })}
    </div>
  </Card>
)}
```

- [ ] **Step 3: Include `industry` in the PATCH body**

Find the save handler (around line 105-109). Extend the body:

```typescript
const body: Record<string, unknown> = {
  vertical,
  industry: industry || null,
  // ...existing fields
};
```

- [ ] **Step 4: Parse `industry` in the API route**

Edit `src/app/api/admin/clientes/[key]/route.ts:84-128`. Alongside the vertical parsing:

```typescript
import { INDUSTRIES } from '@/lib/industry';

let industry: string | null | undefined;
if (k === 'industry') {
  if (v === null) industry = null;
  else if (typeof v === 'string' && (INDUSTRIES as readonly string[]).includes(v)) industry = v;
}
```

And in the merge (near line 120):

```typescript
const nextFeatures = {
  ...currentFeatures,
  ...(vertical !== undefined ? { vertical } : {}),
  ...(industry !== undefined ? { industry } : {}),
};
```

- [ ] **Step 5: Manual smoke test**

1. `npm run dev`.
2. Go to `/admin/clientes/<any test client>/editar`.
3. Verify the Industria Card only appears when Vertical = Negocio.
4. Pick `restaurante`, save.
5. In Supabase console:
   ```sql
   SELECT features->>'industry' FROM voice_agents WHERE portal_email = '<test>';
   ```
   Expected: `restaurante`.
6. Set Vertical to Gobierno, save, verify Industria disappears from UI.
7. Set back to Negocio + Ninguna, save, verify DB shows `null` or missing key.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/clientes/[key]/editar/ClientEditForm.tsx src/app/api/admin/clientes/[key]/route.ts
git commit -m "feat(admin): industry selector in ClientEditForm gated on vertical=negocio"
```

---

### Task 4: Voice tool — register + gate + handler

**Files:**
- Modify: `src/lib/vapi/sync.ts:219-570`
- Create: `src/app/api/voice/tools/actualizar-disponibilidad-diaria/route.ts`

**Interfaces:**
- Consumes: `getAgentIndustry`, `INDUSTRIES_WITH_DAILY_AVAILABILITY` from `src/lib/industry.ts`; `validateDailyAvailability` from `src/lib/daily-availability.ts`.
- Produces: the shared HTTP handler that both chat and email executor tasks will re-use in later tasks by fetching this route.

- [ ] **Step 1: Add tool to `MEERKAT_VOICE_DISTRIBUTION`**

In `src/lib/vapi/sync.ts:219-271`, append `'actualizar_disponibilidad_diaria'` to the arrays for the meerkats that should have it. Add to at minimum: `nia` (recepcionista, most likely to answer availability questions). Rationale: restaurantes usan Nia como recepcionista principal.

```typescript
nia: [
  'crear_lead', 'crear_contacto_saliente', 'agendar_cita', 'registrar_pedido',
  'buscar_cliente', 'notificar_transferencia', 'transferir_llamada',
  'registrar_encuesta', 'consultar_agente', 'delegar_tarea', 'reportar_falla',
  'actualizar_disponibilidad_diaria',
],
```

Also add to `nox` (coordinador) so the owner-side digital employee can update it via chat.

- [ ] **Step 2: Add case to `buildToolDef`**

In `src/lib/vapi/sync.ts:279+`, add a new case:

```typescript
if (name === 'actualizar_disponibilidad_diaria') {
  return {
    type: 'function',
    async: false,
    function: {
      name: 'actualizar_disponibilidad_diaria',
      description:
        'Actualiza la disponibilidad diaria del negocio (items agotados, con existencia limitada, especial del día). Se propaga a todos los empleados del cliente. Úsalo cuando el dueño o gerente te informe cambios de disponibilidad.',
      parameters: {
        type: 'object',
        properties: {
          unavailable: { type: 'array', items: { type: 'string' }, description: 'Items agotados hoy' },
          limited:     { type: 'array', items: { type: 'string' }, description: 'Items con existencia limitada' },
          special:     { type: ['string', 'null'], description: 'Especial del día. null para no cambiar.' },
          notes:       { type: ['string', 'null'], description: 'Nota libre. null para no cambiar.' },
        },
        required: ['unavailable', 'limited'],
      },
    },
    server: server('actualizar-disponibilidad-diaria'),
  };
}
```

- [ ] **Step 3: Gate the tool by industry in `createVapiTools`**

At the section around lines 500-518 where conditional tools are pushed, add:

```typescript
import { getAgentIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';

const agentIndustry = getAgentIndustry(agent);
const roleTools = MEERKAT_VOICE_DISTRIBUTION[meerkatId] ?? [];
if (
  agentIndustry &&
  INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(agentIndustry) &&
  roleTools.includes('actualizar_disponibilidad_diaria')
) {
  tools.push(buildToolDef('actualizar_disponibilidad_diaria', agent, server)!);
}
```

**Do NOT** push it if the industry gate fails, even if the meerkat has it in its distribution.

- [ ] **Step 4: Create the HTTP handler**

Create `src/app/api/voice/tools/actualizar-disponibilidad-diaria/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateDailyAvailability } from '@/lib/daily-availability';
import { getAgentIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';

export const runtime = 'nodejs';

type Body = {
  agent_id?: string;
  actor?: string;
  unavailable?: unknown;
  limited?:     unknown;
  special?:     unknown;
  notes?:       unknown;
};

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const url = new URL(req.url);
  const agentIdFromQuery = url.searchParams.get('agent_id') ?? undefined;
  const body = (await req.json().catch(() => ({}))) as Body;

  const agentId = body.agent_id ?? agentIdFromQuery;
  if (!agentId) return NextResponse.json({ ok: false, error: 'agent_id requerido' }, { status: 400 });

  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features')
    .eq('id', agentId)
    .single();
  if (agentErr || !agent) return NextResponse.json({ ok: false, error: 'agente no encontrado' }, { status: 404 });

  const industry = getAgentIndustry(agent);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return NextResponse.json({ ok: false, error: 'industria no soporta disponibilidad diaria' }, { status: 400 });
  }

  const snapshot = validateDailyAvailability({
    updated_at:  new Date().toISOString(),
    updated_by:  body.actor ?? `agent:${agent.id}`,
    unavailable: body.unavailable ?? [],
    limited:     body.limited     ?? [],
    special:     body.special     ?? null,
    notes:       body.notes       ?? null,
  });

  const { error: updErr } = await supabase
    .from('organizations')
    .update({ daily_availability: snapshot })
    .eq('portal_email', agent.portal_email);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    message: 'Disponibilidad actualizada. Todos los empleados verán este estado.',
    snapshot,
  });
}
```

- [ ] **Step 5: Run a Vapi sync for a test agent**

In a Node script or the existing patch helper, force a resync so Vapi picks up the new tool:

```bash
node scripts/sync-agent.mjs --id <test_agent_id>
```

Then verify in Vapi dashboard the assistant now has `actualizar_disponibilidad_diaria` (only for agents whose `features.industry` is set).

- [ ] **Step 6: Manual voice test**

Call the test agent with industry = `restaurante`. Say: "Hola, soy el dueño. Anota que hoy no hay ceviche ni arrachera, y el especial es tacos de barbacoa a 180." Expected: the agent invokes the tool; Supabase `organizations.daily_availability` for that org is updated. Confirm via:

```sql
SELECT daily_availability FROM organizations WHERE portal_email = '<test>';
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/vapi/sync.ts src/app/api/voice/tools/actualizar-disponibilidad-diaria/route.ts
git commit -m "feat(voice): actualizar_disponibilidad_diaria tool gated on industry"
```

---

### Task 5: Chat tool registration

**Files:**
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts`

**Interfaces:**
- Consumes: `getAgentIndustry`, `INDUSTRIES_WITH_DAILY_AVAILABILITY` from `src/lib/industry.ts`; the HTTP route from Task 4.
- Produces: nothing new (the tool reuses Task 4's endpoint).

- [ ] **Step 1: Declare the Anthropic tool schema**

Near the other `*_TOOL` constants in `agent-chat/route.ts`, add:

```typescript
const ACTUALIZAR_DISPONIBILIDAD_DIARIA_TOOL: Anthropic.Tool = {
  name: 'actualizar_disponibilidad_diaria',
  description:
    'Actualiza la disponibilidad diaria del negocio (items agotados, con existencia limitada, especial del día). Cambio compartido con todos los empleados.',
  input_schema: {
    type: 'object',
    properties: {
      unavailable: { type: 'array', items: { type: 'string' } },
      limited:     { type: 'array', items: { type: 'string' } },
      special:     { type: ['string', 'null'] },
      notes:       { type: ['string', 'null'] },
    },
    required: ['unavailable', 'limited'],
  },
};
```

- [ ] **Step 2: Gate the tool in the tools array**

Where the `tools` array is built:

```typescript
import { getAgentIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';

const industry = getAgentIndustry(agent);
const tools: Anthropic.Tool[] = [
  SEND_EMAIL_TOOL,
  CREATE_DOCUMENT_TOOL,
  // ... existing
];
if (industry && INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
  tools.push(ACTUALIZAR_DISPONIBILIDAD_DIARIA_TOOL);
}
```

- [ ] **Step 3: Add the tool handler branch**

In the tool-use switch (grep for `case 'send_email':` to locate it):

```typescript
case 'actualizar_disponibilidad_diaria': {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/tools/actualizar-disponibilidad-diaria?agent_id=${agent.id}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...toolInput, actor: portalEmail }),
    },
  );
  const data = await res.json();
  return { tool_use_id, content: JSON.stringify(data) };
}
```

- [ ] **Step 4: Manual chat test**

In `/portal/[token]/oficina/chat`, ask the coordinador: "Marca ceviche y arrachera como agotados hoy, especial de tacos de barbacoa 180." Expected: tool call succeeds, DB updated.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/[token]/agent-chat/route.ts
git commit -m "feat(chat): register actualizar_disponibilidad_diaria for industry-gated orgs"
```

---

### Task 6: Email/task-executor tool registration

**Files:**
- Modify: `src/lib/ops/task-executor.ts:25-140`

**Interfaces:**
- Consumes: same as Task 5.
- Produces: nothing new.

- [ ] **Step 1: Add to `DELEGATION_TOOLS` schema**

Insert alongside the existing tools:

```typescript
{
  name: 'actualizar_disponibilidad_diaria',
  description: 'Actualiza la disponibilidad diaria del negocio.',
  input_schema: {
    type: 'object',
    properties: {
      unavailable: { type: 'array', items: { type: 'string' } },
      limited:     { type: 'array', items: { type: 'string' } },
      special:     { type: ['string', 'null'] },
      notes:       { type: ['string', 'null'] },
    },
    required: ['unavailable', 'limited'],
  },
},
```

- [ ] **Step 2: Add to `routeMap`**

Around line 148:

```typescript
const routeMap: Record<string, string> = {
  // ... existing
  actualizar_disponibilidad_diaria: 'actualizar-disponibilidad-diaria',
};
```

- [ ] **Step 3: Gate the tool in the array built for the target agent**

Before returning `DELEGATION_TOOLS`, filter:

```typescript
import { getAgentIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';

const industry = getAgentIndustry(targetAgent);
const tools = DELEGATION_TOOLS.filter(t => {
  if (t.name === 'actualizar_disponibilidad_diaria') {
    return industry !== null && INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry);
  }
  return true;
});
```

- [ ] **Step 4: Manual email test**

Send an email to the org's inbound address: "Hola, hoy no tenemos ceviche ni arrachera, especial: tacos de barbacoa 180." Confirm the executor invokes the tool; DB updated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops/task-executor.ts
git commit -m "feat(executor): route email delegation of actualizar_disponibilidad_diaria"
```

---

### Task 7: Inject `daily_availability` into the effective system prompt

**Files:**
- Modify: `src/lib/voice/prompt-builder.ts`
- Modify: chat prompt builder in `src/app/api/portal/[token]/agent-chat/route.ts` (the system prompt assembly block; grep for `systemPrompt`)

**Interfaces:**
- Consumes: `formatDailyAvailabilityForPrompt` from `src/lib/daily-availability.ts`; `getAgentIndustry` from `src/lib/industry.ts`.
- Produces: agent sees `Disponibilidad del menú...` block automatically before answering customer questions.

- [ ] **Step 1: Find where KB gets injected in voice prompt-builder**

Open `src/lib/voice/prompt-builder.ts`. Locate the section where `agent.knowledge_base` or the org's `knowledge_base` gets concatenated into the system prompt.

- [ ] **Step 2: Load and append `daily_availability`**

Where the org fields are fetched (or accepted as arg), also fetch `daily_availability`. Then:

```typescript
import { getAgentIndustry } from '@/lib/industry';
import { formatDailyAvailabilityForPrompt } from '@/lib/daily-availability';

const industry = getAgentIndustry(agent);
const dailyBlock = industry
  ? formatDailyAvailabilityForPrompt(org.daily_availability ?? null, industry)
  : '';

// Append dailyBlock to the KB string just before final system prompt assembly.
const kbSection = [orgKb, agentKb, dailyBlock].filter(Boolean).join('\n\n');
```

- [ ] **Step 3: Repeat for chat**

In `src/app/api/portal/[token]/agent-chat/route.ts` where the system prompt is built, do the same appending. Ensure the `organizations` select query includes `daily_availability`.

- [ ] **Step 4: Repeat for email executor**

In `src/lib/ops/task-executor.ts` (or the file that builds the system prompt for the executor's Claude call), do the same appending.

- [ ] **Step 5: Manual end-to-end verification**

1. With test agent + industry = restaurante and `daily_availability` populated from Task 4 step 6, call the agent.
2. Ask: "¿Tienen ceviche?" Expected: agent says no (from injected block), does NOT need to call any tool.
3. Ask: "¿Cuál es el especial de hoy?" Expected: agent quotes the special.
4. Repeat via chat and via email. Same result expected across the 3 channels.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice/prompt-builder.ts src/app/api/portal/[token]/agent-chat/route.ts src/lib/ops/task-executor.ts
git commit -m "feat(prompt): inject daily_availability block for industry-enabled orgs"
```

---

### Task 8: Portal UI — DailyAvailabilityCard

**Files:**
- Create: `src/app/portal/[token]/organizacion/DailyAvailabilityCard.tsx`
- Create: `src/app/api/portal/[token]/daily-availability/route.ts`
- Modify: `src/app/portal/[token]/organizacion/page.tsx` (or wherever OrgCard is composed) — mount the new card conditionally.

**Interfaces:**
- Consumes: `getAgentIndustry`, `getIndustryLabel` from `src/lib/industry.ts`; `validateDailyAvailability` from `src/lib/daily-availability.ts`.
- Produces: the org's `daily_availability` column is editable by the owner from the portal.

- [ ] **Step 1: API — GET/PUT the org's daily_availability**

Create `src/app/api/portal/[token]/daily-availability/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/tokens';
import { validateDailyAvailability } from '@/lib/daily-availability';
import { getAgentIndustry, INDUSTRIES_WITH_DAILY_AVAILABILITY } from '@/lib/industry';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ features: any; portal_email: string }>(
    params.token,
    'id, features, portal_email',
    supabase,
  );
  if (!agent) return NextResponse.json({ ok: false }, { status: 404 });

  const industry = getAgentIndustry(agent);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return NextResponse.json({ ok: true, industry: null, data: null });
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('daily_availability')
    .eq('portal_email', agent.portal_email)
    .single();

  return NextResponse.json({ ok: true, industry, data: org?.daily_availability ?? null });
}

export async function PUT(req: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ id: string; features: any; portal_email: string }>(
    params.token,
    'id, features, portal_email',
    supabase,
  );
  if (!agent) return NextResponse.json({ ok: false }, { status: 404 });

  const industry = getAgentIndustry(agent);
  if (!industry || !INDUSTRIES_WITH_DAILY_AVAILABILITY.includes(industry)) {
    return NextResponse.json({ ok: false, error: 'industria no soporta' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const snapshot = validateDailyAvailability({
    updated_at: new Date().toISOString(),
    updated_by: `portal:${agent.portal_email}`,
    unavailable: body.unavailable ?? [],
    limited:     body.limited     ?? [],
    special:     body.special     ?? null,
    notes:       body.notes       ?? null,
  });

  const { error } = await supabase
    .from('organizations')
    .update({ daily_availability: snapshot })
    .eq('portal_email', agent.portal_email);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: snapshot });
}
```

- [ ] **Step 2: Card component**

Create `src/app/portal/[token]/organizacion/DailyAvailabilityCard.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Industry } from '@/lib/industry';
import { getIndustryLabel } from '@/lib/industry';

type Props = { token: string };

type State = {
  unavailable: string[];
  limited: string[];
  special: string | null;
  notes: string | null;
  updated_at?: string;
};

export default function DailyAvailabilityCard({ token }: Props) {
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [state, setState]       = useState<State>({ unavailable: [], limited: [], special: null, notes: null });
  const [saving, setSaving]     = useState(false);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/daily-availability`)
      .then(r => r.json())
      .then(r => {
        if (r.industry) setIndustry(r.industry);
        if (r.data) setState({
          unavailable: r.data.unavailable ?? [],
          limited:     r.data.limited     ?? [],
          special:     r.data.special     ?? null,
          notes:       r.data.notes       ?? null,
          updated_at:  r.data.updated_at,
        });
        setLoaded(true);
      });
  }, [token]);

  if (!loaded || !industry) return null;

  const title = getIndustryLabel(industry, 'daily_availability_title');
  const word  = getIndustryLabel(industry, 'daily_availability_item_word');

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/portal/${token}/daily-availability`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
    const data = await r.json();
    if (data.ok) setState(s => ({ ...s, updated_at: data.data.updated_at }));
    setSaving(false);
  };

  const listInput = (label: string, key: 'unavailable' | 'limited') => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <textarea
        value={state[key].join(', ')}
        onChange={e => setState(s => ({ ...s, [key]: e.target.value.split(',').map(x => x.trim()).filter(Boolean) }))}
        rows={2}
        placeholder={`Un ${word} por coma`}
        style={{ width: '100%', padding: 8, border: '1px solid #E5E7EB', borderRadius: 6 }}
      />
    </label>
  );

  return (
    <section style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      {state.updated_at && <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Actualizado: {state.updated_at}</div>}
      {listInput(`No disponibles hoy`, 'unavailable')}
      {listInput(`Con existencia limitada`, 'limited')}
      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Especial del día</div>
        <input
          value={state.special ?? ''}
          onChange={e => setState(s => ({ ...s, special: e.target.value || null }))}
          placeholder="Ej: Tacos de barbacoa a 180"
          style={{ width: '100%', padding: 8, border: '1px solid #E5E7EB', borderRadius: 6 }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Notas</div>
        <textarea
          value={state.notes ?? ''}
          onChange={e => setState(s => ({ ...s, notes: e.target.value || null }))}
          rows={2}
          style={{ width: '100%', padding: 8, border: '1px solid #E5E7EB', borderRadius: 6 }}
        />
      </label>
      <button onClick={save} disabled={saving}
        style={{ padding: '8px 14px', background: '#6C3BFF', color: '#FFF', border: 0, borderRadius: 6 }}>
        {saving ? 'Guardando...' : 'Guardar disponibilidad de hoy'}
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Mount the card**

In `src/app/portal/[token]/organizacion/page.tsx` (or the container that renders `OrgCard`), add:

```tsx
import DailyAvailabilityCard from './DailyAvailabilityCard';
// ...
<DailyAvailabilityCard token={token} />
```

The card auto-hides itself when the org's industry is not in the whitelist, so no extra gating is needed at mount site.

- [ ] **Step 4: Manual portal test**

1. `npm run dev`, go to `/portal/<token>/organizacion` for an org with `industry = restaurante`.
2. Verify the card renders with title "Disponibilidad del menú".
3. Type items, save. Verify DB updated. Reload — data persists.
4. Set another org's industry to `null`, verify card does not render.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/[token]/organizacion/DailyAvailabilityCard.tsx src/app/api/portal/[token]/daily-availability/route.ts src/app/portal/[token]/organizacion/page.tsx
git commit -m "feat(portal): DailyAvailabilityCard for industry-enabled orgs"
```

---

### Task 9: E2E cross-channel smoke test + commit closing plan

**Files:**
- None (verification only).

- [ ] **Step 1: Portal edit → voice reads it**

1. In portal card, set unavailable = [Ceviche, Arrachera], special = "Tacos de barbacoa 180". Save.
2. Call the test agent's phone number. Ask: "¿tienen ceviche?" Expect: no. Ask: "¿cuál es el especial?" Expect: tacos de barbacoa 180.

- [ ] **Step 2: Voice write → chat reads it**

1. Call the agent as the owner: "borra ceviche de agotados, agrega enchiladas". Confirm tool call.
2. Open portal chat, ask coordinador: "¿qué está agotado hoy?" Expect: enchiladas (not ceviche).

- [ ] **Step 3: Email write → voice reads it**

1. Send email: "Especial de hoy es sopa de tortilla a 90." to the org's inbound address.
2. Wait for executor. Call agent, ask: "¿cuál es el especial?" Expect: sopa de tortilla a 90.

- [ ] **Step 4: Non-restaurant org has no tool**

1. Pick a `gobierno` client and a `negocio` client with no `industry` set.
2. Verify their voice assistant in Vapi does NOT list `actualizar_disponibilidad_diaria`.
3. Verify their portal does NOT render DailyAvailabilityCard.
4. Verify their agent-chat's `tools` array does NOT include the tool.

- [ ] **Step 5: Commit any doc/log updates**

```bash
git add .
git status
# if anything left, commit; else close
git commit -m "chore(daily-availability): E2E smoke test notes" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** every point from the conversation spec is covered by a task: `industry` field (T1, T3), generic tool + gate (T4-T6), org-level storage (T2), portal editing (T8), KB injection (T7), E2E (T9).
- **Placeholder scan:** no `TBD`, `implement later`, or "similar to Task N" — every code block is self-contained.
- **Type consistency:** `DailyAvailability` fields (`unavailable`, `limited`, `special`, `notes`) match across T2, T4, T5, T6, T8. Tool name `actualizar_disponibilidad_diaria` matches across sync map, `buildToolDef`, chat tool declaration, executor `routeMap`, and API route path (`actualizar-disponibilidad-diaria` in kebab-case for the URL). `getAgentIndustry` signature (`{ features?: { industry?: string } | null }`) matches consumers.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-17-industry-daily-availability.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
