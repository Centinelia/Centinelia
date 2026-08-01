# Persistir Check-ins de Nox/Niva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir cada check-in de Nox/Niva a nueva tabla `heartbeat_runs` y mostrarlos en nueva sección arriba de la pestaña `Oficina · Reportes`, con auto-mark-read al click, botón Copiar y badge de sin leer en el sidebar. Solo aplica a coordinators (Nox, Niva). Retention 30d implícita en query.

**Architecture:** Nueva tabla `heartbeat_runs` (agent_id, portal_email, ran_at, frequency, subject, content_md, read_at). El cron `heartbeat` corriendo ya, se le agrega un insert fire-and-forget después del `sendEmail` cuando el agente tiene `features.meerkat_role_id in ('nox', 'niva')`. Dos endpoints portal (`GET /heartbeat-runs`, `PATCH /heartbeat-runs/[id]/read`) con IDOR guard. Nuevo componente `<CheckinsSection />` renderizado condicionalmente arriba de `OpsReportsSection` cuando `hasCoordinator=true`. Badge sidebar cuenta rows sin `read_at` en ventana 30d.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres), Tailwind 3, Lucide React, Sonner (toasts), `marked` (ya disponible).

## Global Constraints

- Spanish, sin em-dashes (`—`). Usar `:` `,` `.`
- Sin emojis en UI. Íconos Lucide únicamente (Copy, ChevronDown, ChevronUp, Inbox).
- Sin "IA" en copy visible. Labels: "Check-ins de tus coordinadores", "Sin leer", "Copiar", "Copiado", "Hace 2h", etc.
- Cero cambios a `ops_reports`, `ops_report_runs`, o al flow de envío por email.
- `./node_modules/.bin/tsc --noEmit` debe pasar limpio al final de cada task.
- Skill obligatoria: `centinelia-portal-security` — IDOR guard en ambos endpoints (verificar `portal_email` match en query).
- Sin nuevas dependencias (`marked` ya en package.json v18.0.7, importable directamente).
- Migration manual en Supabase antes del deploy del cron+UI.
- Commits incrementales, uno por task.

---

## File Structure

**Created:**
- `migrations/20260731_heartbeat_runs.sql` — DDL + índices
- `src/app/api/portal/[token]/heartbeat-runs/route.ts` — GET listar últimos 30d
- `src/app/api/portal/[token]/heartbeat-runs/[id]/read/route.ts` — PATCH auto-mark-read
- `src/app/portal/[token]/reportes/CheckinsSection.tsx` — nueva sección UI arriba de ops_reports

**Modified:**
- `src/app/api/cron/heartbeat/route.ts` — agregar `portal_email` al select + insert fire-and-forget
- `src/app/portal/[token]/oficina/reportes/page.tsx` — calcular `hasCoordinator` + pasar `agents` con `meerkat_role_id`
- `src/app/portal/[token]/OpsReportsSection.tsx` — aceptar props `hasCoordinator` + `agents` (con meerkat_role_id) + renderizar `<CheckinsSection />` condicional
- `src/app/portal/[token]/oficina/layout.tsx` — nueva query count de `heartbeat_runs` sin leer + agregar a `badges` object
- `src/app/portal/[token]/oficina/OficinaSidebar.tsx` — cambiar `badgeKey: ''` a `badgeKey: 'reportes'` en el item Reportes

---

## Task 1: Migration `heartbeat_runs`

**Files:**
- Create: `migrations/20260731_heartbeat_runs.sql`

**Interfaces:**
- Produces (para el resto del plan, tabla accesible en Supabase):
  ```
  heartbeat_runs (
    id UUID PK,
    agent_id UUID FK → voice_agents(id) ON DELETE CASCADE,
    portal_email TEXT NOT NULL,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    frequency TEXT NOT NULL CHECK IN ('daily','weekly'),
    subject TEXT NOT NULL,
    content_md TEXT NOT NULL,
    read_at TIMESTAMPTZ NULL
  )
  Indexes:
    - heartbeat_runs_portal_ran (portal_email, ran_at DESC)
    - heartbeat_runs_unread (portal_email, read_at) WHERE read_at IS NULL
  ```

- [ ] **Step 1: Crear el archivo SQL de migración**

