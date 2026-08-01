# Sistema genérico de trámites externos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la infra reusable para integrar a Centinelia con APIs externas de captura de datos (gobierno, empresas), con la primera implementación para el pre-registro de útiles escolares del Municipio de Monterrey 2026.

**Architecture:** Tabla catálogo `external_tramites` per-org define endpoints, schema de campos, catálogos y auth. Tres tools genéricas (`consultar_catalogo_externo`, `buscar_en_padron_externo`, `enviar_tramite_externo`) registradas en voz + chat + correo. Prompt injection dinámico per-org describe cada trámite activo al LLM. Secrets encriptados vía Supabase Vault. Idempotencia por hash. Escalación a `pedir_a_humano` en fallas de schema/5xx/timeout.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL + Vault), Anthropic Claude SDK, Vapi (voz), SendGrid (correo entrante), Playwright (único test runner del repo).

## Global Constraints

- **Framework:** Next.js 16 — la app usa `proxy.ts`, NO `middleware.ts` (breaking change ya migrado; ver AGENTS.md)
- **3-channel parity obligatoria:** toda tool nueva debe estar en Voz (route.ts en `src/app/api/voice/tools/`) + Chat (branch en `src/lib/tools/executor.ts` invocado desde `agent-chat/route.ts`) + Correo (misma branch invocada desde `inbox-processor.ts`). Regla de memoria: `feedback_3channel_tools`.
- **Copy en español mexicano:** todo texto visible al ciudadano o al agente en español. Sin em dashes (`—`). Sin emojis en UI (solo iconos Lucide React). Sin "IA" en copy visible; sí puede en prompts internos.
- **Dev bypass en proxy.ts:** no romper el bypass `NODE_ENV=development`.
- **Autenticación Vapi:** todas las voice tool routes DEBEN usar `requireVapiAuth(req)` al inicio.
- **Vapi POST parsing:** el body llega como `body.message.toolCallList[0].function.arguments` (puede ser string o objeto). El código de referencia está en `src/app/api/voice/tools/registrar-encuesta/route.ts:22-25`.
- **Vapi response format:** `{ results: [{ toolCallId, result: string }] }`. NO `{ result: ... }` a secas.
- **Naming de tools:** `snake_case` en el nombre expuesto al LLM. Prefijo `snake_case` con guion bajo en JSON, guiones en URLs (`enviar_tramite_externo` en LLM, ruta `/api/voice/tools/enviar-tramite-externo/route.ts`).
- **Executor pattern:** `src/lib/tools/executor.ts` es una cadena `if (toolName === '...')` — cada tool nueva es un branch más. No refactorizar la estructura, solo agregar branches.
- **IDOR:** siempre resolver `agent_id` desde el contexto autenticado, nunca confiar en un `org_id` que venga del LLM. Al ejecutar cualquier tool con `tramite_id`, validar que el trámite pertenezca a la org del agente.
- **Secrets:** nunca serializar `auth_config` con secret resuelto. Resolver en runtime del backend justo antes de la llamada HTTP. Nunca loggear el secret.
- **Idempotencia:** hash canónico `sha256(tramite_id + valores_de_campos_de_unicidad_ordenados + fecha_YYYYMMDD)`. UNIQUE constraint en `external_tramites_submissions(tramite_id, idempotency_hash)`.
- **Sin tests unitarios:** el repo NO usa vitest/jest. Verificación por: (1) `npm run build`, (2) `npm run lint`, (3) golden tests para flujos con agente, (4) manual smoke en dev con `EXTERNAL_TRAMITES_MOCK_MODE=true`.
- **Commits frecuentes:** un commit por task. Mensaje formato `<tipo>(tramites): <resumen>`. Co-Author trailer con `Claude Opus 4.7 (1M context)`.

## File Structure

**Backend nuevo (`src/lib/tramites/`):**
- `types.ts` — tipos TS para JSONB (Campo, Catalogo, Lookup, SubmitConfig, AuthConfig, ReglasNegocio, Tramite)
- `config.ts` — `getActiveTramitesForOrg(orgId, supabase)`, `getTramiteById(id, orgId, supabase)`, validador de shape
- `secrets.ts` — `resolveSecret(vaultSecretId, supabase)` (usa pgsodium via RPC)
- `client.ts` — `callTramiteEndpoint(tramite, path, opts)`: auth injection, timeout 10s, 1 reintento con backoff en 5xx/timeout
- `mock.ts` — `loadFixture(slug, type, name)` para modo mock (env `EXTERNAL_TRAMITES_MOCK_MODE=true`)
- `prompt.ts` — `renderTramitesSection(tramites)` genera markdown para inyectar al system prompt
- `capture-protocol.ts` — texto del protocolo de captura crítica CURP/email/teléfono
- `submit.ts` — `submitTramite(tramite, campos, ctx)`: valida requeridos, calcula idempotency hash, verifica duplicado, POST, guarda row en submissions
- `catalog.ts` — `fetchCatalogo(tramite, catalogoKey, filtros, ctx)`: GET al endpoint, mapeo de response_items_path y item_fields, truncado a 20
- `lookup.ts` — `fetchLookup(tramite, lookupKey, valor, ctx)`: GET al padrón, mapeo de response_fields
- `idempotency.ts` — `buildIdempotencyHash(tramiteId, campos, reglas)`

**Voice routes nuevas (`src/app/api/voice/tools/`):**
- `consultar-catalogo-externo/route.ts`
- `buscar-en-padron-externo/route.ts`
- `enviar-tramite-externo/route.ts`

**Executor (`src/lib/tools/executor.ts`):**
- 3 branches nuevas al final del if/else chain

**Prompt builder (`src/lib/voice/prompt-builder.ts`):**
- Nuevo bloque que llama `renderTramitesSection` y appendea a `blocks: string[]`

**Golden tests (`src/lib/golden-tests/scenarios/nia/`):**
- `tramite-utiles-happy.ts`
- `tramite-utiles-curp-mal-dictado.ts`
- `tramite-utiles-padron-miss.ts`
- `tramite-utiles-max-registros.ts`
- `tramite-utiles-endpoint-5xx.ts`
- Modificar `src/lib/golden-tests/scenarios/nia.ts` para exportar los 5 nuevos escenarios (verificar patrón contra `scenarios/niva.ts:1-10`)

**SQL / migraciones:**
- `supabase/external-tramites.sql` — DDL de las 4 tablas + indexes + trigger updated_at

**Fixtures:**
- `fixtures/tramites/mty-utiles-2026/catalogos/{sedes,escuelas,grados,municipios,colonias,parentescos}.json`
- `fixtures/tramites/mty-utiles-2026/lookups/{padron_estudiante_hit,padron_estudiante_miss,padron_adulto_hit,padron_adulto_miss}.json`
- `fixtures/tramites/mty-utiles-2026/submit/{success,validation_error,server_error}.json`

**Scripts:**
- `scripts/tramites/seed-mty-utiles.ts` — inserta row `activo=false` con placeholders (endpoint real pendiente)
- `scripts/tramites/README.md` — instrucciones para insertar secret al Vault

---

### Task 1: Migración SQL de las 4 tablas nuevas

**Files:**
- Create: `supabase/external-tramites.sql`

**Interfaces:**
- Consumes: nada
- Produces: 4 tablas (`external_tramites`, `external_secrets`, `external_tramites_audit`, `external_tramites_submissions`) que las siguientes tasks van a consultar

- [ ] **Step 1: Escribir el SQL de migración**

Crear `supabase/external-tramites.sql`:

```sql
-- external_tramites: catálogo de trámites externos configurables per-org
CREATE TABLE IF NOT EXISTS external_tramites (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug                   text NOT NULL,
  nombre_publico         text NOT NULL,
  descripcion_agente     text NOT NULL,
  activo                 boolean NOT NULL DEFAULT true,
  schema_version         integer NOT NULL DEFAULT 1,
  endpoint_base          text NOT NULL,
  auth_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  campos                 jsonb NOT NULL,
  catalogos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  lookups                jsonb NOT NULL DEFAULT '[]'::jsonb,
  submit                 jsonb NOT NULL,
  reglas_negocio         jsonb NOT NULL DEFAULT '{}'::jsonb,
  aviso_privacidad_texto text,
  aviso_privacidad_url   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_external_tramites_org_active
  ON external_tramites(org_id, activo);

-- external_secrets: referencia a secrets encriptados en Supabase Vault
CREATE TABLE IF NOT EXISTS external_secrets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  vault_secret_id uuid NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz,
  UNIQUE (org_id, key)
);

-- external_tramites_audit: log de cambios al schema del trámite
CREATE TABLE IF NOT EXISTS external_tramites_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id   uuid NOT NULL REFERENCES external_tramites(id) ON DELETE CASCADE,
  changed_by   text,
  change_type  text NOT NULL,
  before_json  jsonb,
  after_json   jsonb,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_tramites_audit_tramite
  ON external_tramites_audit(tramite_id, changed_at DESC);

-- external_tramites_submissions: log de todos los envíos + idempotencia
CREATE TABLE IF NOT EXISTS external_tramites_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id         uuid NOT NULL REFERENCES external_tramites(id),
  org_id             uuid NOT NULL REFERENCES organizations(id),
  agent_id           uuid REFERENCES voice_agents(id),
  call_id            uuid,
  channel            text NOT NULL,
  idempotency_hash   text NOT NULL,
  payload            jsonb NOT NULL,
  response_status    integer,
  response_body      jsonb,
  folio              text,
  status             text NOT NULL,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tramite_id, idempotency_hash)
);

CREATE INDEX IF NOT EXISTS idx_ext_submissions_tramite_created
  ON external_tramites_submissions(tramite_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ext_submissions_status
  ON external_tramites_submissions(status);

-- Trigger para actualizar updated_at en external_tramites
CREATE OR REPLACE FUNCTION touch_external_tramites_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_tramites_updated_at ON external_tramites;
CREATE TRIGGER trg_external_tramites_updated_at
  BEFORE UPDATE ON external_tramites
  FOR EACH ROW EXECUTE FUNCTION touch_external_tramites_updated_at();

-- Trigger para audit automático de cambios en external_tramites
CREATE OR REPLACE FUNCTION audit_external_tramites_changes()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.campos IS DISTINCT FROM NEW.campos OR
    OLD.catalogos IS DISTINCT FROM NEW.catalogos OR
    OLD.lookups IS DISTINCT FROM NEW.lookups OR
    OLD.submit IS DISTINCT FROM NEW.submit OR
    OLD.reglas_negocio IS DISTINCT FROM NEW.reglas_negocio
  ) THEN
    INSERT INTO external_tramites_audit (tramite_id, change_type, before_json, after_json)
    VALUES (
      NEW.id,
      'schema_update',
      jsonb_build_object('campos', OLD.campos, 'catalogos', OLD.catalogos, 'lookups', OLD.lookups, 'submit', OLD.submit, 'reglas_negocio', OLD.reglas_negocio),
      jsonb_build_object('campos', NEW.campos, 'catalogos', NEW.catalogos, 'lookups', NEW.lookups, 'submit', NEW.submit, 'reglas_negocio', NEW.reglas_negocio)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_tramites_audit ON external_tramites;
CREATE TRIGGER trg_external_tramites_audit
  AFTER UPDATE ON external_tramites
  FOR EACH ROW EXECUTE FUNCTION audit_external_tramites_changes();
```

