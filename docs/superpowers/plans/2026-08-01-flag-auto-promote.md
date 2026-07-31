# Auto-promote Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-promote `meerkat.<id>.v<n>` flags que llevan 7+ días al 100% (killed=false): escribir el resultado en `meerkat_active_versions`, insertar a `meerkat_version_history`, borrar el flag. Para otros prefijos (`portal.*`, `tool.*`, `silent.*`), solo mostrar badge "listo para limpieza" en UI, sin borrar automáticamente.

**Architecture:** Nueva columna `feature_flags.at_100_since TIMESTAMPTZ` que traquea desde cuándo el flag lleva a 100% continuo. Todos los mutation paths (POST, PATCH, kill, activate) usan un helper compartido para setear/limpiar la columna según transiciones. Cron nuevo `/api/cron/flags-promote` a las 11 UTC (1h después de flags-snapshot) procesa candidatos.

**Tech Stack:** Next.js 16.2.9, Supabase, timing-safe admin auth, Vercel crons.

## Global Constraints

- No em-dash `-` en Spanish; use `:`, `,`, `.` o `-`.
- No emojis en UI; solo Lucide.
- Tema-aware: `var(--c-surface)`, `var(--c-text)`, etc. Hex permitidos: `#6C3BFF`, `#9B6DFF`, `#DC2626`, `#16A34A`, `#FAFBFF`.
- Trabajar en `main` directo (patrón sesiones 47/48/49).
- `npx tsc --noEmit` limpio al final de cada task.
- SOAK_DAYS constante = 7. Vive en `src/lib/feature-flags/auto-promote.ts`.
- Timing-safe auth (`crypto.timingSafeEqual`) donde aplique.
- Cron auth: `Authorization: Bearer ${CRON_SECRET}`.

---

## Task 1: Migration + Types

**Files:**
- Create: `migrations/20260801_flag_at_100.sql`
- Modify: `src/lib/feature-flags/types.ts`

**Interfaces:**
- Produces: nueva columna `feature_flags.at_100_since TIMESTAMPTZ` (nullable) + `FlagRow.at_100_since: string | null`.

- [ ] **Step 1: Migration file**

Crear `migrations/20260801_flag_at_100.sql`:

```sql
-- Pilar 3 follow-up: auto-promote tracking
-- Ver docs/superpowers/plans/2026-08-01-flag-auto-promote.md

BEGIN;

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS at_100_since TIMESTAMPTZ;

-- Backfill conservador: para flags ya en 100% y no killed,
-- usar updated_at como aproximacion del "desde cuando".
UPDATE feature_flags
   SET at_100_since = updated_at
 WHERE rollout_pct = 100
   AND killed = FALSE
   AND at_100_since IS NULL;

COMMIT;
```

- [ ] **Step 2: Update FlagRow type**

Editar `src/lib/feature-flags/types.ts`. Agregar campo al final de FlagRow:

```ts
export type FlagRow = {
  flag_key:      string;
  description:   string;
  rollout_pct:   number;
  allowlist:     string[];
  denylist:      string[];
  killed:        boolean;
  default_on:    boolean;
  created_at:    string;
  updated_at:    string;
  updated_by:    string | null;
  at_100_since:  string | null;
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add migrations/20260801_flag_at_100.sql src/lib/feature-flags/types.ts
git commit -m @'
feat(sql): feature_flags.at_100_since column + FlagRow type

Nueva columna para tracking auto-promote. Backfill conservador
usando updated_at para flags ya en 100%. Migration idempotente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Helper `computeAt100Transition` + auto-promote lib

**Files:**
- Create: `src/lib/feature-flags/auto-promote.ts`

**Interfaces:**
- Produces:
  - `SOAK_DAYS = 7` constante exportada
  - `function computeAt100Transition(input: { before: { rollout_pct: number; killed: boolean; at_100_since: string | null } | null; after_pct: number; after_killed: boolean }): string | null` - devuelve el nuevo valor de `at_100_since` a persistir
  - `async function runAutoPromote(supabaseAdmin, opts?: { now?: Date }): Promise<{ candidates: number; promoted: number; skipped_non_meerkat: number; errors: string[] }>` - ejecuta la promoción

**Reglas del helper:**
- Si `after_killed === true` → return `null` (siempre limpiar cuando se mata).
- Si `after_pct !== 100` → return `null` (no está a 100%).
- Si `before === null` (fila nueva) y `after_pct === 100` y `after_killed === false` → return `now.toISOString()`.
- Si `before.at_100_since !== null` y `before.rollout_pct === 100` y `before.killed === false` y `after_pct === 100` y `after_killed === false` → return `before.at_100_since` (no reiniciar el timer si sigue en 100%).
- Caso restante (transición a 100 desde algo distinto, o unkill+100) → return `now.toISOString()` (arranca timer).

**Reglas de runAutoPromote:**
- Query candidatos: `feature_flags` where `killed=false AND rollout_pct=100 AND at_100_since IS NOT NULL AND at_100_since <= NOW() - INTERVAL '7 days'`.
- Para cada candidato:
  - Match `^meerkat\.([^.]+)\.v(\d+)$` sobre flag_key. Si NO matchea → skip, incrementar `skipped_non_meerkat`.
  - Si matchea:
    - UPDATE `meerkat_active_versions` SET `active_version=v, activated_at=NOW(), activated_by='system-auto-promote', notes='auto-promote at 100%+7d'` WHERE meerkat_id=mId.
    - INSERT `meerkat_version_history` `{meerkat_id: mId, from_version: current_active (or null), to_version: v, changed_by: 'system-auto-promote', reason: 'auto-promote at 100%+7d'}`.
    - DELETE feature_flags WHERE flag_key = flag.flag_key.
    - `writeFlagAudit({flag_key, actor: 'system-auto-promote', action: 'deleted', before: flag, after: null})`.
    - `invalidateFlagCache()`, `clearMeerkatVersionCache()`.
    - Fire-and-forget `resyncAgentsByMeerkat(mId)`.
    - Incrementar `promoted`.
  - En error, empujar mensaje a `errors[]` y continuar (no romper el batch).

- [ ] **Step 1: Create file**

Crear `src/lib/feature-flags/auto-promote.ts` implementando ambas funciones exactamente como especifican las reglas arriba. Importar:
- `SupabaseClient` type (o usar `ReturnType<typeof createAdminClient>`)
- `writeFlagAudit` de `./audit`
- `invalidateFlagCache` de `./evaluator`
- `clearMeerkatVersionCache` de `@/lib/vapi/resolve-meerkat`
- `resyncAgentsByMeerkat` de `@/lib/vapi/resync-meerkat`
- `FlagRow` de `./types`

Firma de `computeAt100Transition`:
```ts
export function computeAt100Transition(input: {
  before: { rollout_pct: number; killed: boolean; at_100_since: string | null } | null;
  after_pct: number;
  after_killed: boolean;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  if (input.after_killed) return null;
  if (input.after_pct !== 100) return null;
  const b = input.before;
  if (b && b.rollout_pct === 100 && !b.killed && b.at_100_since) return b.at_100_since;
  return now.toISOString();
}
```

Firma de `runAutoPromote`:
```ts
type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

export async function runAutoPromote(
  supabase: SupabaseAdmin,
  opts?: { now?: Date },
): Promise<{ candidates: number; promoted: number; skipped_non_meerkat: number; errors: string[] }> {
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - SOAK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('killed', false)
    .eq('rollout_pct', 100)
    .lte('at_100_since', cutoff)
    .not('at_100_since', 'is', null);

  if (error) {
    return { candidates: 0, promoted: 0, skipped_non_meerkat: 0, errors: [error.message] };
  }

  const result = { candidates: (candidates ?? []).length, promoted: 0, skipped_non_meerkat: 0, errors: [] as string[] };

  const meerkatRe = /^meerkat\.([^.]+)\.v(\d+)$/;

  for (const flag of (candidates ?? []) as FlagRow[]) {
    const m = meerkatRe.exec(flag.flag_key);
    if (!m) {
      result.skipped_non_meerkat++;
      continue;
    }
    const meerkatId = m[1];
    const version = Number(m[2]);
    try {
      const { data: currentActive } = await supabase
        .from('meerkat_active_versions')
        .select('active_version')
        .eq('meerkat_id', meerkatId)
        .maybeSingle();
      const fromVersion = currentActive?.active_version ?? null;

      const { error: histErr } = await supabase.from('meerkat_version_history').insert({
        meerkat_id: meerkatId,
        from_version: fromVersion,
        to_version: version,
        changed_by: 'system-auto-promote',
        reason: 'auto-promote at 100%+7d',
      });
      if (histErr) throw new Error(`history insert: ${histErr.message}`);

      const { error: updErr } = await supabase
        .from('meerkat_active_versions')
        .update({
          active_version: version,
          activated_at: now.toISOString(),
          activated_by: 'system-auto-promote',
          notes: 'auto-promote at 100%+7d',
        })
        .eq('meerkat_id', meerkatId);
      if (updErr) throw new Error(`active_versions update: ${updErr.message}`);

      const { error: delErr } = await supabase.from('feature_flags').delete().eq('flag_key', flag.flag_key);
      if (delErr) throw new Error(`flag delete: ${delErr.message}`);

      await writeFlagAudit({
        flag_key: flag.flag_key,
        actor: 'system-auto-promote',
        action: 'deleted',
        before: flag,
        after: null,
      });

      invalidateFlagCache();
      clearMeerkatVersionCache();

      resyncAgentsByMeerkat(meerkatId).catch((err: Error) => {
        console.error('[auto-promote] resync failed', { meerkatId, error: err.message });
      });

      result.promoted++;
    } catch (e) {
      result.errors.push(`${flag.flag_key}: ${(e as Error).message}`);
    }
  }

  return result;
}

export const SOAK_DAYS = 7;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/feature-flags/auto-promote.ts
git commit -m @'
feat(feature-flags): computeAt100Transition + runAutoPromote

Helper puro para transiciones at_100_since usado por mutation
routes. runAutoPromote itera candidatos, promueve solo
meerkat.* (skipped_non_meerkat count para el resto). Errores
por flag no bloquean el batch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 3: Cron route + vercel.json

**Files:**
- Create: `src/app/api/cron/flags-promote/route.ts`
- Modify: `vercel.json` (agregar entry)

**Interfaces:**
- Consumes: `runAutoPromote` (Task 2)
- Produces: endpoint `GET /api/cron/flags-promote` con Bearer auth.

- [ ] **Step 1: Cron route**

Crear `src/app/api/cron/flags-promote/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAutoPromote } from '@/lib/feature-flags/auto-promote';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runAutoPromote(supabase);
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 2: Register cron in vercel.json**

Leer `vercel.json`, agregar al array `crons` (después de flags-snapshot):

```json
{ "path": "/api/cron/flags-promote", "schedule": "0 11 * * *" }
```

(11 UTC = 5am Monterrey, 1h después del snapshot.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/cron/flags-promote/route.ts vercel.json
git commit -m @'
feat(cron): flags-promote diario a 11 UTC (5am Monterrey)

Corre 1h despues del snapshot para que la foto diaria capture
el estado antes de cualquier promocion. Bearer auth con
CRON_SECRET.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: Wire helper en POST + PATCH + kill routes

**Files:**
- Modify: `src/app/api/admin/flags/route.ts` (POST)
- Modify: `src/app/api/admin/flags/[key]/route.ts` (PATCH)
- Modify: `src/app/api/admin/flags/[key]/kill/route.ts`

**Interfaces:**
- Consumes: `computeAt100Transition` (Task 2)
- Produces: los 3 routes ahora setean/limpian `at_100_since` correctamente en cada mutación.

**Regla común:** al construir el patch/insert, calcular:
```ts
const at_100_since = computeAt100Transition({
  before: existingRow ? { rollout_pct, killed, at_100_since } : null,
  after_pct: finalRolloutPct,
  after_killed: finalKilled,
});
```
Y ponerlo en el patch/insert junto con `updated_at`.

- [ ] **Step 1: POST /api/admin/flags/route.ts**

En el bloque que construye `row` antes del insert, agregar cálculo:

```ts
import { computeAt100Transition } from '@/lib/feature-flags/auto-promote';

// ...dentro del handler POST, antes del insert:
const at_100_since = computeAt100Transition({
  before: null,
  after_pct: rollout_pct,
  after_killed: false,
});

const row = {
  flag_key,
  description,
  rollout_pct,
  allowlist,
  denylist,
  default_on,
  killed:       false,
  at_100_since,
  updated_by:   ADMIN_ACTOR,
  updated_at:   new Date().toISOString(),
};
```

- [ ] **Step 2: PATCH /api/admin/flags/[key]/route.ts**

Después del `select` que trae `before`, calcular `at_100_since` usando la fila before y los nuevos valores. Meter en el patch:

```ts
import { computeAt100Transition } from '@/lib/feature-flags/auto-promote';

// dentro del handler PATCH, despues de leer `before`:
const nextPct    = patch.rollout_pct ?? before.rollout_pct;
const nextKilled = before.killed; // PATCH no toca killed
patch.at_100_since = computeAt100Transition({
  before: { rollout_pct: before.rollout_pct, killed: before.killed, at_100_since: before.at_100_since },
  after_pct: nextPct,
  after_killed: nextKilled,
});
```

(Ojo: `patch` puede o no incluir `rollout_pct` según el body. Usar el `??` para fallback al valor previo.)

- [ ] **Step 3: kill route `[key]/kill/route.ts`**

Kill/unkill ambos afectan `at_100_since`:

```ts
import { computeAt100Transition } from '@/lib/feature-flags/auto-promote';

// dentro del handler POST, cuando se detecta que va a cambiar:
const at_100_since = computeAt100Transition({
  before: { rollout_pct: before.rollout_pct, killed: before.killed, at_100_since: before.at_100_since },
  after_pct: before.rollout_pct,
  after_killed: targetKilled,
});

// agregar `at_100_since` al `.update({...})` del supabase
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/admin/flags/route.ts src/app/api/admin/flags/[key]/route.ts src/app/api/admin/flags/[key]/kill/route.ts
git commit -m @'
feat(admin): mutation routes tracking at_100_since

POST, PATCH y kill usan computeAt100Transition para setear/
limpiar la columna. Kill limpia siempre; unkill arranca timer
si esta en 100%; PATCH mantiene el timer si sigue en 100%,
reinicia si transita a 100 desde otro valor, limpia si baja.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 5: Wire helper en activate route (pilar 1 integration)

**Files:**
- Modify: `src/app/api/admin/versiones/[meerkat]/activate/route.ts`

**Interfaces:**
- Consumes: `computeAt100Transition` (Task 2)
- Produces: el activate route setea `at_100_since` correctamente al upsert del flag.

**Regla:** en el upsert que hace activate, aplicar el helper igual que PATCH pero con el nuevo `rollout_pct` (que viene de `initial_pct`).

- [ ] **Step 1: Modify activate route**

Después del `select beforeFlag`, calcular:

```ts
import { computeAt100Transition } from '@/lib/feature-flags/auto-promote';

// dentro del handler, despues del "const { data: beforeFlag }..." y antes del upsert:
const at_100_since = computeAt100Transition({
  before: beforeFlag
    ? { rollout_pct: beforeFlag.rollout_pct, killed: beforeFlag.killed, at_100_since: beforeFlag.at_100_since }
    : null,
  after_pct: initialPct,
  after_killed: false,
});

// En el upsert, agregar el campo:
.upsert({
  flag_key,
  description,
  rollout_pct: initialPct,
  allowlist,
  denylist:    [],
  killed:      false,
  default_on:  false,
  at_100_since,
  updated_by:  auth.email,
  updated_at:  new Date().toISOString(),
}, { onConflict: 'flag_key' })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/admin/versiones/[meerkat]/activate/route.ts
git commit -m @'
feat(admin): activate route setea at_100_since en upsert

Cuando activate crea/actualiza un flag con initial_pct=100
(caso raro pero valido), arranca el timer soak. Si el flag
ya existia en 100%, mantiene el timer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: UI badges (editor + list)

**Files:**
- Modify: `src/components/admin/FlagEditor.tsx`
- Modify: `src/components/admin/FlagsTable.tsx`

**Interfaces:**
- Consumes: `flag.at_100_since` (Task 1 field)
- Produces: badges visibles en editor y en la fila de la tabla.

**Reglas visuales:**
- Si `at_100_since` es null → no mostrar nada.
- Si `at_100_since` set y días desde entonces `< 7` → chip morado "en 100% desde hace Nd".
- Si `at_100_since` set y días `>= 7`:
  - Si flag_key empieza con `meerkat.` → chip verde "listo (auto-promote pendiente)".
  - Si no → chip verde "listo para limpieza: borra el guard en código y luego borrá el flag".

- [ ] **Step 1: Helper compartido**

Al inicio de `FlagsTable.tsx` (o mejor en un nuevo archivo `src/lib/feature-flags/badges.ts` para reuso):

```ts
export function computeAt100Badge(flag: { flag_key: string; at_100_since: string | null }): {
  label: string;
  tone: 'purple' | 'green';
  isMeerkat: boolean;
} | null {
  if (!flag.at_100_since) return null;
  const days = Math.floor((Date.now() - new Date(flag.at_100_since).getTime()) / 86400000);
  const isMeerkat = flag.flag_key.startsWith('meerkat.');
  if (days < 7) {
    return { label: `en 100% desde hace ${days}d`, tone: 'purple', isMeerkat };
  }
  if (isMeerkat) {
    return { label: `listo (auto-promote pendiente)`, tone: 'green', isMeerkat: true };
  }
  return { label: `listo para limpieza`, tone: 'green', isMeerkat: false };
}
```

Guardar en `src/lib/feature-flags/badges.ts`.

- [ ] **Step 2: FlagsTable badge en la fila**

En `src/components/admin/FlagsTable.tsx`, importar el helper y renderizar el chip al lado de `flag_key` o `estado`. Elegí `estado`. Cambiar la celda estado para incluir ambos (KILLED o at_100 badge):

```tsx
import { computeAt100Badge } from '@/lib/feature-flags/badges';

// dentro del map:
const at100 = computeAt100Badge(f);
// en la celda estado:
{f.killed ? (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}>
    <Ban size={12} /> KILLED
  </span>
) : at100 ? (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{
    background: at100.tone === 'green' ? 'rgba(22,163,74,0.15)' : 'rgba(108,59,255,0.15)',
    color:      at100.tone === 'green' ? '#16A34A' : '#9B6DFF',
  }}>
    {at100.label}
  </span>
) : (
  <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>activo</span>
)}
```

- [ ] **Step 3: FlagEditor badge**

En `src/components/admin/FlagEditor.tsx`, cerca del header del formulario (después de `<label>flag_key</label>` block, antes de description), agregar bloque condicional. Solo aplica en `mode === 'edit'` y cuando `flag?.at_100_since` está set:

```tsx
import { computeAt100Badge } from '@/lib/feature-flags/badges';