```sql
-- migrations/20260731_heartbeat_runs.sql
-- Persistir check-ins de coordinators (Nox, Niva) para mostrar en Oficina · Reportes.
-- Retention 30 días implícita en query (WHERE ran_at > NOW() - INTERVAL '30 days').
-- Rows viejos quedan hasta que decidamos si hacer cron de purga.

CREATE TABLE IF NOT EXISTS heartbeat_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email TEXT NOT NULL,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  subject      TEXT NOT NULL,
  content_md   TEXT NOT NULL,
  read_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS heartbeat_runs_portal_ran
  ON heartbeat_runs(portal_email, ran_at DESC);

CREATE INDEX IF NOT EXISTS heartbeat_runs_unread
  ON heartbeat_runs(portal_email, read_at) WHERE read_at IS NULL;

-- RLS deshabilitada (consistente con ops_report_runs y todo el portal:
-- acceso vía createAdminClient + validación de sesión en cada API route).
```

- [ ] **Step 2: Aplicar la migración manualmente en Supabase**

Ir a Supabase Dashboard → SQL Editor → pegar el contenido del archivo → correr. Verificar que la tabla y los 2 índices se crearon:

```sql
SELECT tablename FROM pg_tables WHERE tablename = 'heartbeat_runs';
SELECT indexname FROM pg_indexes WHERE tablename = 'heartbeat_runs';
```

Esperado: 1 row en tablename, 3 rows en indexname (los 2 explícitos + el PK implícito).

- [ ] **Step 3: Commit del archivo SQL**