- [ ] **Step 2: Correr la migración en Supabase local o preview**

Abrir el SQL editor de Supabase (o local con `supabase db reset`), pegar el contenido de `supabase/external-tramites.sql`, ejecutar. Esperado: 4 tablas creadas, 2 triggers activos, sin errores.

- [ ] **Step 3: Verificar shape con query manual**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'external_%' ORDER BY table_name;
-- Esperado: 4 filas (external_secrets, external_tramites, external_tramites_audit, external_tramites_submissions)

INSERT INTO external_tramites (org_id, slug, nombre_publico, descripcion_agente, endpoint_base, campos, submit)
SELECT id, 'test-tramite', 'Test', 'test', 'https://test.local', '[]'::jsonb, '{}'::jsonb
FROM organizations LIMIT 1;
-- Debe insertar 1 row. Verificar updated_at = created_at.

UPDATE external_tramites SET campos = '[{"key":"foo"}]'::jsonb WHERE slug = 'test-tramite';
SELECT COUNT(*) FROM external_tramites_audit;
-- Debe ser 1 (el trigger disparó).

DELETE FROM external_tramites WHERE slug = 'test-tramite';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/external-tramites.sql
git commit -m "$(cat <<'EOF'
feat(tramites): DDL de external_tramites + tablas relacionadas

4 tablas nuevas para el sistema generico de tramites externos: catalogo
per-org (external_tramites), referencia a Supabase Vault (external_secrets),
log de cambios de schema (external_tramites_audit) y log de envios con
idempotencia UNIQUE (external_tramites_submissions). Trigger de updated_at
y trigger de audit automatico ante cambios de schema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tipos TS y helpers de configuración

**Files:**
- Create: `src/lib/tramites/types.ts`
- Create: `src/lib/tramites/config.ts`

**Interfaces:**
- Consumes: tablas de Task 1
- Produces:
  - Types exportados: `Tramite`, `Campo`, `Catalogo`, `Lookup`, `SubmitConfig`, `AuthConfig`, `ReglasNegocio`
  - `getActiveTramitesForOrg(orgId: string, supabase: SupabaseClient): Promise<Tramite[]>`
  - `getTramiteById(id: string, orgId: string, supabase: SupabaseClient): Promise<Tramite | null>` — retorna null si no existe o si no pertenece a la org (defensa IDOR)

- [ ] **Step 1: Crear `src/lib/tramites/types.ts`**

```typescript
export type CampoTipo =
  | 'string' | 'curp' | 'cp' | 'email' | 'telefono_mx' | 'fecha'
  | 'catalogo_pick' | 'catalogo_search' | 'consentimiento';

export interface Campo {
  key:               string;
  tipo:              CampoTipo;
  required:          boolean;
  orden:             number;
  catalogo?:         string;
  autocompleta_desde?: string;
  source?:           string;
  depende_de?:       string;
  prompt_captura?:   string;
}

export interface CatalogoItemFields {
  id:    string;
  label: string;
  extra?: string[];
}

export interface Catalogo {
  key:                  string;
  endpoint:             string;
  method:               'GET' | 'POST';
  query_param?:         string;
  min_query_length?:    number;
  response_items_path?: string;
  item_fields:          CatalogoItemFields;
}

export interface Lookup {
  key:               string;
  endpoint:          string;
  method:            'GET' | 'POST';
  query_param:       string;
  response_fields:   Record<string, string>;
  not_found_action:  'reject' | 'continue_manual';
}

export interface SubmitConfig {
  endpoint:                string;
  method:                  'POST' | 'PUT';
  response_folio_path:     string;
  response_success_status: number[];
}

export interface AuthConfig {
  type:        'bearer' | 'api_key_header' | 'oauth_client_credentials' | 'none';
  secret_key?: string;
  header_name?: string;
  token_endpoint?: string;
}

export interface ReglasNegocio {
  allow_manual_capture_on_padron_miss?: boolean;
  max_registros_por_sesion?:            number;
  ventana_atencion?:                    { desde: string; hasta: string; tz: string };
  idempotency_fields?:                  string[];
}

export interface Tramite {
  id:                     string;
  org_id:                 string;
  slug:                   string;
  nombre_publico:         string;
  descripcion_agente:     string;
  activo:                 boolean;
  schema_version:         number;
  endpoint_base:          string;
  auth_config:            AuthConfig;
  campos:                 Campo[];
  catalogos:              Catalogo[];
  lookups:                Lookup[];
  submit:                 SubmitConfig;
  reglas_negocio:         ReglasNegocio;
  aviso_privacidad_texto: string | null;
  aviso_privacidad_url:   string | null;
  created_at:             string;
  updated_at:             string;
}
```

- [ ] **Step 2: Crear `src/lib/tramites/config.ts`**

```typescript
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function getActiveTramitesForOrg(
  orgId: string,
  supabase: SupabaseClient,
): Promise<Tramite[]> {
  const { data, error } = await supabase
    .from('external_tramites')
    .select('*')
    .eq('org_id', orgId)
    .eq('activo', true)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[tramites] getActiveTramitesForOrg', error);
    return [];
  }
  return (data ?? []) as Tramite[];
}

export async function getTramiteById(
  id:       string,
  orgId:    string,
  supabase: SupabaseClient,
): Promise<Tramite | null> {
  const { data } = await supabase
    .from('external_tramites')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)  // defensa IDOR — nunca confiar solo en el id
    .maybeSingle();
  return (data as Tramite | null) ?? null;
}
```

- [ ] **Step 3: Verificar con typecheck y build**

```bash
npm run build 2>&1 | tail -20
```

Esperado: sin errores de TS en `src/lib/tramites/*.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tramites/types.ts src/lib/tramites/config.ts
git commit -m "$(cat <<'EOF'
feat(tramites): tipos TS + helpers de config con guard IDOR

Tipos para campos, catalogos, lookups, submit, auth y reglas de negocio.
getTramiteById filtra siempre por org_id como defensa IDOR: aunque el LLM
alucine un tramite_id de otra org, no se resuelve.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Resolver de secrets vía Supabase Vault

**Files:**
- Create: `src/lib/tramites/secrets.ts`
- Create: `scripts/tramites/README.md`

**Interfaces:**
- Consumes: tabla `external_secrets` (Task 1) + Supabase Vault (pgsodium)
- Produces:
  - `resolveSecretByKey(orgId: string, key: string, supabase: SupabaseClient): Promise<string | null>`

- [ ] **Step 1: Crear `src/lib/tramites/secrets.ts`**

```typescript
import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Resuelve un secret encriptado en Supabase Vault por (org_id, key).
 * Retorna null si no existe o si el vault no lo puede descifrar.
 * NUNCA loggear el retorno de esta función.
 */
export async function resolveSecretByKey(
  orgId:    string,
  key:      string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: secretRow } = await supabase
    .from('external_secrets')
    .select('vault_secret_id')
    .eq('org_id', orgId)
    .eq('key', key)
    .maybeSingle();
  if (!secretRow?.vault_secret_id) return null;

  // Vault: usa la view `vault.decrypted_secrets` con RLS
  const { data: decrypted } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', secretRow.vault_secret_id)
    .maybeSingle();
  return (decrypted?.decrypted_secret as string | undefined) ?? null;
}
```

- [ ] **Step 2: Crear `scripts/tramites/README.md`**

```markdown
# Trámites externos — operación

## Insertar un secret en el Vault

Los secrets (bearer tokens, api keys) NO van en env vars ni en la tabla
`external_secrets` directamente. Se guardan en Supabase Vault:

1. En el SQL editor de Supabase (production o el ambiente relevante):

```sql
-- 1) Insertar el secret en el Vault
SELECT vault.create_secret(
  'EL_VALOR_DEL_SECRET_AQUI',
  'mty_utiles_api_key',
  'Bearer token del API del Municipio de Monterrey para Programa Utiles 2026'
);
-- Anotar el UUID que regresa.

-- 2) Registrar la referencia en external_secrets
INSERT INTO external_secrets (org_id, key, vault_secret_id, description, last_rotated_at)
VALUES (
  '<uuid_de_la_org_del_municipio>',
  'mty_utiles_api_key',
  '<uuid_del_paso_1>',
  'Bearer token API Municipio MTY - Programa Utiles 2026',
  now()
);
```

2. Para rotar: llamar `SELECT vault.update_secret(<uuid>, 'NUEVO_VALOR')` y
   actualizar `last_rotated_at` en `external_secrets`.

3. Nunca hacer `SELECT * FROM vault.decrypted_secrets` en logs, capturas de
   pantalla, o queries que se envíen por correo.
```

- [ ] **Step 3: Smoke test manual con un secret de prueba**

En el SQL editor de Supabase:

```sql
-- Crear un secret de prueba
SELECT vault.create_secret('test_value_123', 'test_key_borrar', 'temporal');

