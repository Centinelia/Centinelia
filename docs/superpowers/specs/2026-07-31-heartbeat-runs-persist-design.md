# Persistir check-ins de Nox/Niva + mostrarlos en la pestaña Reportes

**Fecha:** 2026-07-31
**Trigger:** Sesión 54 (2026-07-31). Nazre reportó "veo reportes en correo pero la pestaña de Reportes está vacía". Investigación reveló que el cron heartbeat NUNCA persiste el contenido en DB, solo lo envía por email. El copy del `HeartbeatEditor` para coordinadores prometía "el resultado queda en Reportes de la Oficina" — promesa rota. Copy corregido de emergencia en commit `4ae06ed`. Este spec cubre el fix real.
**Estado:** Diseño aprobado, listo para implementación.

## Contexto

Cron `/api/cron/heartbeat` corre cada hora. Para cada agente con `heartbeat_config.enabled=true` y ventana de tiempo cumplida:
1. Genera markdown con Claude (Haiku 4.5) resumiendo actividad de las últimas 24h o 7d
2. Envía por correo al `client_email` del agente
3. Actualiza `voice_agents.heartbeat_last_run_at`

**No persiste el markdown a ninguna tabla.** El correo es la única copia. Si Nazre lo perdió, es irrecuperable.

La pestaña `Oficina · Reportes` muestra `ops_reports` configurados (CRUD de reportes ejecutivos programados con `data_snapshot` estructurado). Los heartbeats jamás aparecen ahí porque son un sistema paralelo.

## Objetivos

1. Persistir cada check-in de Nox/Niva a una nueva tabla `heartbeat_runs`.
2. Mostrar historial (30 días) en una nueva sección arriba de la pestaña Reportes.
3. Auto-mark-read al click en un check-in; badge de sin leer en la sidebar.
4. Permitir copiar el contenido markdown al clipboard.

## No objetivos

- Persistir heartbeats de agentes non-coordinator (Sofía, Nia, etc.) — solo Nox/Niva.
- Backfill de check-ins pasados — la tabla arranca vacía y se llena con los futuros.
- Cron de purga de rows > 30 días — la retención se aplica en query (`WHERE ran_at > NOW() - INTERVAL '30 days'`). Rows viejos quedan en DB sin borrar.
- Botón "reenviar por correo" — descartado por Nazre.
- Toggle manual read/unread — solo auto-mark al click.
- Editar la task del heartbeat desde la pestaña Reportes — sigue en el HeartbeatEditor del agente.

## Diseño

### 1. Schema DB

Nueva tabla `heartbeat_runs`:

```sql
CREATE TABLE heartbeat_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email TEXT NOT NULL,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  subject      TEXT NOT NULL,
  content_md   TEXT NOT NULL,
  read_at      TIMESTAMPTZ NULL
);

CREATE INDEX heartbeat_runs_portal_ran ON heartbeat_runs(portal_email, ran_at DESC);
CREATE INDEX heartbeat_runs_unread ON heartbeat_runs(portal_email, read_at) WHERE read_at IS NULL;
```

**Decisiones:**
- `portal_email` denormalizado para queries rápidas sin join.
- `content_md` es el markdown crudo generado por Claude (mismo string que va al email).
- `read_at` timestamp (no booleano) permite ordenar y filtrar temporalmente.
- Index parcial en unread acelera el count del sidebar badge.
- RLS deshabilitada (consistente con `ops_report_runs` y todo el portal — acceso vía `createAdminClient()` + validación de sesión).

Migration file: `migrations/20260731_heartbeat_runs.sql`.

### 2. Cron mod (`src/app/api/cron/heartbeat/route.ts`)

**Cambio 1:** agregar `portal_email` al select de línea 34 (actualmente no lo trae). Nuevo select:

```ts
.select('id, agent_name, business_name, client_email, portal_email, timezone, heartbeat_config, heartbeat_last_run_at, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
```