```bash
git add migrations/20260731_heartbeat_runs.sql
git commit -m "$(cat <<'EOF'
migration(heartbeat_runs): tabla para persistir check-ins de Nox/Niva

Nueva tabla + 2 índices (portal_email+ran_at DESC, unread parcial).
RLS deshabilitada (patrón centinelia portal: admin client + session guard
en API routes). Retention 30d se aplica en query, no cron.

Correr manualmente en Supabase antes del deploy del cron+UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Cron mod — persistir después del email

**Files:**
- Modify: `src/app/api/cron/heartbeat/route.ts`

**Interfaces:**
- Consumes: tabla `heartbeat_runs` de Task 1.
- Produces: cada corrida exitosa del cron para un agent coordinator inserta un row en `heartbeat_runs`.

- [ ] **Step 1: Agregar `portal_email` al select de agents (línea ~34)**

El select actual:
```ts
const { data: agents } = await supabase
  .from('voice_agents')
  .select('id, agent_name, business_name, client_email, timezone, heartbeat_config, heartbeat_last_run_at, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
  .eq('active', true)
  .not('heartbeat_config', 'is', null);
```

Cambiar a:
```ts
const { data: agents } = await supabase
  .from('voice_agents')
  .select('id, agent_name, business_name, client_email, portal_email, timezone, heartbeat_config, heartbeat_last_run_at, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
  .eq('active', true)
  .not('heartbeat_config', 'is', null);
```

- [ ] **Step 2: Insertar row en `heartbeat_runs` después del `await sendEmail(...)`**

En el mismo archivo `src/app/api/cron/heartbeat/route.ts`, dentro del bloque `if (agent.client_email) { await sendEmail(...) }` (líneas ~122-134). Justo después del bloque `sendEmail` (fuera del `if` de client_email, DENTRO del `for` de agents), agregar:

```ts
    // Persistir check-in a heartbeat_runs solo si el agente es coordinator (Nox / Niva).
    // Fire-and-forget: no bloquea el cron ni el rate limit del siguiente agente.
    // El insert corre haya tenido o no éxito el email (correo es notificación, DB es fuente de verdad).
    const meerkatId     = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id ?? null;
    const isCoordinator = meerkatId === 'nox' || meerkatId === 'niva';

    if (isCoordinator && agent.portal_email) {
      const freqLabel = cfg.frequency === 'weekly' ? 'Semanal' : 'Diario';
      supabase.from('heartbeat_runs').insert({
        agent_id:     agent.id,
        portal_email: agent.portal_email,
        frequency:    cfg.frequency,
        subject:      `Check-in ${freqLabel}: ${agent.agent_name ?? agent.business_name}`,
        content_md:   result,
      }).then(({ error }) => {
        if (error) console.error('[heartbeat] persist error:', error);
      });
    }
```

Colocar **después** del bloque `if (agent.client_email)` y **antes** del `ran++;` (línea ~136).

**Nota:** `freqLabel` ya se calcula dentro del `if (agent.client_email)` (línea ~123). Está en un scope inner — por eso lo re-calculamos aquí en el scope del `for`. Alternativa: subir la declaración de `freqLabel` fuera del `if` para reutilizarla. Cualquiera de las dos es aceptable.

- [ ] **Step 3: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 4: Smoke manual (opcional pero recomendado)**

En un portal de dev con Nox configurado con `heartbeat_config.enabled=true`, `frequency='daily'`, `hour = <hora actual>`:
1. Curl el cron:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://localhost:3000/api/cron/heartbeat
   ```
2. Verificar en Supabase: `SELECT * FROM heartbeat_runs ORDER BY ran_at DESC LIMIT 3;`
3. Esperar 1 row con el subject "Check-in Diario: <agente>" y content_md poblado.

Si el smoke no aplica (no hay dev portal con Nox activo), skip y validar en prod con el próximo run del cron.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/heartbeat/route.ts
git commit -m "$(cat <<'EOF'
feat(heartbeat): persistir check-ins de Nox/Niva a heartbeat_runs

Después del sendEmail exitoso, si el agente es coordinator (features.
meerkat_role_id in nox/niva), insert fire-and-forget en heartbeat_runs
con subject + content_md + frequency. Log silencioso en error, no
bloquea el cron.

Precondición: correr migration 20260731_heartbeat_runs.sql en Supabase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: API endpoints GET + PATCH

**Files:**
- Create: `src/app/api/portal/[token]/heartbeat-runs/route.ts`
- Create: `src/app/api/portal/[token]/heartbeat-runs/[id]/read/route.ts`

**Interfaces:**
- Consumes: tabla `heartbeat_runs` de Task 1.
- Produces:
  - `GET /api/portal/[token]/heartbeat-runs` → `{ runs: HeartbeatRun[] }` donde
    ```ts
    interface HeartbeatRun {
      id:           string;
      agent_id:     string;
      ran_at:       string;   // ISO
      frequency:    'daily' | 'weekly';
      subject:      string;
      content_md:   string;
      read_at:      string | null;
    }
    ```
  - `PATCH /api/portal/[token]/heartbeat-runs/[id]/read` → `{ ok: true }` (idempotente: no re-marca si ya leído)

- [ ] **Step 1: Crear el GET endpoint**

Crear `src/app/api/portal/[token]/heartbeat-runs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: acct } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!acct?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data: runs } = await supabase
    .from('heartbeat_runs')
    .select('id, agent_id, ran_at, frequency, subject, content_md, read_at')
    .eq('portal_email', acct.portal_email)
    .gte('ran_at', thirtyDaysAgo)
    .order('ran_at', { ascending: false })
    .limit(100);

  return NextResponse.json({ runs: runs ?? [] });
}
```

- [ ] **Step 2: Crear el PATCH endpoint (auto-mark-read)**

Crear `src/app/api/portal/[token]/heartbeat-runs/[id]/read/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: acct } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!acct?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { error } = await supabase
    .from('heartbeat_runs')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('portal_email', acct.portal_email)  // IDOR guard: no puede marcar otro portal
    .is('read_at', null);                     // idempotente: no re-marca

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 4: Smoke manual**

Con al menos 1 row en `heartbeat_runs` desde Task 2:
1. En dev, abrir `http://localhost:3000/api/portal/<token>/heartbeat-runs` autenticado (via portal login).
2. Verificar respuesta JSON con `{ runs: [...] }` conteniendo el row insertado.
3. Curl PATCH:
   ```bash
   curl -X PATCH -b "portal_session=<cookie>" http://localhost:3000/api/portal/<token>/heartbeat-runs/<id>/read
   ```
4. Verificar en Supabase que `read_at` está set.

Si no hay portal dev con Nox, skip smoke y validar más adelante en Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/[token]/heartbeat-runs/
git commit -m "$(cat <<'EOF'
feat(portal-api): heartbeat-runs GET + PATCH read

GET lista últimos 30d de check-ins persistidos, ordered desc, limit 100.
PATCH /[id]/read auto-marca leído (idempotente). IDOR guard verifica
portal_email en query. Sub-user guard sigue en oficina/reportes/page.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Componente `<CheckinsSection />`

**Files:**
- Create: `src/app/portal/[token]/reportes/CheckinsSection.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/portal/[token]/heartbeat-runs` de Task 3
  - `PATCH /api/portal/[token]/heartbeat-runs/[id]/read` de Task 3
  - `MEERKAT_MAP` de `@/lib/portal/meerkat-roles` (para chip agente color/nombre)
  - `marked` import directo
- Produces:
  ```ts
  interface CheckinsSectionAgent {
    id:              string;
    business_name:   string;
    meerkat_role_id: string | null;
  }

  interface CheckinsSectionProps {
    token:  string;
    agents: CheckinsSectionAgent[];
  }

  export default function CheckinsSection(props: CheckinsSectionProps): JSX.Element
  ```

- [ ] **Step 1: Crear el archivo con el componente completo**

Crear `src/app/portal/[token]/reportes/CheckinsSection.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, ChevronDown, ChevronUp, Inbox, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { marked } from 'marked';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

interface HeartbeatRun {
  id:         string;
  agent_id:   string;
  ran_at:     string;
  frequency:  'daily' | 'weekly';
  subject:    string;
  content_md: string;
  read_at:    string | null;
}

export interface CheckinsSectionAgent {
  id:              string;
  business_name:   string;
  meerkat_role_id: string | null;
}

interface Props {
  token:  string;
  agents: CheckinsSectionAgent[];
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)  return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7)   return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  return `Hace ${weeks} sem`;
}

export default function CheckinsSection({ token, agents }: Props) {
  const [runs, setRuns]           = useState<HeartbeatRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expandedId, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/heartbeat-runs`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs ?? []);
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic update
    setRuns(prev => prev.map(r => r.id === id ? { ...r, read_at: new Date().toISOString() } : r));
    fetch(`/api/portal/${token}/heartbeat-runs/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }, [token]);

  const toggle = (id: string) => {
    const opening = expandedId !== id;
    setExpanded(opening ? id : null);
    if (opening) {
      const run = runs.find(r => r.id === id);
      if (run && !run.read_at) markRead(id);
    }
  };

  const copy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const agentInfo = (agentId: string) => {
    const a = agents.find(x => x.id === agentId);
    if (!a || !a.meerkat_role_id) return { name: a?.business_name ?? 'Agente', color: '#6C3BFF' };
    const meerkat = MEERKAT_MAP[a.meerkat_role_id as keyof typeof MEERKAT_MAP];
    return { name: meerkat?.nombre ?? a.business_name, color: meerkat?.color ?? '#6C3BFF' };
  };

  const unreadCount = runs.filter(r => !r.read_at).length;

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-xl h-14 animate-pulse" style={{ background: 'var(--c-surface-2)' }} />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
        <Inbox size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--c-text-4)' }} />
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          Los check-ins de Nox y Niva aparecerán aquí cuando ejecuten.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
          Configura la frecuencia en la sección de cada agente.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Check-ins de tus coordinadores
          </span>
          {unreadCount > 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF' }}
            >
              {unreadCount} sin leer
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className="p-1.5 rounded-lg"
          style={{ color: 'var(--c-text-4)' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {runs.map(run => {
        const isExpanded = expandedId === run.id;
        const isUnread   = !run.read_at;
        const info       = agentInfo(run.agent_id);
        return (
          <div
            key={run.id}
            className="rounded-xl overflow-hidden"
            style={{
              border:     `1px solid ${isExpanded ? info.color + '44' : 'var(--c-border)'}`,
              background: isExpanded ? `${info.color}08` : 'var(--c-surface-2)',
            }}
          >
            <button
              type="button"
              onClick={() => toggle(run.id)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50/50"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex-shrink-0 pt-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: isUnread ? info.color : 'transparent',
                    border:     isUnread ? 'none' : '1px solid var(--c-border-2)',
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: `${info.color}18`, color: info.color, border: `1px solid ${info.color}30` }}
                  >
                    {info.name}
                  </span>
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: 'var(--c-text-4)' }}
                  >
                    {run.frequency === 'weekly' ? 'Semanal' : 'Diario'}
                  </span>
                </div>
                <p
                  className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-normal'}`}
                  style={{ color: isUnread ? 'var(--c-text)' : 'var(--c-text-3)' }}
                >
                  {run.subject}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                  {relativeTime(run.ran_at)}
                </span>
                {isExpanded
                  ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} />
                  : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: `1px solid ${info.color}20` }}>
                <div
                  className="text-xs leading-relaxed mt-3 mb-3 prose prose-sm max-w-none"
                  style={{ color: 'var(--c-text-2)' }}
                  dangerouslySetInnerHTML={{ __html: marked.parse(run.content_md) as string }}
                />
                <button
                  type="button"
                  onClick={() => copy(run.content_md)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}
                >
                  <Copy size={12} />
                  Copiar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 3: Commit (aún no wired al UI padre, viene en Task 5)**