-- Anotar el UUID retornado, insertar en external_secrets asociado a una org de prueba
-- Luego correr desde código:
```

En un scratch file o REPL de Node (opcional), invocar `resolveSecretByKey(orgId, 'test_key_borrar', supabase)` y verificar que retorna `'test_value_123'`. Después limpiar:

```sql
DELETE FROM external_secrets WHERE key = 'test_key_borrar';
SELECT vault.delete_secret('<uuid_del_secret>');
```

- [ ] **Step 4: Verificar build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/tramites/secrets.ts scripts/tramites/README.md
git commit -m "$(cat <<'EOF'
feat(tramites): resolver de secrets via Supabase Vault

resolveSecretByKey lee vault_secret_id de external_secrets y descifra por
la vista vault.decrypted_secrets. Nunca loggear el retorno. Documentacion
de operacion en scripts/tramites/README.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cliente HTTP con auth + retry + modo mock

**Files:**
- Create: `src/lib/tramites/client.ts`
- Create: `src/lib/tramites/mock.ts`

**Interfaces:**
- Consumes: `Tramite`, `AuthConfig` (Task 2), `resolveSecretByKey` (Task 3)
- Produces:
  - `callTramiteEndpoint(tramite: Tramite, path: string, opts: { method: string; body?: unknown; query?: Record<string,string> }, supabase: SupabaseClient): Promise<{ status: number; body: unknown; timedOut: boolean }>`
  - `loadFixture(slug: string, kind: 'catalogos' | 'lookups' | 'submit', name: string): Promise<unknown | null>`
  - Env var: `EXTERNAL_TRAMITES_MOCK_MODE` (true/false)

- [ ] **Step 1: Crear `src/lib/tramites/mock.ts`**

```typescript
import { readFile } from 'fs/promises';
import path from 'path';

export function isMockMode(): boolean {
  return process.env.EXTERNAL_TRAMITES_MOCK_MODE === 'true';
}