// dentro del componente:
const at100 = flag ? computeAt100Badge(flag) : null;

// en el JSX, entre el header y el input de description:
{at100 && (
  <div className="rounded-lg px-3 py-2 text-sm" style={{
    background: at100.tone === 'green' ? 'rgba(22,163,74,0.1)' : 'rgba(108,59,255,0.1)',
    color:      at100.tone === 'green' ? '#16A34A' : '#9B6DFF',
    border:     `1px solid ${at100.tone === 'green' ? 'rgba(22,163,74,0.3)' : 'rgba(108,59,255,0.3)'}`,
  }}>
    {at100.label}
    {at100.tone === 'green' && !at100.isMeerkat && ': borra el guard en código antes de borrar el flag para evitar comportamiento inesperado.'}
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/feature-flags/badges.ts src/components/admin/FlagsTable.tsx src/components/admin/FlagEditor.tsx
git commit -m @'
feat(admin): at_100_since badges en list + editor

Chip morado durante los primeros 7 dias. Chip verde al pasar
el soak: para meerkat.* dice "auto-promote pendiente"; para
los demas dice "listo para limpieza" con warning de limpiar
el guard en codigo primero.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Post-plan checklist (Nazre corre manualmente)

1. Correr `migrations/20260801_flag_at_100.sql` en Supabase Studio.
2. Verificar cron en Vercel dashboard listing.
3. Trigger manual del cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://www.centinelia.mx/api/cron/flags-promote`. Sin flags a 100% + 7d, responde `{ok: true, candidates: 0, promoted: 0, skipped_non_meerkat: 0, errors: []}`.
4. Crear un flag de prueba en `/admin/flags/new` con `flag_key=tool.smoke_100`, rollout_pct=100. Verificar en detail que aparece badge morado "en 100% desde hace 0d".
5. Manual: en Supabase Studio, hacer `UPDATE feature_flags SET at_100_since = NOW() - INTERVAL '8 days' WHERE flag_key = 'tool.smoke_100';`. Refrescar `/admin/flags/tool.smoke_100` → badge verde "listo para limpieza".
6. Repetir con `flag_key = meerkat.nia.v2` (si existe) o forzar la promoción con el cron manual — verificar que el flag desapareció y `meerkat_active_versions.active_version=2`, con fila nueva en `meerkat_version_history` reason='auto-promote at 100%+7d'.