```bash
git add src/app/portal/[token]/reportes/CheckinsSection.tsx
git commit -m "$(cat <<'EOF'
feat(reportes): CheckinsSection para mostrar heartbeat_runs

Card colapsable por check-in. Click expande + auto-mark-read (optimistic).
Body: markdown renderizado con marked + botón Copiar (clipboard + toast).
Empty state cuando no hay runs. Chip de agente con color del meerkat
(Nox lila / Niva). Fecha relativa (Hace 2h, Ayer, etc.). Aún no
conectado al parent — wiring en Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `<CheckinsSection />` al parent + page.tsx

**Files:**
- Modify: `src/app/portal/[token]/oficina/reportes/page.tsx`
- Modify: `src/app/portal/[token]/OpsReportsSection.tsx`

**Interfaces:**
- Consumes: `<CheckinsSection />` de Task 4, con props `token` + `agents: CheckinsSectionAgent[]`.
- Produces: `OpsReportsSection` acepta nuevas props opcionales `hasCoordinator?: boolean` + `checkinsAgents?: CheckinsSectionAgent[]`. Renderiza `<CheckinsSection />` arriba de la sección actual solo si `hasCoordinator=true`.

- [ ] **Step 1: Modificar `oficina/reportes/page.tsx` para calcular `hasCoordinator` + mapear agents con meerkat_role_id**

Ubicar el bloque:
```tsx
const agents = (all ?? []).map((a: any) => ({
  id:            a.id,
  business_name: a.business_name,
  role:          a.role ?? null,
}));
```

Justo debajo agregar:
```tsx
const checkinsAgents = (all ?? []).map((a: any) => ({
  id:              a.id,
  business_name:   a.business_name,
  meerkat_role_id: (a.features as any)?.meerkat_role_id ?? null,
}));
const hasCoordinator = checkinsAgents.some(a =>
  a.meerkat_role_id === 'nox' || a.meerkat_role_id === 'niva'
);
```

En el JSX final, cambiar:
```tsx
<OpsReportsSection token={token} agents={agents} meerkatRoleId={meerkatRoleId} reportAgentId={reportAgentId} />
```

Por:
```tsx
<OpsReportsSection
  token={token}
  agents={agents}
  meerkatRoleId={meerkatRoleId}
  reportAgentId={reportAgentId}
  hasCoordinator={hasCoordinator}
  checkinsAgents={checkinsAgents}