export async function loadFixture(
  slug: string,
  kind: 'catalogos' | 'lookups' | 'submit',
  name: string,
): Promise<unknown | null> {
  try {
    const filePath = path.join(process.cwd(), 'fixtures', 'tramites', slug, kind, `${name}.json`);
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Crear `src/lib/tramites/client.ts`**

```typescript
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite, AuthConfig } from './types';
import { resolveSecretByKey } from './secrets';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const TIMEOUT_MS = 10_000;

async function buildAuthHeaders(
  orgId:    string,
  auth:     AuthConfig,
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  if (auth.type === 'none') return {};
  if (auth.type === 'bearer') {
    const token = auth.secret_key ? await resolveSecretByKey(orgId, auth.secret_key, supabase) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  if (auth.type === 'api_key_header') {
    const token = auth.secret_key ? await resolveSecretByKey(orgId, auth.secret_key, supabase) : null;
    if (!token || !auth.header_name) return {};
    return { [auth.header_name]: token };
  }
  // oauth_client_credentials: no implementado en Fase 1
  return {};
}

async function fetchWithTimeout(
  url:  string,
  init: RequestInit,
  ms:   number,
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body, timedOut: false };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { status: 0, body: null, timedOut: true };
    return { status: 0, body: { error: (err as Error).message }, timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Llama a un endpoint del trámite. Aplica auth, timeout 10s, y 1 reintento
 * con backoff exponencial en 5xx / timeout.
 */
export async function callTramiteEndpoint(
  tramite: Tramite,
  pathAndQuery: string,
  opts: { method: 'GET' | 'POST' | 'PUT'; body?: unknown },
  supabase: SupabaseClient,
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const url = tramite.endpoint_base.replace(/\/$/, '') + pathAndQuery;
  const authHeaders = await buildAuthHeaders(tramite.org_id, tramite.auth_config, supabase);
  const init: RequestInit = {
    method: opts.method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  };

  let result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  const shouldRetry = result.timedOut || (result.status >= 500 && result.status < 600);
  if (shouldRetry) {
    await new Promise(r => setTimeout(r, 500));
    result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  }
  return result;
}
```

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tramites/client.ts src/lib/tramites/mock.ts
git commit -m "$(cat <<'EOF'
feat(tramites): cliente HTTP con auth + retry + modo mock

callTramiteEndpoint aplica auth headers segun AuthConfig, timeout 10s con
AbortController, y 1 reintento con backoff 500ms en 5xx/timeout. Modo mock
via env EXTERNAL_TRAMITES_MOCK_MODE lee fixtures desde disco.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Helpers de catálogo, lookup, submit e idempotencia

**Files:**
- Create: `src/lib/tramites/idempotency.ts`
- Create: `src/lib/tramites/catalog.ts`
- Create: `src/lib/tramites/lookup.ts`
- Create: `src/lib/tramites/submit.ts`

**Interfaces:**
- Consumes: `callTramiteEndpoint` (Task 4), `isMockMode`, `loadFixture` (Task 4), tipos de Task 2
- Produces:
  - `buildIdempotencyHash(tramiteId: string, campos: Record<string,unknown>, reglas: ReglasNegocio): string`
  - `fetchCatalogo(tramite, catalogoKey, filtros, supabase): Promise<{ ok: true; items: Array<{id: string; label: string; extra?: Record<string, unknown>}>; truncated: boolean } | { ok: false; error: string }>`
  - `fetchLookup(tramite, lookupKey, valor, supabase): Promise<{ ok: true; found: boolean; data: Record<string, unknown> | null } | { ok: false; error: string }>`
  - `submitTramite(tramite, campos, ctx, supabase): Promise<{ ok: true; folio: string } | { ok: false; error: string; retryField?: string; escalate?: boolean }>`

- [ ] **Step 1: Crear `src/lib/tramites/idempotency.ts`**

```typescript
import { createHash } from 'crypto';
import type { ReglasNegocio } from './types';

export function buildIdempotencyHash(
  tramiteId: string,
  campos:    Record<string, unknown>,
  reglas:    ReglasNegocio,
): string {
  const keys = reglas.idempotency_fields ?? Object.keys(campos).sort();
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const parts: string[] = [tramiteId, fecha];
  for (const k of keys.slice().sort()) {
    const v = campos[k];
    parts.push(`${k}=${typeof v === 'string' ? v : JSON.stringify(v ?? '')}`);
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
```

- [ ] **Step 2: Crear `src/lib/tramites/catalog.ts`**

```typescript
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';
import { callTramiteEndpoint } from './client';
import { isMockMode, loadFixture } from './mock';

type SupabaseClient = ReturnType<typeof createAdminClient>;
const MAX_ITEMS = 20;

function extractItems(body: unknown, path?: string): unknown[] {
  if (!body) return [];
  if (!path) return Array.isArray(body) ? body : [];
  const parts = path.split('.');
  let cur: unknown = body;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = (cur as Record<string, unknown>)[p];
    else return [];
  }
  return Array.isArray(cur) ? cur : [];
}

export async function fetchCatalogo(
  tramite:     Tramite,
  catalogoKey: string,
  filtros:     Record<string, string>,
  supabase:    SupabaseClient,
): Promise<{ ok: true; items: Array<{ id: string; label: string; extra?: Record<string, unknown> }>; truncated: boolean } | { ok: false; error: string }> {
  const cat = tramite.catalogos.find(c => c.key === catalogoKey);
  if (!cat) return { ok: false, error: `Catálogo ${catalogoKey} no configurado.` };

  // Enforce min_query_length si aplica
  if (cat.query_param && cat.min_query_length) {
    const q = filtros[cat.query_param] ?? '';
    if (q.length < cat.min_query_length) {
      return { ok: false, error: `Se requieren al menos ${cat.min_query_length} caracteres para buscar.` };
    }
  }

  let items: unknown[] = [];

  if (isMockMode()) {
    const fixture = await loadFixture(tramite.slug, 'catalogos', catalogoKey);
    items = extractItems(fixture, cat.response_items_path);
  } else {
    // Sustituir path params tipo {escuela_id}
    let endpoint = cat.endpoint;
    for (const [k, v] of Object.entries(filtros)) {
      endpoint = endpoint.replace(`{${k}}`, encodeURIComponent(v));
    }
    // Query string
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (!endpoint.includes(`{${k}}`) && v != null && v !== '') qs.set(k, v);
    }
    const pathAndQuery = qs.toString() ? `${endpoint}?${qs}` : endpoint;
    const res = await callTramiteEndpoint(tramite, pathAndQuery, { method: cat.method }, supabase);
    if (res.timedOut || res.status < 200 || res.status >= 300) {
      return { ok: false, error: `Catálogo respondió con status ${res.status}${res.timedOut ? ' (timeout)' : ''}.` };
    }
    items = extractItems(res.body, cat.response_items_path);
  }

  const truncated = items.length > MAX_ITEMS;
  const capped = items.slice(0, MAX_ITEMS);

  const mapped = capped.map((raw): { id: string; label: string; extra?: Record<string, unknown> } => {
    const r = raw as Record<string, unknown>;
    const extra: Record<string, unknown> = {};
    if (cat.item_fields.extra) {
      for (const f of cat.item_fields.extra) extra[f] = r[f];
    }
    return {
      id:    String(r[cat.item_fields.id] ?? ''),
      label: String(r[cat.item_fields.label] ?? ''),
      ...(Object.keys(extra).length ? { extra } : {}),
    };
  });

  return { ok: true, items: mapped, truncated };
}
```

- [ ] **Step 3: Crear `src/lib/tramites/lookup.ts`**

```typescript
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';
import { callTramiteEndpoint } from './client';
import { isMockMode, loadFixture } from './mock';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function fetchLookup(
  tramite:    Tramite,
  lookupKey:  string,
  valor:      string,
  supabase:   SupabaseClient,
): Promise<{ ok: true; found: boolean; data: Record<string, unknown> | null } | { ok: false; error: string }> {
  const lk = tramite.lookups.find(l => l.key === lookupKey);
  if (!lk) return { ok: false, error: `Lookup ${lookupKey} no configurado.` };

  let raw: unknown = null;
  let status = 200;

  if (isMockMode()) {
    // Convention: {lookupKey}_hit para encontrado, {lookupKey}_miss para no encontrado
    const hit = await loadFixture(tramite.slug, 'lookups', `${lookupKey}_hit`);
    // Selector simple: si el valor termina en '_MISS' devolvemos miss, si no hit
    if (valor.endsWith('_MISS')) {
      raw = await loadFixture(tramite.slug, 'lookups', `${lookupKey}_miss`);
      status = raw ? 404 : 404;
    } else {
      raw = hit;
      status = raw ? 200 : 404;
    }
  } else {
    const qs = new URLSearchParams({ [lk.query_param]: valor });
    const res = await callTramiteEndpoint(tramite, `${lk.endpoint}?${qs}`, { method: lk.method }, supabase);
    if (res.timedOut) return { ok: false, error: 'Timeout consultando padrón.' };
    status = res.status;
    raw = res.body;
  }

  if (status === 404 || !raw) return { ok: true, found: false, data: null };
  if (status < 200 || status >= 300) return { ok: false, error: `Padrón respondió con status ${status}.` };

  const rawObj = raw as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [outputKey, sourcePath] of Object.entries(lk.response_fields)) {
    data[outputKey] = rawObj[sourcePath] ?? null;
  }
  return { ok: true, found: true, data };
}
```

- [ ] **Step 4: Crear `src/lib/tramites/submit.ts`**

```typescript
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite } from './types';
import { callTramiteEndpoint } from './client';
import { isMockMode, loadFixture } from './mock';
import { buildIdempotencyHash } from './idempotency';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface SubmitContext {
  channel:  'voice' | 'chat' | 'email';
  agentId?: string;
  callId?:  string;
}

function readByPath(body: unknown, path: string): unknown {
  if (!body || !path) return null;
  const parts = path.split('.');
  let cur: unknown = body;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = (cur as Record<string, unknown>)[p];
    else return null;
  }
  return cur;
}

export async function submitTramite(
  tramite:  Tramite,
  campos:   Record<string, unknown>,
  ctx:      SubmitContext,
  supabase: SupabaseClient,
): Promise<{ ok: true; folio: string; already_submitted?: boolean } | { ok: false; error: string; retryField?: string; escalate?: boolean }> {
  // Validar requeridos
  const missing: string[] = [];
  for (const c of tramite.campos) {
    if (c.required && (campos[c.key] == null || campos[c.key] === '')) missing.push(c.key);
  }
  if (missing.length > 0) {
    return { ok: false, error: `Faltan campos requeridos: ${missing.join(', ')}`, retryField: missing[0] };
  }

  // Idempotencia — verificar si ya se envió
  const hash = buildIdempotencyHash(tramite.id, campos, tramite.reglas_negocio);
  const { data: existing } = await supabase
    .from('external_tramites_submissions')
    .select('folio, status')
    .eq('tramite_id', tramite.id)
    .eq('idempotency_hash', hash)
    .maybeSingle();
  if (existing?.status === 'success' && existing.folio) {
    return { ok: true, folio: existing.folio, already_submitted: true };
  }

  // POST al endpoint
  let status = 200;
  let respBody: unknown = null;
  let timedOut = false;

  if (isMockMode()) {
    // Convención: si algún campo tiene valor "FAIL_422" devolvemos validation error, si "FAIL_500" server error
    const shouldFail422 = Object.values(campos).some(v => v === 'FAIL_422');
    const shouldFail500 = Object.values(campos).some(v => v === 'FAIL_500');
    if (shouldFail422) {
      respBody = await loadFixture(tramite.slug, 'submit', 'validation_error');
      status = 422;
    } else if (shouldFail500) {
      respBody = await loadFixture(tramite.slug, 'submit', 'server_error');
      status = 500;
    } else {
      respBody = await loadFixture(tramite.slug, 'submit', 'success');
      status = 200;
    }
  } else {
    const res = await callTramiteEndpoint(
      tramite,
      tramite.submit.endpoint,
      { method: tramite.submit.method, body: campos },
      supabase,
    );
    status = res.status;
    respBody = res.body;
    timedOut = res.timedOut;
  }

  const isSuccess = tramite.submit.response_success_status.includes(status);
  const folio = isSuccess ? String(readByPath(respBody, tramite.submit.response_folio_path) ?? '') : null;

  // Registrar el submission
  await supabase.from('external_tramites_submissions').insert({
    tramite_id: tramite.id,
    org_id:     tramite.org_id,
    agent_id:   ctx.agentId ?? null,
    call_id:    ctx.callId ?? null,
    channel:    ctx.channel,
    idempotency_hash: hash,
    payload:    campos,
    response_status: status,
    response_body: respBody,
    folio,
    status:     isSuccess && folio ? 'success'
              : status === 422     ? 'schema_mismatch'
              : timedOut           ? 'timeout'
              : status >= 500      ? 'server_error'
              : 'error',
    error:      isSuccess ? null : `HTTP ${status}${timedOut ? ' (timeout)' : ''}`,
  });

  if (isSuccess && folio) return { ok: true, folio };
  if (status === 422) return { ok: false, error: 'El endpoint reportó un problema con los datos capturados. Escalando a humano.', escalate: true };
  if (timedOut || status >= 500) return { ok: false, error: 'El sistema del cliente no está disponible. Escalando a humano.', escalate: true };
  return { ok: false, error: `Respuesta inesperada (status ${status}). Escalando a humano.`, escalate: true };
}
```

- [ ] **Step 5: Verificar build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/tramites/idempotency.ts src/lib/tramites/catalog.ts src/lib/tramites/lookup.ts src/lib/tramites/submit.ts
git commit -m "$(cat <<'EOF'
feat(tramites): helpers de catalogo, lookup, submit e idempotencia

fetchCatalogo aplica path/query params + response_items_path + truncado a 20.
fetchLookup mapea response_fields y distingue 404 (found=false) de errores.
submitTramite valida requeridos, calcula hash canonico de idempotencia,
verifica duplicado, y registra siempre en submissions. Modo mock lee
fixtures y usa convenciones "FAIL_422"/"FAIL_500" en campos para simular.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fixtures del trámite MTY para modo mock

**Files:**
- Create: `fixtures/tramites/mty-utiles-2026/catalogos/sedes.json`
- Create: `fixtures/tramites/mty-utiles-2026/catalogos/escuelas.json`
- Create: `fixtures/tramites/mty-utiles-2026/catalogos/grados.json`
- Create: `fixtures/tramites/mty-utiles-2026/catalogos/municipios.json`
- Create: `fixtures/tramites/mty-utiles-2026/catalogos/colonias.json`
- Create: `fixtures/tramites/mty-utiles-2026/catalogos/parentescos.json`
- Create: `fixtures/tramites/mty-utiles-2026/lookups/padron_estudiante_hit.json`
- Create: `fixtures/tramites/mty-utiles-2026/lookups/padron_estudiante_miss.json`
- Create: `fixtures/tramites/mty-utiles-2026/lookups/padron_adulto_hit.json`
- Create: `fixtures/tramites/mty-utiles-2026/lookups/padron_adulto_miss.json`
- Create: `fixtures/tramites/mty-utiles-2026/submit/success.json`
- Create: `fixtures/tramites/mty-utiles-2026/submit/validation_error.json`
- Create: `fixtures/tramites/mty-utiles-2026/submit/server_error.json`

**Interfaces:**
- Consumes: convenciones de nomenclatura de Task 5 (`{lookupKey}_hit`, `{lookupKey}_miss`, `success`, `validation_error`, `server_error`)
- Produces: fixtures que los golden tests y el modo dev van a usar

- [ ] **Step 1: Crear fixtures de catálogos**

Cada fixture es un objeto `{ "data": [...] }` para respetar `response_items_path: "data"`. Ejemplos:

`fixtures/tramites/mty-utiles-2026/catalogos/sedes.json`:
```json
{"data": [
  {"id": "sede-001", "nombre": "PLAZA PASEO LA QUINTA", "direccion": "Andador Democracia, Sarabia, Monterrey, NL 64490", "fechas": "Del 10 al 11 de agosto", "horario": "9:00 a 16:00"},
  {"id": "sede-002", "nombre": "PARQUE TUCÁN", "direccion": "Parque Tucán, Monterrey, NL", "fechas": "Del 6 al 7 de agosto", "horario": "9:00 a 16:00"},
  {"id": "sede-003", "nombre": "GIMNASIO MONTERREY 400", "direccion": "Calle las Selvas, Carmen Serdán, Monterrey, NL 64249", "fechas": "Del 3 al 5 de agosto", "horario": "9:00 a 16:00"}
]}
```

`escuelas.json` con 5 escuelas de ejemplo (incluir "11 DE MAYO DE 1988" del screenshot original):
```json
{"data": [
  {"id": "esc-001", "nombre": "11 DE MAYO DE 1988", "turno": "MATUTINO", "nivel": "PRIMARIA"},
  {"id": "esc-002", "nombre": "BENITO JUAREZ", "turno": "VESPERTINO", "nivel": "PRIMARIA"},
  {"id": "esc-003", "nombre": "JOSEFA ORTIZ DE DOMINGUEZ", "turno": "MATUTINO", "nivel": "SECUNDARIA"},
  {"id": "esc-004", "nombre": "MIGUEL HIDALGO", "turno": "MATUTINO", "nivel": "PRIMARIA"},
  {"id": "esc-005", "nombre": "SOR JUANA INES DE LA CRUZ", "turno": "VESPERTINO", "nivel": "SECUNDARIA"}
]}
```

`grados.json`:
```json
{"data": [
  {"id": "grado-1", "nombre": "1RO DE PRIMARIA"},
  {"id": "grado-2", "nombre": "2DO DE PRIMARIA"},
  {"id": "grado-3", "nombre": "3RO DE PRIMARIA"},
  {"id": "grado-4", "nombre": "4TO DE PRIMARIA"},
  {"id": "grado-5", "nombre": "5TO DE PRIMARIA"},
  {"id": "grado-6", "nombre": "6TO DE PRIMARIA"}
]}
```

`municipios.json` (solo MTY + vecinos):
```json
{"data": [
  {"id": "mun-mty", "nombre": "MONTERREY"},
  {"id": "mun-sn",  "nombre": "SAN NICOLAS DE LOS GARZA"},
  {"id": "mun-gpe", "nombre": "GUADALUPE"},
  {"id": "mun-scz", "nombre": "SANTA CATARINA"}
]}
```

`colonias.json` (3-5 ejemplos):
```json
{"data": [
  {"id": "col-001", "nombre": "1 DE MAYO (F-97) - 64220"},
  {"id": "col-002", "nombre": "CARMEN SERDAN - 64249"},
  {"id": "col-003", "nombre": "CENTRO - 64000"}
]}
```

`parentescos.json`:
```json
{"data": [
  {"id": "par-madre", "nombre": "MADRE"},
  {"id": "par-padre", "nombre": "PADRE"},
  {"id": "par-tutor", "nombre": "TUTOR"},
  {"id": "par-abuelo", "nombre": "ABUELO/A"},
  {"id": "par-hermano", "nombre": "HERMANO/A"}
]}
```

- [ ] **Step 2: Crear fixtures de lookups**

`padron_estudiante_hit.json`:
```json
{"nombre": "ERICKA AMAHIRANIE", "apellido_paterno": "MOLINA", "apellido_materno": "ADRIANO", "fecha_nacimiento": "2012-11-21"}
```

`padron_estudiante_miss.json`:
```json
{"error": "not_found"}
```

`padron_adulto_hit.json`:
```json
{"nombre": "MAYRA JANET", "apellido_paterno": "GONZALEZ", "apellido_materno": "VALENZUELA"}
```

`padron_adulto_miss.json`:
```json
{"error": "not_found"}
```

- [ ] **Step 3: Crear fixtures de submit**

`submit/success.json`:
```json
{"folio": "MTY-2026-000056", "status": "registrado"}
```

`submit/validation_error.json`:
```json
{"error": "schema_mismatch", "detail": "El campo grado_id no coincide con los grados disponibles para esta escuela."}
```

`submit/server_error.json`:
```json
{"error": "internal_server_error"}
```

- [ ] **Step 4: Verificar fixtures**

```bash
find fixtures/tramites/mty-utiles-2026 -type f | sort
# Esperado: 13 archivos .json
node -e "for (const f of require('fs').readdirSync('fixtures/tramites/mty-utiles-2026', {recursive: true, withFileTypes: true})) { if (f.isFile()) JSON.parse(require('fs').readFileSync(require('path').join(f.path, f.name), 'utf8')); } console.log('OK: todos parsean')"
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/tramites/mty-utiles-2026
git commit -m "$(cat <<'EOF'
feat(tramites): fixtures MTY utiles 2026 para modo mock

Catalogos (sedes, escuelas, grados, municipios, colonias, parentescos),
lookups de padron (hit y miss), y respuestas de submit (success, 422, 500).
Estos fixtures alimentan el modo EXTERNAL_TRAMITES_MOCK_MODE=true y los
golden tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Voice tool routes (3 nuevas)

**Files:**
- Create: `src/app/api/voice/tools/consultar-catalogo-externo/route.ts`
- Create: `src/app/api/voice/tools/buscar-en-padron-externo/route.ts`
- Create: `src/app/api/voice/tools/enviar-tramite-externo/route.ts`

**Interfaces:**
- Consumes: `getTramiteById` (Task 2), `fetchCatalogo` (Task 5), `fetchLookup` (Task 5), `submitTramite` (Task 5)
- Produces: 3 endpoints POST invocables por Vapi

- [ ] **Step 1: Crear `consultar-catalogo-externo/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getTramiteById } from '@/lib/tramites/config';
import { fetchCatalogo } from '@/lib/tramites/catalog';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call       = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';
  const respond = (result: unknown) => NextResponse.json({ results: [{ toolCallId, result: typeof result === 'string' ? result : JSON.stringify(result) }] });

  const { tramite_id, catalogo_key, filtros } = args as { tramite_id: string; catalogo_key: string; filtros?: Record<string, string> };
  if (!tramite_id || !catalogo_key) return respond({ ok: false, error: 'tramite_id y catalogo_key son requeridos.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('org_id').eq('id', agentId).maybeSingle();
  if (!agent?.org_id) return respond({ ok: false, error: 'Agente sin organización.' });

  const tramite = await getTramiteById(tramite_id, agent.org_id, supabase);
  if (!tramite) return respond({ ok: false, error: 'Trámite no encontrado o no pertenece a esta organización.' });

  const result = await fetchCatalogo(tramite, catalogo_key, filtros ?? {}, supabase);
  return respond(result);
}
```

- [ ] **Step 2: Crear `buscar-en-padron-externo/route.ts`**

Mismo patrón que Step 1 pero:
- Args: `{ tramite_id, lookup_key, valor }`
- Llama `fetchLookup(tramite, lookup_key, valor, supabase)`
- Retorna el resultado directo

- [ ] **Step 3: Crear `enviar-tramite-externo/route.ts`**

Mismo patrón pero:
- Args: `{ tramite_id, campos }`
- Extrae `callId` desde `body.call?.id` o `body.message?.call?.id` (Vapi provee `call.id`)
- Llama `submitTramite(tramite, campos, { channel: 'voice', agentId, callId }, supabase)`
- Retorna el resultado. Si `result.escalate === true`, el LLM recibirá un mensaje pidiendo escalar y disparará `pedir_a_humano` por su cuenta desde el prompt (no invocamos automáticamente aquí — el prompt lo guía).

Código completo:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { getTramiteById } from '@/lib/tramites/config';
import { submitTramite } from '@/lib/tramites/submit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call       = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';
  const callObj    = ((body.message as Record<string, unknown> | undefined)?.call ?? body.call) as Record<string, unknown> | undefined;
  const callId     = (callObj?.id as string) ?? undefined;
  const respond = (result: unknown) => NextResponse.json({ results: [{ toolCallId, result: typeof result === 'string' ? result : JSON.stringify(result) }] });

  const { tramite_id, campos } = args as { tramite_id: string; campos: Record<string, unknown> };
  if (!tramite_id || !campos) return respond({ ok: false, error: 'tramite_id y campos son requeridos.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('org_id').eq('id', agentId).maybeSingle();
  if (!agent?.org_id) return respond({ ok: false, error: 'Agente sin organización.' });

  const tramite = await getTramiteById(tramite_id, agent.org_id, supabase);
  if (!tramite) return respond({ ok: false, error: 'Trámite no encontrado.' });

  const result = await submitTramite(tramite, campos, { channel: 'voice', agentId, callId }, supabase);
  return respond(result);
}
```

- [ ] **Step 4: Verificar build**

```bash
npm run build 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice/tools/consultar-catalogo-externo src/app/api/voice/tools/buscar-en-padron-externo src/app/api/voice/tools/enviar-tramite-externo
git commit -m "$(cat <<'EOF'
feat(tramites): 3 voice tool routes para tramites externos

consultar-catalogo-externo, buscar-en-padron-externo y enviar-tramite-externo
siguen el patron canonico Vapi (requireVapiAuth + parseo toolCallList +
response results[]). Todos validan tramite_id vs org del agente antes de
ejecutar (guard IDOR).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Executor branches (chat + email)

**Files:**
- Modify: `src/lib/tools/executor.ts` (agregar 3 branches al final del if/else chain, antes del throw genérico si existe)

**Interfaces:**
- Consumes: `getTramiteById`, `fetchCatalogo`, `fetchLookup`, `submitTramite` (Tasks 2, 5); `ctx.agent.org_id` desde `AgentToolContext`
- Produces: 3 branches que reciben `toolName`, `toolInput` y retornan el resultado

- [ ] **Step 1: Agregar imports al inicio del archivo**

En `src/lib/tools/executor.ts`, agregar junto a los imports existentes:

```typescript
import { getTramiteById } from '@/lib/tramites/config';
import { fetchCatalogo } from '@/lib/tramites/catalog';
import { fetchLookup } from '@/lib/tramites/lookup';
import { submitTramite } from '@/lib/tramites/submit';
```

- [ ] **Step 2: Agregar 3 branches al final del if/else de `executeAgentTool`**

Ubicar el final de la cadena (justo antes del último `return { ok: false, error: 'Tool no reconocida' }` o equivalente). Insertar:

```typescript
  // ─────────────────────────────────────────────────────────────────────────
  // consultar_catalogo_externo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'consultar_catalogo_externo') {
    const { tramite_id, catalogo_key, filtros } = toolInput as { tramite_id: string; catalogo_key: string; filtros?: Record<string, string> };
    if (!tramite_id || !catalogo_key) return { ok: false, error: 'tramite_id y catalogo_key son requeridos.' };
    const orgId = (agent.org_id as string | undefined) ?? '';
    if (!orgId) return { ok: false, error: 'Agente sin organización.' };
    const tramite = await getTramiteById(tramite_id, orgId, supabase);
    if (!tramite) return { ok: false, error: 'Trámite no encontrado.' };
    return await fetchCatalogo(tramite, catalogo_key, filtros ?? {}, supabase);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_en_padron_externo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_en_padron_externo') {
    const { tramite_id, lookup_key, valor } = toolInput as { tramite_id: string; lookup_key: string; valor: string };
    if (!tramite_id || !lookup_key || !valor) return { ok: false, error: 'tramite_id, lookup_key y valor son requeridos.' };
    const orgId = (agent.org_id as string | undefined) ?? '';
    if (!orgId) return { ok: false, error: 'Agente sin organización.' };
    const tramite = await getTramiteById(tramite_id, orgId, supabase);
    if (!tramite) return { ok: false, error: 'Trámite no encontrado.' };
    return await fetchLookup(tramite, lookup_key, valor, supabase);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_tramite_externo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_tramite_externo') {
    const { tramite_id, campos } = toolInput as { tramite_id: string; campos: Record<string, unknown> };
    if (!tramite_id || !campos) return { ok: false, error: 'tramite_id y campos son requeridos.' };
    const orgId = (agent.org_id as string | undefined) ?? '';
    if (!orgId) return { ok: false, error: 'Agente sin organización.' };
    const tramite = await getTramiteById(tramite_id, orgId, supabase);
    if (!tramite) return { ok: false, error: 'Trámite no encontrado.' };
    const channel = ctx.channel === 'email' ? 'email' : 'chat';
    return await submitTramite(tramite, campos, { channel, agentId }, supabase);
  }
```

- [ ] **Step 3: Verificar build + lint**

```bash
npm run build 2>&1 | tail -15
npm run lint 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/executor.ts
git commit -m "$(cat <<'EOF'
feat(tramites): branches en executor para 3 tools nuevas (chat + email)

Registra consultar_catalogo_externo, buscar_en_padron_externo y
enviar_tramite_externo en el executor compartido. Con esto quedan
disponibles automaticamente en agent-chat y en inbox-processor (regla
3-canales: voz + chat + correo).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Prompt injection + protocolo de captura crítica

**Files:**
- Create: `src/lib/tramites/prompt.ts`
- Create: `src/lib/tramites/capture-protocol.ts`
- Modify: `src/lib/voice/prompt-builder.ts` (agregar un bloque nuevo)

**Interfaces:**
- Consumes: `Tramite` type + `getActiveTramitesForOrg` (Task 2)
- Produces:
  - `renderTramitesSection(tramites: Tramite[]): string` — retorna markdown para injectar al prompt (o `""` si no hay trámites)
  - `CAPTURE_PROTOCOL_CURP: string` — texto del protocolo de captura crítica de CURP con alfabeto fonético

- [ ] **Step 1: Crear `src/lib/tramites/capture-protocol.ts`**

```typescript
/**
 * Texto del protocolo de captura crítica de CURP para voz.
 * Se injecta solo cuando el agente tiene al menos un trámite activo con
 * campos de tipo curp.
 */
export const CAPTURE_PROTOCOL_CURP = `PROTOCOLO DE CAPTURA CRÍTICA DE CURP (obligatorio cuando captures un CURP para un trámite):

Un CURP tiene 18 caracteres en 3 bloques: 4 letras, 6 números (fecha de nacimiento AAMMDD), 8 alfanuméricos.

1. Pide el CURP en voz baja y clara: "Por favor dígame su CURP, es de 18 caracteres. Vamos a ir por partes."
2. Captura por bloques:
   - Bloque 1: "Dígame las primeras 4 letras."
   - Bloque 2: "Ahora los 6 números de su fecha de nacimiento."
   - Bloque 3: "Y los últimos 8 caracteres."
3. Después de cada bloque, repite lo capturado LETRA POR LETRA usando el alfabeto fonético para letras que suenan parecidas. Confirma antes de pasar al siguiente bloque.
4. Usa el siguiente alfabeto fonético para desambiguar:
   - B como Barcelona · V como Venezuela · M como México · N como Norte
   - D como Delta · T como Tango · P como Papá · F como Francia
   - S como Sierra · C como Carlos · Z como Zapato
   - G como Guadalajara · J como José
5. Si la persona corrige, vuelve a leer TODO el bloque de nuevo antes de continuar.
6. Al final, lee el CURP completo una vez más y confirma antes de enviarlo.

Ejemplo: si dictaron "MOAE121121MNLLDRA3", léelo así: "Confirmo: eme como México, o, a, e, uno, dos, uno, uno, dos, uno, eme como México, ene como Norte, ele, ele, de como Delta, erre, a, tres. ¿Es correcto?"

NUNCA envíes un CURP al padrón sin haber ejecutado este protocolo completo.`;

export const CAPTURE_PROTOCOL_EMAIL = `PROTOCOLO DE CAPTURA DE CORREO ELECTRÓNICO:
1. Pide primero el dominio: "¿Su correo es de gmail, hotmail, yahoo, outlook, u otro?"
2. Luego pide el nombre de usuario letra por letra.
3. Confirma repitiendo todo con alfabeto fonético para letras confusas.
4. Si el ciudadano prefiere no dictar, ofrécele: "Puedo enviarle una confirmación por otro medio; también podemos continuar sin correo, no es obligatorio."`;

export const CAPTURE_PROTOCOL_TELEFONO = `PROTOCOLO DE CAPTURA DE TELÉFONO:
1. Pide el número en grupos: "Dígame los primeros 3 dígitos... ahora los 3 siguientes... y los últimos 4."
2. Repite el número completo agrupado antes de confirmar.
3. Valida que sean 10 dígitos.`;
```

- [ ] **Step 2: Crear `src/lib/tramites/prompt.ts`**

```typescript
import type { Tramite } from './types';
import { CAPTURE_PROTOCOL_CURP, CAPTURE_PROTOCOL_EMAIL, CAPTURE_PROTOCOL_TELEFONO } from './capture-protocol';

function describeCampo(c: import('./types').Campo): string {
  const req = c.required ? 'obligatorio' : 'opcional';
  switch (c.tipo) {
    case 'curp':          return `${c.key} (CURP, ${req}) — captura con protocolo crítico. Si tiene autocomplete via padrón, primero llama buscar_en_padron_externo y si trae datos confírmalos con la persona.`;
    case 'catalogo_pick': return `${c.key} (opción de catálogo "${c.catalogo}", ${req}) — llama consultar_catalogo_externo, ofrece las opciones y captura la elección.`;
    case 'catalogo_search': return `${c.key} (búsqueda en catálogo "${c.catalogo}", ${req}) — pide un texto del ciudadano y usa consultar_catalogo_externo con el filtro correspondiente.`;
    case 'cp':            return `${c.key} (código postal, 5 dígitos, ${req}).`;
    case 'email':         return `${c.key} (correo electrónico, ${req}) — usa el protocolo de captura de correo.`;
    case 'telefono_mx':   return `${c.key} (teléfono 10 dígitos, ${req}) — usa el protocolo de captura de teléfono.`;
    case 'fecha':         return `${c.key} (fecha AAAA-MM-DD, ${req}).`;
    case 'consentimiento': return `${c.key} (consentimiento explícito del aviso de privacidad, ${req}) — DEBE ser el último paso antes de enviar.`;
    default:              return `${c.key} (${c.tipo}, ${req})${c.prompt_captura ? ` — ${c.prompt_captura}` : ''}`;
  }
}

function renderTramite(t: Tramite): string {
  const camposOrdenados = t.campos.slice().sort((a, b) => a.orden - b.orden);
  const pasos = camposOrdenados.map((c, i) => `${i + 1}. ${describeCampo(c)}`).join('\n');
  const avisoBlock = t.aviso_privacidad_texto
    ? `\nAviso de privacidad — LEE al ciudadano antes de capturar cualquier dato personal, y confirma verbalmente que acepta:\n"${t.aviso_privacidad_texto}"\n${t.aviso_privacidad_url ? `Documento completo: ${t.aviso_privacidad_url}` : ''}`
    : '';
  const reglas = t.reglas_negocio;
  const reglasBlock = [
    reglas.max_registros_por_sesion ? `- Máximo ${reglas.max_registros_por_sesion} registro(s) por conversación.` : '',
    reglas.allow_manual_capture_on_padron_miss === false ? `- Si el CURP no aparece en padrón, informa al ciudadano de forma amable que no puede continuar por este canal y ofrece dirigirlo al portal web o a un módulo presencial.` : '',
  ].filter(Boolean).join('\n');

  return `### ${t.nombre_publico} (tramite_id: ${t.id})
${t.descripcion_agente}
${avisoBlock}

Pasos de captura (respeta el orden):
${pasos}

${reglasBlock ? `Reglas de negocio:\n${reglasBlock}\n` : ''}
Al terminar la captura completa y con consentimiento otorgado, llama \`enviar_tramite_externo\` con \`tramite_id="${t.id}"\` y un objeto \`campos\` con todos los valores. Comunica el folio devuelto al ciudadano. Si el envío falla con \`escalate: true\`, invoca \`pedir_a_humano\` con el contexto del trámite y los datos capturados.`;
}

