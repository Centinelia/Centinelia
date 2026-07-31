# Feature flags con rollout gradual - Diseño

**Fecha:** 2026-07-31
**Pilar del evolution framework:** 3 de 5
**Contexto:** Pilar 1 (versioning) LIVE desde sesión 47. Pilar 4 (golden tests) LIVE desde sesión 48. Este spec cubre pilar 3, que se apoya en ambos. Pilar 5 (observabilidad segmentada) queda para después con datos generados por este.

## Objetivo

Sacar cualquier cambio de comportamiento (nueva versión de meerkat, feature de portal, nueva tool, cambio silencioso de lógica) a un porcentaje de clientes antes que a todos, con kill switch instantáneo, sin necesidad de deploy. La unidad de rollout es la organización (`portal_email`).

## Decisiones de brainstorm

1. **Tipos de flags en scope:** los 4 - versiones de meerkat, features de portal/UI, tools nuevas del agente, cambios silenciosos de comportamiento.
2. **Unidad de rollout:** per-org (`portal_email` en la tabla `organizations`). Toda la cuenta ve la misma decisión para un flag dado; sub-usuarios no divergen.
3. **Mecanismo:** `killed` (hard off, gana sobre todo) → `denylist` → `allowlist` → hash determinístico contra `rollout_pct`.
4. **Storage:** tabla nueva `feature_flags` como registro central. `voice_agents.features` JSONB actual se mantiene sin cambio - es un concepto distinto (config opt-in per-agent), no rollout.
5. **Interacción con versioning:** activar una versión de meerkat crea un flag `meerkat.<id>.v<n>` con % inicial en vez de `is_active=true`. El resolver de versión consulta flags primero; `pinned_meerkat_version` sigue siendo override manual per-agent; `is_active` queda como fallback legacy.

## Schema

Migration `migrations/20260731_feature_flags.sql` (idempotente).

```sql
CREATE TABLE feature_flags (
  flag_key       TEXT PRIMARY KEY,
  description    TEXT NOT NULL,
  rollout_pct    INT  NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  allowlist      TEXT[] NOT NULL DEFAULT '{}',
  denylist       TEXT[] NOT NULL DEFAULT '{}',
  killed         BOOLEAN NOT NULL DEFAULT FALSE,
  default_on     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT
);

CREATE TABLE feature_flag_audit (
  id          BIGSERIAL PRIMARY KEY,
  flag_key    TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL, -- 'created' | 'updated' | 'killed' | 'unkilled' | 'deleted'
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flag_audit_key_time ON feature_flag_audit(flag_key, created_at DESC);

CREATE TABLE feature_flag_daily_snapshots (
  flag_key TEXT NOT NULL,
  day      DATE NOT NULL,
  counts   JSONB NOT NULL,
  PRIMARY KEY (flag_key, day)
);
```

### Convención de `flag_key`

Formato `<scope>.<subject>.<variant>`:

- `meerkat.<id>.v<n>` - rollout de versión de meerkat (integración pilar 1)
- `portal.<feature>` - UI o funcionalidad de portal/oficina
- `tool.<name>` - nueva herramienta del agente
- `silent.<what>` - cambio de comportamiento no visible para el cliente

## Evaluator

Archivo nuevo: `src/lib/feature-flags/evaluator.ts`.

```ts
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

type FlagRow = {
  flag_key: string;
  rollout_pct: number;
  allowlist: string[];
  denylist: string[];
  killed: boolean;
  default_on: boolean;
};

let cache: { rows: Map<string, FlagRow>; loadedAt: number } | null = null;
const TTL_MS = 30_000;

async function loadAll(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rows;
  const { data } = await supabaseAdmin.from('feature_flags').select('*');
  const rows = new Map((data ?? []).map(r => [r.flag_key, r as FlagRow]));
  cache = { rows, loadedAt: Date.now() };
  return rows;
}

export function invalidateFlagCache() { cache = null; }

export async function isFeatureEnabled(
  flagKey: string,
  orgEmail: string | null | undefined,
): Promise<boolean> {
  const rows = await loadAll();
  const flag = rows.get(flagKey);
  if (!flag) return false;
  if (flag.killed) return false;
  if (!orgEmail) return flag.default_on;
  if (flag.denylist.includes(orgEmail)) return false;
  if (flag.allowlist.includes(orgEmail)) return true;
  const bucket = hashBucket(orgEmail, flagKey);
  return bucket < flag.rollout_pct;
}

function hashBucket(orgEmail: string, flagKey: string): number {
  const h = createHash('sha256').update(`${orgEmail}::${flagKey}`).digest();
  const n = h.readUInt32BE(0);
  return n % 100;
}
```