/>
```

- [ ] **Step 2: Modificar `OpsReportsSection.tsx` para aceptar nuevas props + renderizar CheckinsSection**

Actualizar la signature del componente (línea ~100):
```tsx
export default function OpsReportsSection({ token, agents, meerkatRoleId, reportAgentId, hasCoordinator, checkinsAgents }: {
  token:           string;
  agents:          Array<{ id: string; business_name: string; role: string | null }>;
  meerkatRoleId?:  string | null;
  reportAgentId?:  string;
  hasCoordinator?: boolean;
  checkinsAgents?: CheckinsSectionAgent[];
}) {
```

Agregar import al top:
```tsx
import CheckinsSection, { type CheckinsSectionAgent } from './reportes/CheckinsSection';
```

En el JSX de retorno, identificar el `return (` principal del componente (después del `if (loading) ...`). El primer child del wrapper del return renderiza el banner o header actual. Insertar `<CheckinsSection />` justo después de ese header y antes del contenido de ops_reports.

Ejemplo (adaptar al JSX real que veas al editar):
```tsx
return (
  <div className="flex flex-col gap-6">
    {/* Banner header actual (sin cambios) */}
    {/* ... contenido del banner ... */}

    {/* NUEVO: sección de check-ins arriba, solo si hay coordinator */}
    {hasCoordinator && checkinsAgents && (
      <>
        <CheckinsSection token={token} agents={checkinsAgents} />
        <div className="h-px w-full" style={{ background: 'var(--c-border)' }} />
      </>
    )}

    {/* Resto del contenido actual: search, list de ops_reports, etc. */}
    {/* ... sin cambios ... */}
  </div>
);
```

**Nota:** el layout exacto del JSX de `OpsReportsSection` puede variar. Preservar 100% del contenido actual. Solo insertar el nuevo bloque después del header/banner y antes del CRUD de ops_reports.

- [ ] **Step 3: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 4: Smoke manual**

En dev con portal que tenga Nox o Niva activo:
1. Ir a `/portal/<token>/oficina/reportes`
2. Ver la sección "Check-ins de tus coordinadores" arriba
3. Si hay rows en DB de Task 2/3, se listan
4. Click en card → expande + auto-mark-read + dot cambia a hueco
5. Click en Copiar → toast "Copiado"
6. En portal sin coordinator (solo Nia/Sofía), la sección NO aparece
7. Resto de la pestaña (ops_reports CRUD) sigue idéntico

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/[token]/oficina/reportes/page.tsx src/app/portal/[token]/OpsReportsSection.tsx
git commit -m "$(cat <<'EOF'
feat(reportes): renderizar CheckinsSection arriba de ops_reports

page.tsx calcula hasCoordinator + mapea agents con meerkat_role_id.
OpsReportsSection acepta las 2 nuevas props opcionales y renderiza
la sección de check-ins arriba con divider debajo. Solo aparece si el
portal tiene Nox o Niva activo. Cero cambios al CRUD de ops_reports.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Sidebar badge en `oficina/layout.tsx`

**Files:**
- Modify: `src/app/portal/[token]/oficina/layout.tsx`
- Modify: `src/app/portal/[token]/oficina/OficinaSidebar.tsx`

**Interfaces:**
- Consumes: tabla `heartbeat_runs` (para count query) + `badges` object del layout.
- Produces: `badges.reportes` con conteo de rows sin leer en últimos 30d.

- [ ] **Step 1: Agregar count query al layout**

En `src/app/portal/[token]/oficina/layout.tsx`, ubicar el bloque de badges (línea ~77):
```ts
const badges: Record<string, number> = { bandeja: 0, contratos: 0, juntas: 0 };
```

Cambiar a:
```ts
const badges: Record<string, number> = { bandeja: 0, contratos: 0, juntas: 0, reportes: 0 };
```

Dentro del `if (lookupEmail) { try { if (agentIds.length > 0) { ... } } }`, después del bloque de `meetingQ` (~línea 138), agregar:

```ts
        // Unread check-ins de coordinators (Nox / Niva) últimos 30d
        const { count: hrc2 } = await supabase
          .from('heartbeat_runs')
          .select('id', { count: 'exact', head: true })
          .eq('portal_email', lookupEmail)
          .is('read_at', null)
          .gte('ran_at', cutoff);
        badges.reportes = hrc2 ?? 0;
```

**Nota:** `cutoff` ya está calculado en línea 87 (`new Date(Date.now() - 30 * 86400000).toISOString()`). Reutilizar.

- [ ] **Step 2: Wire badgeKey en OficinaSidebar**

En `src/app/portal/[token]/oficina/OficinaSidebar.tsx`, ubicar el item Reportes (línea ~38):
```ts
{ href: '/reportes', moduleId: 'of_reportes',   label: 'Reportes',          icon: BarChart2, badgeKey: '',        opsHint: '1 tarea/reporte',pulseId: 'of-reportes'   },
```

Cambiar `badgeKey: ''` a `badgeKey: 'reportes'`:
```ts
{ href: '/reportes', moduleId: 'of_reportes',   label: 'Reportes',          icon: BarChart2, badgeKey: 'reportes', opsHint: '1 tarea/reporte',pulseId: 'of-reportes'   },
```

**Nota:** el rendering del badge ya existe en el mismo componente para los otros items (`bandeja`, `contratos`, `juntas`). No requiere cambio adicional al render — solo el key. Verificar en el JSX del sidebar que la lookup es `badges[badgeKey]` (patrón existente).

- [ ] **Step 3: Verificar tipos**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio.

- [ ] **Step 4: Smoke manual**

En dev con portal + Nox y al menos 1 row sin leer en `heartbeat_runs`:
1. Reload de cualquier página de `/oficina/*`
2. Ver el badge junto a "Reportes" en el sidebar con el conteo
3. Click en Reportes → abrir un check-in → volver a otra página
4. El badge decrementa (el count query re-corre al reload)

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/[token]/oficina/layout.tsx src/app/portal/[token]/oficina/OficinaSidebar.tsx
git commit -m "$(cat <<'EOF'
feat(sidebar): badge de check-ins sin leer en pestaña Reportes

Layout calcula count de heartbeat_runs sin read_at en últimos 30d
para el portal. Sidebar item Reportes ahora usa badgeKey='reportes'
para mostrar el número. Consistente con badge de Bandeja.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verificación final + smoke E2E

**Files:**
- (Ninguno modificado en este task, solo verificación)

- [ ] **Step 1: tsc final**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: pasa limpio (0 errores).

- [ ] **Step 2: Verificar migration ya corrida en Supabase**

En Supabase Dashboard → SQL Editor:
```sql
SELECT COUNT(*) FROM heartbeat_runs;
SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'heartbeat_runs';
```

Esperado: primer query devuelve `>= 0`, segundo `= 3` (PK + 2 índices).

Si migration NO se ha corrido: correrla ahora (patrón habitual Centinelia — SQL manual en dashboard).

- [ ] **Step 3: Smoke E2E con Nazre**

Nazre revisa en el portal (dev o prod tras deploy):

1. **Portal con Nox activo:** entra a `/oficina/reportes` → ve la sección "Check-ins de tus coordinadores" arriba.
2. **Sidebar badge:** si hay rows sin leer, número aparece junto a "Reportes".
3. **Empty state:** portal recién arrancado (sin runs aún) muestra "Los check-ins de Nox y Niva aparecerán aquí cuando ejecuten."
4. **Card colapsada:** dot lila si sin leer + chip agente (Nox / Niva) con color meerkat + subject bold + fecha relativa.
5. **Click en card:** expande + dot se apaga + subject pasa a peso normal + PATCH read se dispara.
6. **Copiar:** botón Copiar en card expandida → clipboard tiene el markdown crudo + toast "Copiado".
7. **Portal sin coordinator:** sección NO aparece, badge NO aparece.
8. **Preservación:** el CRUD de ops_reports sigue idéntico (crear, editar, eliminar, forzar envío).
9. **Deep-links:** `?tab=<algo>` (si existía) sigue funcionando.

Si Nazre pide ajustes finos (spacing, color X, wording Y), commits adicionales de polish.

---

## Self-review notes (post-write)

**Spec coverage:**
- Schema DB con índices → Task 1.
- Cron mod (select + insert) → Task 2 (2 cambios explícitos).
- GET + PATCH endpoints con IDOR guard → Task 3.
- CheckinsSection componente + auto-mark-read + copiar → Task 4.
- Wire al parent + hasCoordinator + agents mapping → Task 5.
- Sidebar badge (query + badgeKey) → Task 6.
- Preservación 100% de ops_reports, deep-links, sub-user guard → constraint global + smoke Task 7.
- Retention 30d implícita en query → Tasks 3 + 6.
- Backfill inexistente (arranca vacía) → No-objetivo declarado en spec, esperado en smoke.
- Rollback seguro (drop tabla no rompe cron) → cron insert es fire-and-forget con catch.

**Placeholder scan:** sin TBD, sin "similar a Task N", cada task tiene código concreto.

**Type consistency:**
- `CheckinsSectionAgent` — definida en Task 4 (exportada), consumida en Tasks 4 + 5 con nombre exacto.
- `HeartbeatRun` — interface interna de Task 4; la shape que devuelve el GET (Task 3) coincide field-por-field.
- `heartbeat_runs` columnas → Task 1 define, Tasks 2/3/6 consumen los mismos nombres.
- `badges.reportes` → Task 6 declara + usa el mismo key en ambos archivos.
- `hasCoordinator` + `checkinsAgents` — definidas en Task 5 page.tsx, consumidas por Task 5 OpsReportsSection.

**Riesgo residual:** Task 5 Step 2 requiere leer el JSX real de `OpsReportsSection` para saber exactamente dónde insertar `<CheckinsSection />`. El plan da la instrucción semántica ("después del header, antes del CRUD") — el implementer debe ubicarlo con Read + Grep. Documentado.