**Cambio 2:** después del `await sendEmail(...)` (línea 125-134), insertar row **solo si el agente es Nox o Niva**:

```ts
const meerkatId     = (agent.features as { meerkat_role_id?: string })?.meerkat_role_id ?? null;
const isCoordinator = meerkatId === 'nox' || meerkatId === 'niva';

if (isCoordinator && agent.portal_email) {
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

- Fire-and-forget (`.then().catch()` sin `await`) para no ralentizar el cron. Log en error.
- Insert después del `await sendEmail(...)` (que ya tiene `.catch(console.error)` swallow). El insert corre haya tenido o no éxito el email — el UI se convierte en fuente de verdad.
- Ninguna otra modificación al cron.

### 3. API endpoints

**`GET /api/portal/[token]/heartbeat-runs`** — listar últimos 30d:

```ts
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

const { data: runs } = await supabase
  .from('heartbeat_runs')
  .select('id, agent_id, ran_at, frequency, subject, content_md, read_at')
  .eq('portal_email', acct.portal_email)
  .gte('ran_at', thirtyDaysAgo)
  .order('ran_at', { ascending: false })
  .limit(100);

return NextResponse.json({ runs: runs ?? [] });
```

**`PATCH /api/portal/[token]/heartbeat-runs/[id]/read`** — auto-mark:

```ts
const { error } = await supabase
  .from('heartbeat_runs')
  .update({ read_at: new Date().toISOString() })
  .eq('id', id)
  .eq('portal_email', acct.portal_email)  // IDOR guard
  .is('read_at', null);
```

- Patrón IDOR (`centinelia-portal-security` skill): verificar `portal_email` en cada query.
- `verifySession(cookie)` en ambos endpoints; check `auth.portalEmail === acct.portal_email`.
- No hay endpoint DELETE ni "mark all as read".

### 4. UI

**4.1 Nuevo componente `<CheckinsSection />`** — archivo `src/app/portal/[token]/reportes/CheckinsSection.tsx`. Renderizado arriba de la sección existente de ops_reports en `OpsReportsSection.tsx`, solo si el portal tiene coordinator activo (`hasCoordinator` prop).

Estructura:
- Header: "Check-ins de tus coordinadores" + conteo total.
- Lista de cards colapsadas, ordenadas `ran_at desc`:
  - Row colapsada: dot de unread (lila `#6C3BFF` si sin leer, hueco gris si leído) + subject + chip agente (Nox / Niva) + fecha relativa ("Hace 2h", "Hace 3 días").
  - Click expande la card Y dispara PATCH mark-read (optimistic update).
  - Card expandida: markdown renderizado con `marked` (import de `src/lib/markdown/mdToEmailHtml.ts` o directo desde `marked`).
  - Botón "Copiar" (icon Lucide `Copy`) dentro de la card expandida: `navigator.clipboard.writeText(content_md)` + toast "Copiado".
- Empty state: "Los check-ins de Nox y Niva aparecerán aquí cuando ejecuten. Configura la frecuencia en la sección de cada agente."
- Loading: 3 skeleton rows.

Fetch: `useCallback + useEffect` (patrón OpsInboxSection). Sin polling; refresh al montar.

**4.2 Modificar `OpsReportsSection.tsx`** — aceptar prop `hasCoordinator: boolean`. Renderizar `<CheckinsSection />` si true, con divider debajo antes de la sección actual.

**4.3 Modificar `oficina/reportes/page.tsx`** — calcular `hasCoordinator` con:

```ts
const hasCoordinator = (all ?? []).some(a =>
  ['nox', 'niva'].includes((a.features as any)?.meerkat_role_id ?? '')
);
```

Pasar como prop.

**4.4 Sidebar badge en `oficina/layout.tsx`** — nuevo count query:

```ts
const { count: unreadCheckins } = await supabase
  .from('heartbeat_runs')
  .select('id', { count: 'exact', head: true })
  .eq('portal_email', portalEmail)
  .is('read_at', null)
  .gte('ran_at', new Date(Date.now() - 30 * 86400_000).toISOString());
```

Pasar `unreadCheckins` a `OficinaSidebar`. Badge junto al item "Reportes" (patrón idéntico al badge de "Bandeja"). Si `> 99`, mostrar "99+".

**4.5 Sub-usuario guard** — el existing check en `page.tsx` línea 18 (`if (session?.isSubUser && !session.modules.includes('of_reportes')) redirect(...)`) sigue funcionando sin cambios. El badge del sidebar se calcula server-side después del session guard; sub-users sin acceso a Reportes verán 0.

### 5. Chip de agente en cards de checkin

El row tiene `agent_id`. Para renderizar el nombre (Nox / Niva), el UI necesita el `meerkat_role_id`. Se pasa como prop `agents` desde `page.tsx` (patrón bandeja sesión 54):

```ts
const agents = (all ?? []).map((a: any) => ({
  id:                   a.id,
  business_name:        a.business_name,
  meerkat_role_id:      (a.features as any)?.meerkat_role_id ?? null,
}));
```

Chip renderiza con color del meerkat (via `MEERKAT_MAP`).

## Constraints técnicos

- Spanish, sin em-dashes (`—`). Usar `:` `,` `.`
- Sin emojis. Íconos Lucide: `Copy`, `CheckCircle2`, `Inbox` (si aplica), `ChevronDown`, `ChevronUp`.
- Sin "IA" en copy visible. Labels: "Check-ins de tus coordinadores", "Sin leer", "Copiar", "Hace 2h".
- `./node_modules/.bin/tsc --noEmit` limpio.
- Sin nuevas dependencias (`marked` ya disponible por sesión 50).
- Skill obligatoria: `centinelia-portal-security` (IDOR guard en 2 endpoints).

## Riesgos y mitigaciones

1. **Race entre email fail y insert.** Insert va después de sendEmail sin await. Si email falla silenciosamente pero markdown existe, aparece en el UI aunque Nazre no lo recibió. Aceptable: el UI ahora es fuente de verdad, correo es notificación. Documentado.

2. **Backfill inexistente.** Los check-ins pasados no están en DB. Pestaña arranca vacía la primera semana. Aceptable, sin backfill.

3. **Sub-usuarios sin acceso a Reportes.** Guard existente redirige. Badge del sidebar respeta el guard porque se calcula después del session check.

4. **Migración manual en Supabase.** Correr `migrations/20260731_heartbeat_runs.sql` en producción antes del deploy del cron+UI.

5. **Chip de agente vs data.** Mapeo `agent_id → meerkat_role_id` requiere `agents` prop. Sin este mapping, el chip caería a `agent.business_name` (no aporta info útil).

6. **Rollback seguro.** Drop de la tabla no afecta al cron (sigue enviando email). Solo la sección UI queda vacía / se esconde por `hasCoordinator=false` cuando no hay data.

## Métricas de éxito

Cualitativas (Nazre revisa en vivo):
- Después del primer check-in de Nox o Niva desde el deploy, aparece en la pestaña Reportes.
- Badge del sidebar muestra "1" hasta que Nazre da click.
- Copiar el markdown funciona con toast de confirmación.
- Pestaña sigue funcionando idéntica para portales sin coordinator (Nia/Sofía only).

Cuantitativas:
- 1 nueva tabla + 2 endpoints + 1 componente + 3 modificaciones de archivos existentes.
- 0 cambios a `ops_report_runs` / `ops_reports`.
- 0 cambios al flow de envío por email.

## Ver también

- [[decisions-centinelia-session54-bandeja-redesign]] — patrón de subdirectorio y agents prop
- Commit `4ae06ed` — fix del copy engañoso (precondición de este spec)
- Skill `centinelia-portal-security` — IDOR pattern