### Propiedades garantizadas

- **Determinismo por (org, flag):** subir `rollout_pct` de 10 a 20 nunca saca a un org que ya estaba on; solo agrega más. Bajar sí puede sacar.
- **Precedencia:** `killed` > `denylist` > `allowlist` > hash. `killed` gana incluso sobre allowlist (por diseño: es el botón de pánico).
- **Cache 30s:** cambios del admin se propagan en ≤30s sin restart. `invalidateFlagCache()` disponible para tests y para "flush ahora" desde admin.
- **Sin org email:** flag `default_on=true` decide para webhooks o crons anónimos. La mayoría de flujos resuelven org antes de consultar.

## Integración con pilar 1 (versioning)

### Cambio en `POST /api/admin/versiones/[meerkat]/activate`

Hoy: marca `is_active=true` para la nueva versión y `false` para el resto.

Después:

```ts
const verdict = computeGateVerdict(...); // ya existe, viene de pilar 4
if (verdict === 'fail' && !overrideReason) throw new Error('gate blocked');

const rolloutPct = body.initial_pct ?? 10;
const allowlist  = body.allowlist   ?? [];

const actor = 'admin'; // superficie hoy: cookie ADMIN_SECRET (sesión 48). Cuando exista concepto de admin_email, se propaga acá.

await supabaseAdmin.from('feature_flags').upsert({
  flag_key: `meerkat.${meerkatId}.v${targetVersion}`,
  description: `Rollout v${targetVersion} de ${meerkatId}`,
  rollout_pct: rolloutPct,
  allowlist,
  updated_by: actor,
}, { onConflict: 'flag_key' });

// Helper compartido `src/lib/feature-flags/audit.ts`: lee fila anterior, escribe la nueva, inserta en feature_flag_audit.
await writeFlagAudit({ flag_key, actor, action: 'created', before: null, after: newRow });
invalidateFlagCache();
```

**No se toca `meerkat_versions.is_active`.** La "versión activa" ya no es global; es una decisión per-org resuelta por flags.

### Cambio en resolver de versión

Actual (aproximado): consulta `pinned_meerkat_version` en el agente, si null usa `is_active=true` de `meerkat_versions`.

Nuevo:

```ts
async function resolveMeerkatVersion(meerkatId, agent): Promise<number> {
  if (agent.pinned_meerkat_version != null) return agent.pinned_meerkat_version;

  const versions = await getVersionsDesc(meerkatId); // [3, 2, 1]
  for (const v of versions) {
    if (await isFeatureEnabled(`meerkat.${meerkatId}.v${v}`, agent.portal_email)) {
      return v;
    }
  }

  // Fallback legacy: última versión con is_active=true
  const legacyActive = await getLegacyActiveVersion(meerkatId);
  if (legacyActive != null) return legacyActive;

  // Último fallback: versión más vieja publicada
  return versions[versions.length - 1];
}
```

### Modal `ActivateVersionModal`

Añadir dos campos al form:

- **`initial_pct`** - slider 0–100, default 10.
- **`allowlist`** - textarea multilinea de portal_emails, default `[]` (opcional). Ejemplo pre-llenado con `nazre@gmail.com` para dogfooding.

El resto (gate verdict, override_reason obligatorio en fail) queda igual.

## Uso en los otros 3 tipos de flags

### Portal / UI (`portal.*`)

Server component resuelve, pasa la decisión ya evaluada al cliente:

```tsx
const email = await resolvePortalEmail(token);
const newDashboard = await isFeatureEnabled('portal.new_dashboard', email);
return newDashboard ? <DashboardV2 /> : <DashboardV1 />;
```