export function renderTramitesSection(tramites: Tramite[]): string {
  if (tramites.length === 0) return '';
  const anyCurp = tramites.some(t => t.campos.some(c => c.tipo === 'curp'));
  const anyEmail = tramites.some(t => t.campos.some(c => c.tipo === 'email'));
  const anyTel = tramites.some(t => t.campos.some(c => c.tipo === 'telefono_mx'));

  const protocols: string[] = [];
  if (anyCurp)  protocols.push(CAPTURE_PROTOCOL_CURP);
  if (anyEmail) protocols.push(CAPTURE_PROTOCOL_EMAIL);
  if (anyTel)   protocols.push(CAPTURE_PROTOCOL_TELEFONO);

  const tramitesMd = tramites.map(renderTramite).join('\n\n');

  return `TRÁMITES EXTERNOS QUE PUEDES GESTIONAR

Cuando el ciudadano solicite uno de estos servicios, síguelo paso a paso.

${tramitesMd}

${protocols.length ? '\n' + protocols.join('\n\n') : ''}`;
}
```

- [ ] **Step 3: Modificar `src/lib/voice/prompt-builder.ts` para injectar el bloque**

En `buildSystemPrompt`, después del bloque de identidad y antes del bloque de tools, agregar (nota: la función debe volverse `async` porque `getActiveTramitesForOrg` es async — verificar consumidores y actualizar):

Cambios necesarios:
1. Cambiar la firma a `async function buildSystemPrompt(...)` y `Promise<string>`
2. Agregar parámetros: `orgId: string | null | undefined, supabase: SupabaseClient`
3. Agregar el bloque:

```typescript
  // ── Trámites externos (per-org) ──────────────────────────────────────────
  if (orgId) {
    const { getActiveTramitesForOrg } = await import('@/lib/tramites/config');
    const { renderTramitesSection } = await import('@/lib/tramites/prompt');
    const tramites = await getActiveTramitesForOrg(orgId, supabase);
    const section = renderTramitesSection(tramites);
    if (section) blocks.push(section);
  }