**Regla:** no hay hook cliente. Todas las decisiones se toman en server components o server actions. Evita split-brain con SSR y evita exponer la tabla al browser.

### Tools del agente (`tool.*`)

En el ensamblado de tools por canal, filtrar por `flag_key` opcional en la definición:

```ts
type ToolDef = { name: string; flag_key?: string; handler: ...; ... };

async function filterByFlags(tools: ToolDef[], email: string): Promise<ToolDef[]> {
  const results = await Promise.all(tools.map(async t => ({
    tool: t,
    keep: !t.flag_key || await isFeatureEnabled(t.flag_key, email),
  })));
  return results.filter(r => r.keep).map(r => r.tool);
}
```

Aplicado en `buildTools()` para voz, en `agent-chat` para chat, y en `inbox-processor` para correo. Sin `flag_key` en la definición → siempre on (comportamiento actual).

**Interacción con la regla [[feedback_3channel_tools]]:** al declarar el mismo `flag_key` en las 3 registraciones del tool, se prende y apaga en los 3 canales atómicamente. Impide el bug histórico de "funciona en voz pero no en chat".

### Cambios silenciosos (`silent.*`)

Se usa como toggle de rama en el código:

```ts
const useNewEndpointing = await isFeatureEnabled('silent.endpointing_v2', agent.portal_email);
const cfg = useNewEndpointing ? ENDPOINTING_V2 : ENDPOINTING_V1;
```

La rama vieja convive con la nueva hasta que el flag esté a 100% y aguante un soak time. Cleanup en commit separado.

## Admin UI

### Ruta `/admin/flags` (lista)

Header: título + botón `[+ Nuevo flag]`.
Filtros: chips por prefijo (`meerkat`, `portal`, `tool`, `silent`) + toggle "solo killed" + buscador de texto.
Tabla: `flag_key` | `rollout_pct` | count allowlist | count denylist | badge Killed | updated_at relativo.

### Ruta `/admin/flags/[key]` (detalle + edit)

- Header: `flag_key` (no editable) + `description` (editable) + botones `[Kill]` / `[Un-kill]` / `[Delete]`.
- Slider `rollout_pct` 0–100, paso 5, con preview "~X orgs".
- Textarea `allowlist` (un email por línea, validación de formato).
- Textarea `denylist` (idem).
- Checkbox `default_on`.
- Gráfico línea de `orgs_on` últimos 30 días (usa `feature_flag_daily_snapshots`).
- Tabla `feature_flag_audit` últimas 20 filas.
- Botón `[Guardar]` → `PATCH /api/admin/flags/[key]` + invalida cache.

### Rutas API

```
GET    /api/admin/flags               → lista
GET    /api/admin/flags/[key]         → detalle + audit
POST   /api/admin/flags               → crear
PATCH  /api/admin/flags/[key]         → editar (escribe fila en audit)
DELETE /api/admin/flags/[key]         → borrar (audit action='deleted')
POST   /api/admin/flags/[key]/kill    → shortcut kill switch
POST   /api/admin/flags/[key]/preview → dry-run: devuelve lista de orgs que quedarían on/off
```

Todas gated por cookie `Centinelia_admin` con `ADMIN_SECRET` comparado con `crypto.timingSafeEqual` (mismo patrón que sesión 48). Todas invalidan cache tras escritura.

### Entry en `AdminNav`

Ícono `Flag` de Lucide, entrada "Feature flags" junto a "Golden tests" y "Versiones". Tema-aware (light + dark) desde el inicio, mismo patrón que `admin/versiones/health`.

## Observabilidad

**No** loggear cada evaluación (miles/día por org × decenas de flags = ruido inútil). En cambio:

1. **Snapshot diario** - cron `POST /api/cron/flags-snapshot` (1x día a las 4am UTC-6). Para cada flag calcula `{ orgs_on, orgs_off, orgs_via_hash, orgs_via_allowlist, orgs_via_denylist }` y escribe en `feature_flag_daily_snapshots`. Cap de orgs iterables por invocación: sin cap por ahora - con ~100 orgs y ~50 flags = 5000 evaluaciones/cron, trivial.
2. **Chart en `/admin/flags/[key]`** - línea temporal de `orgs_on` últimos 30 días.
3. **Extensión a `/admin/versiones/health`** - cuando existe `meerkat.<id>.v<n>`, mostrar KPIs (CES, sin_intervención, tasa_autónoma) segmentados por cohorte on/off del flag. Puente hacia pilar 5.

### `vercel.json`

```json
{ "path": "/api/cron/flags-snapshot", "schedule": "0 10 * * *" }
```

(4am America/Monterrey = 10 UTC.)

## Migration path

- **`voice_agents.features` JSONB** - sin cambio. Sigue siendo config opt-in per-agent del cliente. Distinto concepto (no es rollout gradual).
- **`pinned_meerkat_version`** - sin cambio. Sigue como override manual per-agent que gana sobre flags.
- **`meerkat_versions.is_active`** - sin cambio. Actúa como fallback legacy cuando el resolver no encuentra ningún flag `meerkat.<id>.v<n>` para el meerkat. Esto significa que deployar este spec sin crear ningún flag no altera comportamiento actual.
- **Rollout del sistema:** deploy silencioso (todo off por ausencia de flags). Primer uso real será cuando se active la próxima versión de un meerkat - ese activate creará el primer flag.

## Follow-ups fuera de scope

1. **Pilar 5** - dashboards con slices por flag. Los snapshots diarios son la semilla.
2. **Portal-visible opt-in** - dejar que dueños prendan/apaguen flags `portal.*` desde `/portal/[token]/configurar`. Requiere concepto de "flags visibles al cliente" en la tabla.
3. **Auto-promotion** - flag al 100% + 7 días sin killed → cron opcional que lo promueve a `is_active` y borra el flag. Nice-to-have.
4. **Testing infra** - helper `__setFlagForTesting(flagKey, value)` que setea la cache directamente. Trivial.
5. **Denylist con razón** - actualmente `denylist` es array plano. Agregar `denylist_reasons TEXT[]` alineado por índice si se necesita justificar cada exclusión.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cache 30s causa split-brain en un flag recién actualizado | `invalidateFlagCache()` desde las rutas admin tras escritura; TTL es techo pesimista |
| `denylist` mal escrita saca al cliente equivocado | Endpoint `/preview` para dry-run antes de guardar |
| Kill switch olvidado prende un flag que ya no funciona | `feature_flag_audit` registra `killed` con timestamp; chart de daily snapshots muestra ceros |
| Rollout parcial rompe interacción entre v_old y v_new de una tool | Convención: nunca cambiar el schema de una tool en vivo - nueva tool = nuevo nombre + nuevo flag |
| Deploy silencioso oculta bug en el resolver | Test unitario del resolver que verifica fallback legacy con 0 flags |

## Archivos afectados

| Componente | Archivo |
|---|---|
| Migration | `migrations/20260731_feature_flags.sql` (nuevo) |
| Evaluator | `src/lib/feature-flags/evaluator.ts` (nuevo) |
| Audit helper | `src/lib/feature-flags/audit.ts` (nuevo) |
| Version resolver | `src/lib/vapi/meerkat-configs.ts` (mod.) |
| Tools filter | `src/lib/tools/build-tools.ts` (mod. - o donde se ensamblen tools por canal) |
| Activate route | `src/app/api/admin/versiones/[meerkat]/activate/route.ts` (mod.) |
| Activate modal | `src/app/admin/versiones/**` (mod.) |
| Admin flags UI | `src/app/admin/flags/**` (nuevo) |
| Admin flags API | `src/app/api/admin/flags/**` (nuevo) |
| Snapshot cron | `src/app/api/cron/flags-snapshot/route.ts` (nuevo) + `vercel.json` |
| Health page ext. | `src/app/admin/versiones/health/page.tsx` (mod.) |
| AdminNav entry | (mod. - donde vive el nav del admin) |

## Referencias

- [[decisions_centinelia_session47]] - pilar 1 versioning
- [[decisions_centinelia_session48]] - pilar 4 golden tests
- [[project_centinelia_evolution_framework]] - roadmap 5 pilares
- [[feedback_3channel_tools]] - regla de tools en 3 canales
- [[feedback_no_em_dash]] - copy sin em-dash