```

Y actualizar todos los call sites de `buildSystemPrompt` (grep para encontrar):

```bash
grep -rn "buildSystemPrompt(" src/
```

En cada call site: cambiar a `await buildSystemPrompt(agent, learnings, agent.org_id, supabase)` y asegurar que la función caller sea `async`.

- [ ] **Step 4: Verificar build + lint**

```bash
npm run build 2>&1 | tail -25
npm run lint 2>&1 | tail -20
```

Si hay errores por call sites viejos, agregar `await` y `org_id` + `supabase` a los llamados.

- [ ] **Step 5: Smoke test manual del prompt**

Script scratch (o desde el REPL) que llame `buildSystemPrompt` para el agente Nia demo Monterrey (Vapi id `9f074691`, según memoria) con la org creada más tarde. Alternativa: crear una org de test + un trámite de test y verificar que `renderTramitesSection` retorna markdown esperado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tramites/prompt.ts src/lib/tramites/capture-protocol.ts src/lib/voice/prompt-builder.ts
git commit -m "$(cat <<'EOF'
feat(tramites): prompt injection dinamico + protocolo captura critica CURP

buildSystemPrompt ahora es async y recibe orgId + supabase. Injecta una
seccion "Tramites externos" con descripcion, pasos ordenados, aviso de
privacidad y reglas de negocio para cada tramite activo de la org. Si algun
tramite tiene campos CURP/email/telefono, appendea el protocolo de captura
critica correspondiente (alfabeto fonetico + captura por bloques + doble
confirmacion).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Seed del trámite MTY (placeholder, activo=false)

**Files:**
- Create: `scripts/tramites/seed-mty-utiles.ts`

**Interfaces:**
- Consumes: tabla `external_tramites` (Task 1), esquema de tipos (Task 2)
- Produces: 1 row en `external_tramites` para la org del municipio, `activo=false`, endpoints placeholder

- [ ] **Step 1: Crear el script de seed**

`scripts/tramites/seed-mty-utiles.ts`:

```typescript
/**
 * Seed inicial del trámite pre-registro útiles escolares Monterrey 2026.
 *
 * PREREQUISITO: la org del Municipio de Monterrey debe existir en la tabla
 * `organizations` con business_name = "Gobierno de Monterrey". Este script
 * la resuelve por business_name.
 *
 * Uso:
 *   npx tsx scripts/tramites/seed-mty-utiles.ts
 *
 * El trámite se inserta con activo=false. Al recibir la doc oficial del
 * municipio, actualizar endpoint_base + campos + catalogos + lookups y
 * activar via UPDATE ... SET activo=true.
 */
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, business_name')
    .ilike('business_name', '%monterrey%')
    .maybeSingle();
  if (orgErr || !org) throw new Error(`No se encontró org "Gobierno de Monterrey": ${orgErr?.message ?? 'no rows'}`);

  const tramite = {
    org_id:                 org.id,
    slug:                   'mty-pre-registro-utiles-2026',
    nombre_publico:         'Pre-registro Programa de Útiles Escolares 2026',
    descripcion_agente:     'Pre-registro del Programa Municipal de Útiles Escolares 2026 de Monterrey. Permite al ciudadano seleccionar sede de entrega, capturar los datos del estudiante (CURP autocompletado desde padrón, escuela, grado) y del adulto responsable que recogerá el kit (CURP, domicilio, contacto). Al finalizar se le entrega un folio y la lista de documentos que debe presentar el día de la entrega.',
    activo:                 false,
    schema_version:         1,
    endpoint_base:          'https://TODO-endpoint-real-del-municipio.gob.mx',
    auth_config:            { type: 'bearer', secret_key: 'mty_utiles_api_key' },
    campos: [
      { key: 'sede_id', tipo: 'catalogo_pick', catalogo: 'sedes', required: true, orden: 1 },
      { key: 'curp_estudiante', tipo: 'curp', required: true, orden: 2, autocompleta_desde: 'padron_estudiante' },
      { key: 'nombre_estudiante', tipo: 'string', required: true, orden: 3, source: 'padron_estudiante.nombre' },
      { key: 'apellido_paterno_estudiante', tipo: 'string', required: true, orden: 4, source: 'padron_estudiante.apellido_paterno' },
      { key: 'apellido_materno_estudiante', tipo: 'string', required: true, orden: 5, source: 'padron_estudiante.apellido_materno' },
      { key: 'fecha_nacimiento_estudiante', tipo: 'fecha', required: true, orden: 6, source: 'padron_estudiante.fecha_nacimiento' },
      { key: 'escuela_id', tipo: 'catalogo_search', catalogo: 'escuelas', required: true, orden: 7 },
      { key: 'grado_id', tipo: 'catalogo_pick', catalogo: 'grados', depende_de: 'escuela_id', required: true, orden: 8 },
      { key: 'curp_adulto', tipo: 'curp', required: true, orden: 9, autocompleta_desde: 'padron_adulto' },
      { key: 'nombre_adulto', tipo: 'string', required: true, orden: 10, source: 'padron_adulto.nombre' },
      { key: 'apellido_paterno_adulto', tipo: 'string', required: true, orden: 11, source: 'padron_adulto.apellido_paterno' },
      { key: 'apellido_materno_adulto', tipo: 'string', required: true, orden: 12, source: 'padron_adulto.apellido_materno' },
      { key: 'calle', tipo: 'string', required: true, orden: 13 },
      { key: 'numero', tipo: 'string', required: true, orden: 14 },
      { key: 'codigo_postal', tipo: 'cp', required: true, orden: 15 },
      { key: 'municipio_id', tipo: 'catalogo_search', catalogo: 'municipios', required: true, orden: 16 },
      { key: 'colonia_id', tipo: 'catalogo_pick', catalogo: 'colonias', depende_de: 'codigo_postal', required: true, orden: 17 },
      { key: 'telefono', tipo: 'telefono_mx', required: true, orden: 18 },
      { key: 'correo', tipo: 'email', required: false, orden: 19 },
      { key: 'parentesco', tipo: 'catalogo_pick', catalogo: 'parentescos', required: true, orden: 20 },
      { key: 'acepta_aviso_privacidad', tipo: 'consentimiento', required: true, orden: 21 },
    ],
    catalogos: [
      { key: 'sedes', endpoint: '/sedes', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre', extra: ['direccion', 'fechas', 'horario'] } },
      { key: 'escuelas', endpoint: '/escuelas', method: 'GET', query_param: 'q', min_query_length: 3, response_items_path: 'data', item_fields: { id: 'id', label: 'nombre', extra: ['turno', 'nivel'] } },
      { key: 'grados', endpoint: '/escuelas/{escuela_id}/grados', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
      { key: 'municipios', endpoint: '/catalogos/municipios', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
      { key: 'colonias', endpoint: '/catalogos/colonias', method: 'GET', query_param: 'cp', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
      { key: 'parentescos', endpoint: '/catalogos/parentescos', method: 'GET', response_items_path: 'data', item_fields: { id: 'id', label: 'nombre' } },
    ],
    lookups: [
      { key: 'padron_estudiante', endpoint: '/padron/estudiante', method: 'GET', query_param: 'curp', response_fields: { nombre: 'nombre', apellido_paterno: 'apellido_paterno', apellido_materno: 'apellido_materno', fecha_nacimiento: 'fecha_nacimiento' }, not_found_action: 'reject' },
      { key: 'padron_adulto', endpoint: '/padron/adulto', method: 'GET', query_param: 'curp', response_fields: { nombre: 'nombre', apellido_paterno: 'apellido_paterno', apellido_materno: 'apellido_materno' }, not_found_action: 'reject' },
    ],
    submit: { endpoint: '/pre-solicitud', method: 'POST', response_folio_path: 'folio', response_success_status: [200, 201] },
    reglas_negocio: {
      allow_manual_capture_on_padron_miss: false,
      max_registros_por_sesion: 1,
      idempotency_fields: ['curp_estudiante', 'sede_id'],
    },
    aviso_privacidad_texto: 'Sus datos personales serán tratados por el Gobierno de Monterrey para efectos del pre-registro del Programa de Útiles Escolares 2026 y no serán compartidos con terceros. Puede consultar el aviso completo en el enlace que le enviaremos. ¿Autoriza este tratamiento?',
    aviso_privacidad_url: 'https://TODO-url-del-aviso-oficial.gob.mx',
  };

  const { data, error } = await supabase
    .from('external_tramites')
    .upsert(tramite, { onConflict: 'org_id,slug' })
    .select('id, slug, activo')
    .single();

  if (error) throw new Error(error.message);
  console.log('OK:', data);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr el script (requiere que la org del municipio exista)**

Si la org existe:
```bash
npx tsx scripts/tramites/seed-mty-utiles.ts
```

Si no existe (aún no se ha creado el portal), este step queda pendiente y se corre después. **Documentar en el commit message que Task 10 depende de crear la org primero.**

- [ ] **Step 3: Verificar la row**

```sql
SELECT id, slug, activo, schema_version FROM external_tramites WHERE slug = 'mty-pre-registro-utiles-2026';
-- Esperado: 1 row, activo=false, schema_version=1
```

- [ ] **Step 4: Commit**

```bash
git add scripts/tramites/seed-mty-utiles.ts
git commit -m "$(cat <<'EOF'
feat(tramites): script seed inicial pre-registro utiles MTY 2026

Inserta la config completa del tramite con activo=false y endpoint_base
placeholder. Al recibir docs oficiales del municipio se actualiza el
endpoint + auth y se activa. Depende de que la org "Gobierno de Monterrey"
ya exista en la tabla organizations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Golden test scenarios (5 escenarios Nia)

**Files:**
- Create: `src/lib/golden-tests/scenarios/nia/tramite-utiles-happy.ts`
- Create: `src/lib/golden-tests/scenarios/nia/tramite-utiles-curp-mal-dictado.ts`
- Create: `src/lib/golden-tests/scenarios/nia/tramite-utiles-padron-miss.ts`
- Create: `src/lib/golden-tests/scenarios/nia/tramite-utiles-max-registros.ts`
- Create: `src/lib/golden-tests/scenarios/nia/tramite-utiles-endpoint-5xx.ts`
- Modify: `src/lib/golden-tests/scenarios/nia.ts` (agregar imports + exports; verificar patrón contra `scenarios/niva.ts`)

**Interfaces:**
- Consumes: tipo `GoldenScenario` desde `src/lib/golden-tests/types.ts`; patrón de escenarios existentes en `scenarios/nox/*.ts`
- Produces: 5 escenarios listos para el orchestrator + gate

- [ ] **Step 1: Leer un escenario Nia/Nox existente como referencia**

```bash
cat src/lib/golden-tests/scenarios/nox/delegacion-simple.ts
```

Observar: estructura del objeto `GoldenScenario`, dónde se define el user persona simulado, y cómo se listan rubric criteria.

- [ ] **Step 2: Crear `tramite-utiles-happy.ts`**

Escenario feliz. Ciudadano habla claro, dicta CURP bien al primer intento, todo se autocompleta, submit exitoso.

Usa como base el patrón del `.ts` inspeccionado en Step 1. El escenario debe:
- Ser tipo `GoldenScenario`
- `key`: `'nia-tramite-utiles-happy'`
- `simulatedUser`: persona describiendo un ciudadano que quiere registrar a su hijo(a) para el Programa de Útiles Escolares. Datos: CURP `MOAE121121MNLLDRA3` (hit en mock), sede Plaza Paseo La Quinta, escuela "11 de Mayo de 1988", grado 5to, adulto MAYRA JANET GONZÁLEZ VALENZUELA CURP `GOVM860614MNLNLY06` (hit), domicilio Los Salinas 118, colonia 1 de Mayo, CP 64220, tel 8991223191, correo maygzz86@gmail.com, parentesco MADRE.
- `env`: `EXTERNAL_TRAMITES_MOCK_MODE=true` (revisar cómo el runner acepta env vars — ver `src/lib/golden-tests/runner.ts`)
- `rubric`: criterios que evalúa el juez. Ejemplos:
  - "El agente leyó el aviso de privacidad antes de capturar CURP"
  - "El agente ejecutó el protocolo de captura crítica (dictado por bloques + alfabeto fonético) al pedir cada CURP"
  - "El agente llamó `enviar_tramite_externo` una sola vez con todos los campos correctos"
  - "El agente comunicó el folio final al ciudadano"
  - "El agente NO inventó datos que no capturó"

- [ ] **Step 3: Crear `tramite-utiles-curp-mal-dictado.ts`**

Ciudadano dicta CURP mal la primera vez (invierte 2 letras) y corrige en el segundo intento. Rubric mide que el agente detectó el error en la confirmación por alfabeto fonético y no envió al padrón hasta tener el CURP correcto.

- [ ] **Step 4: Crear `tramite-utiles-padron-miss.ts`**

Ciudadano dicta un CURP que termina en `_MISS` (convención mock para forzar not-found). Rubric mide que el agente:
- Informa al ciudadano de manera amable que su CURP no aparece en el padrón
- NO intenta capturar los datos manualmente (porque `allow_manual_capture_on_padron_miss: false`)
- Ofrece dirigir a portal web o módulo presencial
- Cierra la llamada sin ejecutar submit

- [ ] **Step 5: Crear `tramite-utiles-max-registros.ts`**

Ciudadano registra al primer hijo(a) exitosamente y pide registrar al segundo(a). Rubric mide que el agente respeta `max_registros_por_sesion: 1`, informa que sólo puede procesarse un registro por llamada, y ofrece que llame de nuevo para el segundo.

- [ ] **Step 6: Crear `tramite-utiles-endpoint-5xx.ts`**

Ciudadano dicta todo bien pero al hacer submit incluye el string `FAIL_500` en algún campo (convención mock). El endpoint responde 500. Rubric mide que el agente:
- Detecta la falla (recibió `escalate: true`)
- Ejecuta `pedir_a_humano` con contexto del trámite y los datos capturados
- Informa al ciudadano en tono empático que un compañero humano toma el caso
- NO reintenta submit indefinidamente

- [ ] **Step 7: Modificar `src/lib/golden-tests/scenarios/nia.ts`**

Primero verificar cómo se exportan actualmente los escenarios Nia:

```bash
cat src/lib/golden-tests/scenarios/nia.ts
```

Si el archivo actual es monolítico (todos los escenarios inline), agregar los 5 nuevos al mismo archivo pero importados desde el subdirectorio (patrón niva.ts). Si ya usa el patrón de subdirectorio, sólo agregar los imports:

```typescript
import { NIA_TRAMITE_UTILES_HAPPY } from './nia/tramite-utiles-happy';
import { NIA_TRAMITE_UTILES_CURP_MAL_DICTADO } from './nia/tramite-utiles-curp-mal-dictado';
import { NIA_TRAMITE_UTILES_PADRON_MISS } from './nia/tramite-utiles-padron-miss';
import { NIA_TRAMITE_UTILES_MAX_REGISTROS } from './nia/tramite-utiles-max-registros';
import { NIA_TRAMITE_UTILES_ENDPOINT_5XX } from './nia/tramite-utiles-endpoint-5xx';

// Agregar al array exportado:
export const NIA_SCENARIOS: GoldenScenario[] = [
  ...existentes,
  NIA_TRAMITE_UTILES_HAPPY,
  NIA_TRAMITE_UTILES_CURP_MAL_DICTADO,
  NIA_TRAMITE_UTILES_PADRON_MISS,
  NIA_TRAMITE_UTILES_MAX_REGISTROS,
  NIA_TRAMITE_UTILES_ENDPOINT_5XX,
];
```

- [ ] **Step 8: Correr un escenario en local para validar shape**

Requisitos previos:
- Org de test creada con un `external_tramites` de test (o correr Task 10 antes con la org real)
- `EXTERNAL_TRAMITES_MOCK_MODE=true` en `.env.local`

```bash
# Disparar solo el escenario happy via admin route (según patrón del framework):
# POST a /api/admin/golden-tests/trigger con { scenario: 'nia-tramite-utiles-happy' }
# o correr directo via CLI si existe (revisar package.json y src/lib/golden-tests/runner.ts)
```

Verificar que el runner no falla por errores de schema en los escenarios (aunque el rubric no pase al 100% en la primera corrida — eso se calibra después).

- [ ] **Step 9: Verificar build + lint**

```bash
npm run build 2>&1 | tail -15
npm run lint 2>&1 | tail -10
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/golden-tests/scenarios/nia src/lib/golden-tests/scenarios/nia.ts
git commit -m "$(cat <<'EOF'
feat(tramites): 5 golden test scenarios Nia para pre-registro utiles

happy, curp-mal-dictado, padron-miss, max-registros, endpoint-5xx.
Todos corren con EXTERNAL_TRAMITES_MOCK_MODE=true. Rubrics evaluan
protocolo de captura critica, respeto a reglas de negocio, escalacion
correcta ante 5xx, y ausencia de invenciones.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Smoke test end-to-end en dev

**Files:** (no crea archivos; verificación manual)

**Interfaces:**
- Consumes: infra completa de Tasks 1-11
- Produces: evidencia de que el flujo funciona end-to-end con mocks

- [ ] **Step 1: Preparar ambiente dev**

Crear una org de test en Supabase local (o preview):
```sql
INSERT INTO organizations (business_name)
VALUES ('Gobierno de Monterrey (TEST)')
RETURNING id;
```

Con ese `org_id`, correr `scripts/tramites/seed-mty-utiles.ts` (ajustar el `.ilike` si el nombre difiere).

Actualizar el row a `activo=true` manualmente:
```sql
UPDATE external_tramites SET activo=true WHERE slug='mty-pre-registro-utiles-2026';
```

Verificar que hay al menos un `voice_agent` en esa org (rol Nia). Si no, crear uno via el flow normal de registro.

- [ ] **Step 2: Configurar env local**

En `.env.local`:
```
EXTERNAL_TRAMITES_MOCK_MODE=true
```

- [ ] **Step 3: Verificar prompt injection**

Correr `npm run dev`. Ir al portal, revisar que al ver la config del agente Nia (o mediante un endpoint admin), el system prompt incluye la sección "TRÁMITES EXTERNOS QUE PUEDES GESTIONAR" con el trámite MTY visible y el protocolo de captura crítica de CURP.

Alternativa: agregar temporalmente un `console.log(prompt)` en el prompt-builder y disparar una invocación desde chat.

- [ ] **Step 4: Ejecutar el flujo por chat (canal chat)**

En el portal, ir a chat con el agente Nia de la org de test. Mensajes:

```
Hola, quiero pre-registrar a mi hija para el programa de útiles.
```

El agente debería (según su prompt): leer el aviso de privacidad y pedir consentimiento, ofrecer las 3 sedes del catálogo mock, pedir CURP con protocolo (aplica en chat aunque no sea voz — es aceptable que el agente lo salte parcialmente en chat porque hay pantalla), etc.

Continuar la conversación proveyendo:
- Sede: "Plaza Paseo La Quinta"
- CURP estudiante: `MOAE121121MNLLDRA3`
- Escuela: "11 de mayo" → agente debe llamar consultar_catalogo_externo
- Grado: "5to de primaria"
- CURP adulto: `GOVM860614MNLNLY06`
- Domicilio: Los Salinas 118, CP 64220, colonia 1 de Mayo, tel 8991223191, correo maygzz86@gmail.com, parentesco MADRE
- Consentimiento: sí

Al final el agente debe llamar `enviar_tramite_externo`, recibir folio `MTY-2026-000056` del mock, y comunicarlo.

Verificar en DB:
```sql
SELECT id, folio, status, channel FROM external_tramites_submissions ORDER BY created_at DESC LIMIT 1;
-- Esperado: 1 row nueva, status='success', channel='chat'
```

- [ ] **Step 5: Ejecutar caso de error**

Repetir el flujo pero en un campo (por ejemplo calle) dictar `FAIL_500` para simular error del endpoint. Verificar:
- El agente informa al usuario del problema
- Idealmente invoca `pedir_a_humano` (si el prompt del trámite lo instruye correctamente)
- La row en `external_tramites_submissions` queda con `status='server_error'`

- [ ] **Step 6: Documentar hallazgos**

Escribir un comentario breve en el commit final con:
- ¿Se ejecutó el flujo happy path completo?
- ¿El agente respetó el orden de captura?
- ¿Los tools se invocaron correctamente?
- ¿Hay ajustes de prompt necesarios? (dejarlos en un TODO para calibración con golden tests)

- [ ] **Step 7: Commit de cierre**

Sin cambios de código nuevos, solo un tag commit con el reporte:

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(tramites): smoke test E2E completado con mocks

Verificado end-to-end en dev con EXTERNAL_TRAMITES_MOCK_MODE=true:
- Prompt injection: seccion tramite visible en system prompt del agente
- Chat happy path: agente ejecuto los 20 campos, submit exitoso, folio comunicado
- Error path: agente escalo apropiadamente ante mock FAIL_500
- Row de submission registrada en DB con status correcto

Pendiente para el piloto real:
- Recibir docs API del municipio y actualizar endpoint_base + auth_config
- Insertar bearer token real via vault.create_secret (ver scripts/tramites/README.md)
- Activar el tramite (UPDATE ... SET activo=true)
- Corridas de calibracion de golden tests para ajustar rubrics

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Deferred (fuera de este plan, no bloqueado)

Item del spec que se difiere para no inflar el scope inicial:

- **Notificación automática al owner cuando hay 3+ fallos de `status='schema_mismatch'` en 24h.** Requiere un cron nuevo (`/api/cron/tramites-schema-alert`) que corra cada hora, agrupe fallos por `tramite_id` en la ventana, y envíe email al `portal_email` del agente owner con snapshot de los payloads que fallaron. Se implementa como task separada cuando veamos el primer caso real de schema drift, o pre-piloto si el municipio nos avisa que planean iterar rápido su API.

## Post-implementación (bloqueado por el municipio)

Estos pasos NO están en el plan de implementación — se ejecutan cuando el municipio entregue la documentación de su API:

1. Actualizar `endpoint_base` con la URL real del sandbox
2. Insertar el bearer token real en Supabase Vault (ver `scripts/tramites/README.md`)
3. Ajustar `campos`, `catalogos`, `lookups`, `submit` si el contrato real difiere del diseñado
4. Correr golden tests contra el sandbox real (sin `MOCK_MODE`)
5. Prueba con Nazre y Sergio haciendo llamadas de verdad al agente Nia del municipio
6. Activar (`activo=true`) y liberar el número para pruebas del municipio
7. Piloto real con ciudadanos
