# Reglas, Tareas y Tags en Fichas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shippear dos objetos nuevos (Reglas de operación org-level, Tareas programadas por meerkat) y agregar tagging + retrieval filtrado a `fichas_informativas`, con wizard de onboarding, feature flags per-org, rollout secuencial desde Santiago NL y hard delete inline de config redundante.

**Architecture:** Migrations Supabase para 5 tablas nuevas + alter fichas. Prompt builder compone Reglas stuffed + Tareas titular stuffed + Fichas dual mode (stuffed ≤20, retrieval >20 con pre-filtro por tag + rerank Haiku opcional). Cron scheduler existente absorbe tareas cron; phrase matcher nuevo en tool loop del meerkat. Autotag Sonnet síncrono al crear ficha, backfill masivo async para fichas legacy. Feature flags per-org en `organizations.features`.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript, Supabase (Postgres + pgvector + storage), Anthropic Claude (Sonnet 4.6 razonamiento, Haiku 4.5 rerank), Vapi voz (sin cambios), Vercel deployment. Testing: Vitest para unit, integration tests contra Supabase real con `assertNotProdOrAllowed`.

**Spec:** `docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md`

**IMPORTANTE — Correcciones post-auditoría (2026-09-24):** Después de escribir este plan se ejecutó la auditoría del código real. Los hallazgos concretos están en la sección **"Post-Audit Corrections"** al final de este archivo. **Esas correcciones tienen precedencia sobre cualquier detalle contradictorio en las tareas de abajo.** Léelas antes de arrancar cualquier fase.

## Global Constraints

- **Next.js versión**: la del proyecto (`package.json`). Este NO es el Next.js estándar; APIs, conventions y file structure pueden diferir. Leer `node_modules/next/dist/docs/` relevante antes de escribir código nuevo. Ver `AGENTS.md` raíz del repo.
- **Anthropic SDK logging**: toda llamada a Anthropic pasa por `logLlmCall`. Enforced por `pnpm lint`. Aplica a: autotag, rerank, ejecución de Tarea programada, migración legacy.
- **Tests contra prod prohibidos**: cualquier smoke integration test que inserta en Supabase real llama `assertNotProdOrAllowed()` en `beforeAll`. Aplica a Task 1.x, 2.x, 3.x, 4.x, 6.x, 7.x, 8.x.
- **Copy visible al cliente**: sin "IA", "AI", "trigger", "cron", "prompt", "system message", "embedding", "retrieval", "agente" (usar "empleado" o "empleado digital"). Sin em-dashes. Con acentos completos (ñ, á, é, í, ó, ú, ¿, ¡). Sin regionalismos chilangos tipo "te late".
- **Feature flags default OFF**: `agent_missions_enabled`, `retrieval_v2_enabled`, `rerank_enabled` arrancan OFF para todos los orgs. Activación manual por Nazre, per-org.
- **Cero cobro al cliente por migraciones internas**: backfill de tags, retry de autotag, evals periódicas usan `bill_to = 'centinelia_migration'` o `'centinelia_eval'`, nunca tocan pool del cliente.
- **Hard delete solo tras migración de datos**: si un campo tiene datos poblados en producción, migración obligatoria antes del `DROP COLUMN`.
- **Idempotencia de setup**: creación de Regla/Tarea/Ficha lleva `client_dedup_key` en request, ledger verifica antes de cobrar.
- **Prompt caching de Anthropic**: bloques nuevos del system prompt (Reglas, Tareas titulares) deben estar en la parte cacheable. Verificar con Anthropic docs.
- **Español completo en toda salida al cliente**: correos, WhatsApp, portal, wizard, mensajes de error. Nunca ASCII plano.

## Review Focus

Cinco failure modes que el spec implica pero los tests de tareas individuales pueden no cubrir. Cada uno tiene test asignado a la tarea que posee el código.

1. **Regla con `applies_to` conteniendo meerkat slug inexistente**: cliente escribe `applies_to = ['nala', 'agente-fantasma']`. Debe rechazarse en validación al guardar. Test en Task 2.2.
2. **Ficha con tag no presente en catálogo**: request llega con `tags = ['contabilidad', 'inventario_veterinario']` (el segundo no existe). Debe rechazarse en validación con error claro. Test en Task 6.1.
3. **Cron scheduler ejecuta tarea de org con `agent_missions_enabled = false`**: la tarea NO debe ejecutarse. Test en Task 3.4.
4. **Meerkat con whitelist vacía consulta fichas**: fallback a retrieval sin filtro con warning log. NO debe caer 500 ni devolver array vacío silencioso. Test en Task 4.3.
5. **Ejecución de tarea programada supera pool disponible del cliente**: la tarea NO debe ejecutar side-effects; alerta al cliente por canal preferido; se cobra solo si el arranque ya se registró en ledger (según [[feedback-pool-accuracy-top-priority]]). Test en Task 3.6.

---

## File Structure

Archivos que se crean o modifican, agrupados por fase:

### Fase 0: Auditoría (produce documento, cero código)
- Create: `docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md`

### Fase 1: Infra base
- Create: `supabase/migrations/2026-09-24-01_ficha_tags.sql`
- Create: `supabase/migrations/2026-09-24-02_role_default_tag_whitelist.sql`
- Create: `supabase/migrations/2026-09-24-03_org_role_tag_additions.sql`
- Create: `supabase/migrations/2026-09-24-04_alter_fichas_informativas.sql`
- Create: `src/lib/tags/whitelist.ts` (helpers para whitelist efectiva)
- Create: `tests/lib/tags/whitelist.test.ts`
- Create: `tests/integration/tags-schema.test.ts`

### Fase 2: Reglas
- Create: `supabase/migrations/2026-09-24-05_agent_rules.sql`
- Create: `src/lib/agent-rules/service.ts`
- Create: `src/lib/agent-rules/validation.ts`
- Create: `src/lib/agent-rules/cache.ts`
- Create: `src/app/api/agent-rules/route.ts` (POST list/create)
- Create: `src/app/api/agent-rules/[id]/route.ts` (GET/PATCH/DELETE)
- Modify: system prompt builder actual (path exacto de la auditoría de Fase 0)
- Create: `tests/lib/agent-rules/service.test.ts`
- Create: `tests/lib/agent-rules/validation.test.ts`
- Create: `tests/integration/agent-rules-endpoints.test.ts`
- Create: `tests/integration/prompt-builder-rules.test.ts`

### Fase 3: Tareas
- Create: `supabase/migrations/2026-09-24-06_agent_tasks_and_runs.sql`
- Create: `src/lib/agent-tasks/service.ts`
- Create: `src/lib/agent-tasks/validation.ts`
- Create: `src/lib/agent-tasks/executor.ts`
- Create: `src/lib/agent-tasks/phrase-matcher.ts`
- Create: `src/app/api/agent-tasks/route.ts`
- Create: `src/app/api/agent-tasks/[id]/route.ts`
- Create: `src/app/api/agent-tasks/[id]/execute/route.ts` (manual trigger)
- Create: `src/app/api/cron/agent-tasks-scheduler/route.ts`
- Modify: `vercel.json` (agregar cron entry para agent-tasks-scheduler)
- Modify: system prompt builder actual (agregar bloque de tareas titulares)
- Modify: meerkat tool loop (integrar phrase-matcher)
- Create: `tests/lib/agent-tasks/*.test.ts` (varios)
- Create: `tests/integration/agent-tasks-scheduler.test.ts`
- Create: `tests/integration/agent-tasks-phrase-trigger.test.ts`

### Fase 4: Retrieval nuevo
- Modify: `src/lib/fichas-informativas/retrieval.ts` (path exacto vía auditoría)
- Create: `src/lib/fichas-informativas/rerank.ts`
- Create: `src/lib/fichas-informativas/fallbacks.ts`
- Create: `tests/lib/fichas-informativas/retrieval.test.ts`
- Create: `tests/lib/fichas-informativas/rerank.test.ts`
- Create: `tests/integration/retrieval-v2.test.ts`

### Fase 5: UI Portal
- Create: `src/app/portal/reglas/page.tsx`
- Create: `src/app/portal/reglas/components/*.tsx` (Card, Modal, MultiSelect)
- Create: `src/app/portal/meerkats/[slug]/tareas/page.tsx`
- Create: `src/app/portal/meerkats/[slug]/tareas/components/*.tsx`
- Create: `src/app/portal/onboarding-wizard/page.tsx`
- Create: `src/app/portal/onboarding-wizard/steps/*.tsx`
- Modify: modal existente de "Nueva ficha informativa" (path vía auditoría)
- Modify: nav lateral del portal (agregar "Reglas del negocio" y "Tareas" bajo meerkat)
- Create: `tests/e2e/portal-reglas.spec.ts`
- Create: `tests/e2e/portal-tareas.spec.ts`
- Create: `tests/e2e/portal-onboarding-wizard.spec.ts`

### Fase 6: Autotag y backfill
- Create: `src/lib/autotag/service.ts`
- Create: `src/lib/autotag/prompt.ts` (prompt template de Sonnet)
- Create: `src/lib/workers/backfill-ficha-tags.ts`
- Create: `src/app/api/cron/backfill-ficha-tags/route.ts`
- Modify: `vercel.json` (agregar cron entry)
- Modify: endpoint de crear ficha para llamar autotag síncrono
- Create: `tests/lib/autotag/service.test.ts`
- Create: `tests/integration/backfill-worker.test.ts`

### Fase 7: Cobro y ledger
- Modify: `src/lib/pool/ledger.ts` (agregar reasons nuevos)
- Modify: `src/lib/pool/drift-detector.ts` (agregar checks nuevos)
- Modify: cobros en Task 2.2, 3.2, 3.6, 6.1 (integrar reasons)
- Create: `tests/lib/pool/new-reasons.test.ts`
- Create: `tests/integration/task-execution-ledger.test.ts`
- Create: `tests/integration/drift-detector-new-checks.test.ts`

### Fase 8: Migración legacy + Hard delete
- Create: `scripts/migrate-legacy-agent-config-to-rules-and-tasks.ts`
- Create: `supabase/migrations/2026-09-24-07_drop_legacy_columns.sql` (contenido exacto según auditoría)
- Delete: archivos identificados en auditoría (frontend components, endpoints, helpers)
- Modify: cualquier código que leía los campos legacy
- Create: `tests/scripts/migrate-legacy.test.ts`

### Fase 9: Feature flags + Rollout
- Modify: schema de `organizations.features` (jsonb) - documentar los 3 flags nuevos
- Create: `src/lib/feature-flags/agent-missions.ts` (getter helper)
- Modify: prompt builder, cron scheduler, phrase matcher, retrieval (checkear flags)
- Modify: portal (esconder secciones si flag off)
- Create: `docs/runbook/2026-09-24-reglas-tareas-tags-rollout.md`
- Create: `tests/lib/feature-flags/agent-missions.test.ts`

### Fase 10: Brain artifacts (post ship-complete)
- Create: `.brain/decisions/2026-09-24-reglas-tareas-y-tags-fichas.md`
- Create: `.brain/policies/agent-missions-and-ficha-tags.md`
- Create: `.brain/skills/adding-agent-rule-or-task.md`

---

## Phase 0: Auditoría previa

Sin código. Produce un documento que alimenta Fases 2, 3, 5, 8. Bloqueante.

### Task 0.1: Grep frontend

**Files:**
- Create: `docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md`

**Interfaces:**
- Produces: lista de componentes/campos del portal que quedan redundantes con Reglas + Tareas.

- [ ] **Step 1: Crear archivo de auditoría con estructura vacía**

```markdown
# Auditoría de config redundante — 2026-09-24

## Frontend (portal)
### Config del empleado
- (llenar)

### Config del org
- (llenar)

## Backend
### Endpoints
- (llenar)

### System prompt builders
- (llenar)

### Tools de meerkats
- (llenar)

## Supabase
### Columnas muertas
- (llenar)

### Foreign keys afectadas
- (llenar)

## Migración necesaria
- (llenar: ninguno / script X)

## Nombres confirmados
- `voice_agents` vs `agents`: (confirmar)
- Modelo de embedding actual: (confirmar)
- Path del prompt builder: (confirmar)
- Roster real de roles en DB: (confirmar)
```

- [ ] **Step 2: Grep en portal frontend**

Run:
```bash
cd /c/Users/Nazre/centinelia
grep -rn "custom_instructions\|business_policies\|prompt_personalizado\|instrucciones_agente\|reglas_del_negocio" src/app/portal/ src/components/ 2>&1
```
Documenta cada match en el archivo. Formato:
```
- src/components/AgentConfig/CustomInstructionsField.tsx:23 — textarea custom_instructions, se puede reemplazar por Reglas + Tareas
```

- [ ] **Step 3: Commit auditoría parcial**

```bash
git add docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md
git commit -m "docs(audit): frontend agent config redundancy grep"
```

### Task 0.2: Grep backend

**Files:**
- Modify: `docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md`

- [ ] **Step 1: Grep endpoints**

Run:
```bash
grep -rn "custom_instructions\|business_policies" src/app/api/ src/lib/ 2>&1
```
Documenta cada match.

- [ ] **Step 2: Grep system prompt builders**

Run:
```bash
grep -rn "buildSystemPrompt\|composePrompt\|meerkatSystemPrompt\|role_prompt" src/lib/ src/app/api/ 2>&1
```
Encuentra el archivo canónico. Documenta path exacto.

- [ ] **Step 3: Grep tools de meerkats**

Run:
```bash
find src/lib -name "tools" -type d
grep -rln "custom_instructions\|business_policies" src/lib/*/tools/ 2>&1
```
Documenta tools que consultan campos redundantes.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md
git commit -m "docs(audit): backend agent config redundancy grep"
```

### Task 0.3: Grep Supabase + confirmar nombres

**Files:**
- Modify: `docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md`

- [ ] **Step 1: Inspeccionar tabla de agents en Supabase**

Ejecutar contra Supabase (dev o dashboard):
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'voice_agents'
ORDER BY ordinal_position;

SELECT DISTINCT role FROM voice_agents ORDER BY role;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
ORDER BY ordinal_position;
```
Documenta:
- Tabla real de agentes es `voice_agents` (confirmar) o algo distinto.
- Roster real de roles (verificar contra propuesta en spec Sección 4.2).
- Columnas de `organizations` que pueden ser redundantes.

- [ ] **Step 2: Inspeccionar modelo de embedding en fichas_informativas**

```bash
grep -rn "text-embedding\|voyage\|embedding_model\|embed(" src/lib/fichas-informativas/ src/lib/embeddings/ 2>&1
```
Documenta modelo actual (probablemente OpenAI text-embedding-3-small o Voyage).

- [ ] **Step 3: Confirmar prompt builder canónico**

Del grep del Task 0.2, elegir el archivo canónico. Leerlo completo. Documentar path.

- [ ] **Step 4: Commit auditoría completa**

```bash
git add docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md
git commit -m "docs(audit): supabase columns and canonical paths for agent config redundancy"
```

### Task 0.4: Actualizar spec con hallazgos de auditoría

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md`

**Interfaces:**
- Consumes: auditoría de Tasks 0.1-0.3.
- Produces: Sección 12 del spec actualizada con nombres confirmados.

- [ ] **Step 1: Actualizar Sección 12 del spec con confirmaciones**

Editar la Sección 12 "Puntos abiertos" del spec para reemplazar cada punto con la respuesta confirmada por la auditoría. Ejemplo:

Antes:
> 4. Roster real de meerkats: por confirmar

Después:
> 4. Roster real de meerkats: **confirmado** contra `voice_agents.role DISTINCT`: nala, nia, nox, nash, nova, nelia, neka, noah, navi, nalu (10 slugs).

- [ ] **Step 2: Actualizar seed de whitelist en Sección 4.2 si aplica**

Si el roster real difiere del propuesto, actualizar la tabla en Sección 4.2.

- [ ] **Step 3: Commit spec actualizado**

```bash
git add docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md
git commit -m "docs(spec): incorporate audit findings into open points"
```

---

## Phase 1: Infra base de tags

Migrations Supabase para 5 tablas nuevas + alter fichas. Helpers de whitelist efectiva. Tests contra Supabase real.

### Task 1.1: Migration `ficha_tags` + seed

**Files:**
- Create: `supabase/migrations/2026-09-24-01_ficha_tags.sql`
- Create: `tests/integration/ficha-tags-schema.test.ts`

**Interfaces:**
- Produces: tabla `ficha_tags` con 15 slugs seed.

- [ ] **Step 1: Escribir test que falle (schema no existe)**

`tests/integration/ficha-tags-schema.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createServiceClient } from '@/lib/supabase/service';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

describe('ficha_tags schema', () => {
  beforeAll(async () => {
    await assertNotProdOrAllowed();
  });

  it('has 15 seeded tags in expected order', async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('ficha_tags')
      .select('slug, label_es, orden, active')
      .order('orden', { ascending: true });

    expect(error).toBeNull();
    expect(data).toHaveLength(15);
    expect(data![0].slug).toBe('contabilidad');
    expect(data!.map(t => t.slug)).toEqual([
      'contabilidad', 'cobranza', 'ventas', 'atencion_cliente',
      'catalogo_productos', 'politicas', 'rh', 'operaciones',
      'logistica', 'marketing', 'finanzas', 'legal',
      'fiscal', 'onboarding_clientes', 'soporte_tecnico'
    ]);
    expect(data!.every(t => t.active)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `pnpm vitest run tests/integration/ficha-tags-schema.test.ts`
Expected: FAIL (relation "ficha_tags" does not exist)

- [ ] **Step 3: Escribir migration**

`supabase/migrations/2026-09-24-01_ficha_tags.sql`:
```sql
CREATE TABLE ficha_tags (
  slug        text PRIMARY KEY,
  label_es    text NOT NULL,
  descripcion text,
  orden       int NOT NULL DEFAULT 0,
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ficha_tags (slug, label_es, descripcion, orden) VALUES
  ('contabilidad',        'Contabilidad',           'facturación, CFDI, conciliaciones, régimen fiscal', 10),
  ('cobranza',            'Cobranza',               'mora, recordatorios, pagos vencidos',              20),
  ('ventas',              'Ventas',                 'cotizaciones, precios, ofertas, cierres',          30),
  ('atencion_cliente',    'Atención al cliente',    'tono, quejas, respuestas frecuentes',              40),
  ('catalogo_productos',  'Catálogo de productos',  'SKUs, características, disponibilidad',            50),
  ('politicas',           'Políticas',              'descuentos, devoluciones, garantías',              60),
  ('rh',                  'Recursos humanos',       'empleados, vacaciones, nómina, incidencias',       70),
  ('operaciones',         'Operaciones',            'procesos internos, horarios, ubicaciones',         80),
  ('logistica',           'Logística',              'rutas, envíos, tiempos de entrega',                90),
  ('marketing',           'Marketing',              'campañas, promociones, brand voice',              100),
  ('finanzas',            'Finanzas',               'flujo de caja, cuentas por pagar y cobrar',       110),
  ('legal',               'Legal',                  'contratos, cláusulas, cumplimiento no fiscal',    120),
  ('fiscal',              'Fiscal',                 'régimen, CSDs, PACs, obligaciones SAT',           130),
  ('onboarding_clientes', 'Onboarding de clientes', 'proceso de alta, requisitos, welcome',            140),
  ('soporte_tecnico',     'Soporte técnico',        'fallas, tickets, troubleshooting',                150);
```

- [ ] **Step 4: Aplicar migration en dev**

Run: `pnpm supabase migration up --db-url $SUPABASE_DEV_URL`

Verificar que aplicó:
```bash
psql $SUPABASE_DEV_URL -c "SELECT COUNT(*) FROM ficha_tags"
```
Expected: `count = 15`.

- [ ] **Step 5: Correr test y verificar que pasa**

Run: `pnpm vitest run tests/integration/ficha-tags-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-09-24-01_ficha_tags.sql tests/integration/ficha-tags-schema.test.ts
git commit -m "feat(fichas): create ficha_tags catalog with 15 seeded slugs"
```

### Task 1.2: Migration `role_default_tag_whitelist` + seed

**Files:**
- Create: `supabase/migrations/2026-09-24-02_role_default_tag_whitelist.sql`
- Modify: `tests/integration/ficha-tags-schema.test.ts` (agregar test)

**Interfaces:**
- Consumes: `ficha_tags(slug)` de Task 1.1.
- Produces: tabla `role_default_tag_whitelist` con seeds por rol.

**Nota**: el roster exacto de roles se confirma en la auditoría (Task 0.3). Este task usa el roster asumido en el spec (nala, nia, nox, nash, nova, nelia, neka, noah, navi, nalu). Si la auditoría revela diferencias, ajustar el seed antes de aplicar la migration.

- [ ] **Step 1: Escribir test que falle**

Agregar al archivo existente:
```typescript
it('has role_default_tag_whitelist seeded for all 10 roles', async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('role_default_tag_whitelist')
    .select('role, tag_slug');

  expect(error).toBeNull();
  const rolesSet = new Set(data!.map(r => r.role));
  expect(rolesSet.size).toBe(10);
  expect(rolesSet.has('nala')).toBe(true);
  expect(rolesSet.has('nash')).toBe(true);

  const nalaTagsForRole = data!.filter(r => r.role === 'nala').map(r => r.tag_slug).sort();
  expect(nalaTagsForRole).toEqual(['cobranza', 'contabilidad', 'fiscal', 'politicas', 'ventas']);

  const nashTagsForRole = data!.filter(r => r.role === 'nash').map(r => r.tag_slug);
  expect(nashTagsForRole).toHaveLength(15);
});
```

- [ ] **Step 2: Correr test y verificar que falla**

Run: `pnpm vitest run tests/integration/ficha-tags-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Escribir migration**

`supabase/migrations/2026-09-24-02_role_default_tag_whitelist.sql`:
```sql
CREATE TABLE role_default_tag_whitelist (
  role      text NOT NULL,
  tag_slug  text NOT NULL REFERENCES ficha_tags(slug) ON DELETE RESTRICT,
  PRIMARY KEY (role, tag_slug)
);

-- Nala: facturación
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nala', 'contabilidad'), ('nala', 'cobranza'), ('nala', 'ventas'),
  ('nala', 'politicas'),    ('nala', 'fiscal');

-- Nia: atención al cliente
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nia', 'atencion_cliente'), ('nia', 'catalogo_productos'),
  ('nia', 'politicas'),        ('nia', 'ventas'),
  ('nia', 'onboarding_clientes');

-- Nox: agenda/logística
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nox', 'operaciones'), ('nox', 'logistica'),
  ('nox', 'atencion_cliente'), ('nox', 'politicas');

-- Nash: transversal
INSERT INTO role_default_tag_whitelist (role, tag_slug)
SELECT 'nash', slug FROM ficha_tags;

-- Nova
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nova', 'operaciones'), ('nova', 'logistica');

-- Nelia: incidencias
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nelia', 'atencion_cliente'), ('nelia', 'politicas'),
  ('nelia', 'onboarding_clientes');

-- Neka: interna
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('neka', 'contabilidad'), ('neka', 'cobranza'),
  ('neka', 'fiscal'),       ('neka', 'operaciones');

-- Noah: ventas
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('noah', 'ventas'),      ('noah', 'catalogo_productos'),
  ('noah', 'atencion_cliente'), ('noah', 'marketing');

-- Navi: social/creativo
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('navi', 'marketing'),   ('navi', 'atencion_cliente'),
  ('navi', 'ventas'),      ('navi', 'catalogo_productos');

-- Nalu: tesorero
INSERT INTO role_default_tag_whitelist (role, tag_slug) VALUES
  ('nalu', 'finanzas'),    ('nalu', 'contabilidad'),
  ('nalu', 'fiscal');
```

- [ ] **Step 4: Aplicar migration en dev**

Run: `pnpm supabase migration up`

- [ ] **Step 5: Correr test y verificar que pasa**

Run: `pnpm vitest run tests/integration/ficha-tags-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-09-24-02_role_default_tag_whitelist.sql tests/integration/ficha-tags-schema.test.ts
git commit -m "feat(fichas): seed role default tag whitelist for 10 meerkat roles"
```

### Task 1.3: Migration `org_role_tag_additions` + Alter fichas

**Files:**
- Create: `supabase/migrations/2026-09-24-03_org_role_tag_additions.sql`
- Create: `supabase/migrations/2026-09-24-04_alter_fichas_informativas.sql`
- Modify: `tests/integration/ficha-tags-schema.test.ts`

**Interfaces:**
- Consumes: `organizations(id)`, `users(id)`, `fichas_informativas`, `ficha_tags(slug)`.
- Produces: tabla `org_role_tag_additions` + columnas `tags` y `autotag_status` en `fichas_informativas`.

- [ ] **Step 1: Escribir tests que fallen**

Agregar al archivo:
```typescript
it('accepts org_role_tag_additions insert with fk to ficha_tags', async () => {
  const supabase = createServiceClient();
  // usar un org de test fixture, no real
  const testOrgId = 'test-org-fixtures-uuid';
  const { error } = await supabase
    .from('org_role_tag_additions')
    .upsert({ org_id: testOrgId, role: 'nala', tag_slug: 'rh' });
  expect(error).toBeNull();
});

it('fichas_informativas has tags and autotag_status columns', async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('list_columns', { p_table: 'fichas_informativas' });
  expect(error).toBeNull();
  const columnNames = data!.map((c: any) => c.column_name);
  expect(columnNames).toContain('tags');
  expect(columnNames).toContain('autotag_status');
});
```

Nota: `list_columns` es un RPC helper que puede crearse en migration si no existe. Alternativa: query directa a `information_schema.columns`.

- [ ] **Step 2: Correr tests y verificar que fallan**

Run: `pnpm vitest run tests/integration/ficha-tags-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Escribir migrations**

`supabase/migrations/2026-09-24-03_org_role_tag_additions.sql`:
```sql
CREATE TABLE org_role_tag_additions (
  org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role      text NOT NULL,
  tag_slug  text NOT NULL REFERENCES ficha_tags(slug) ON DELETE RESTRICT,
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid REFERENCES users(id),
  PRIMARY KEY (org_id, role, tag_slug)
);

CREATE INDEX ON org_role_tag_additions (org_id, role);
```

`supabase/migrations/2026-09-24-04_alter_fichas_informativas.sql`:
```sql
ALTER TABLE fichas_informativas
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN autotag_status text NOT NULL DEFAULT 'pending'
    CHECK (autotag_status IN ('pending', 'done', 'manual_override', 'untagged_legacy', 'error'));

CREATE INDEX fichas_informativas_tags_idx ON fichas_informativas USING GIN (tags);
CREATE INDEX fichas_informativas_autotag_pending_idx
  ON fichas_informativas (org_id, autotag_status)
  WHERE autotag_status != 'done';

-- Marcar todas las fichas existentes como legacy pendientes de backfill
UPDATE fichas_informativas
SET autotag_status = 'untagged_legacy',
    tags = ARRAY['_untagged_']
WHERE autotag_status = 'pending' AND tags = '{}';
```

- [ ] **Step 4: Aplicar migrations en dev**

Run:
```bash
pnpm supabase migration up
psql $SUPABASE_DEV_URL -c "SELECT autotag_status, COUNT(*) FROM fichas_informativas GROUP BY autotag_status"
```

Expected: la mayoría de fichas existentes están en `untagged_legacy`.

- [ ] **Step 5: Correr tests y verificar que pasan**

Run: `pnpm vitest run tests/integration/ficha-tags-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-09-24-03_org_role_tag_additions.sql \
        supabase/migrations/2026-09-24-04_alter_fichas_informativas.sql \
        tests/integration/ficha-tags-schema.test.ts
git commit -m "feat(fichas): add org tag additions table and tags/autotag_status columns"
```

### Task 1.4: Helpers de whitelist efectiva

**Files:**
- Create: `src/lib/tags/whitelist.ts`
- Create: `tests/lib/tags/whitelist.test.ts`

**Interfaces:**
- Produces:
  - `async function getEffectiveWhitelist(orgId: string, role: string): Promise<string[]>` — union de `role_default_tag_whitelist(role)` y `org_role_tag_additions(org_id, role)`.
  - `async function addTagToRoleForOrg(orgId: string, role: string, tagSlug: string, addedBy: string): Promise<void>` — solo AGREGA, nunca quita.
  - `async function getAllRoles(): Promise<string[]>` — distinct de `role_default_tag_whitelist.role`.

- [ ] **Step 1: Escribir tests que fallen**

`tests/lib/tags/whitelist.test.ts`:
```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getEffectiveWhitelist, addTagToRoleForOrg, getAllRoles }
  from '@/lib/tags/whitelist';
import { createServiceClient } from '@/lib/supabase/service';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001'; // fixture

describe('whitelist helpers', () => {
  beforeAll(async () => {
    await assertNotProdOrAllowed();
  });

  beforeEach(async () => {
    const supabase = createServiceClient();
    await supabase.from('org_role_tag_additions').delete().eq('org_id', TEST_ORG_ID);
  });

  it('getEffectiveWhitelist returns default when no additions', async () => {
    const result = await getEffectiveWhitelist(TEST_ORG_ID, 'nala');
    expect(result.sort()).toEqual(['cobranza', 'contabilidad', 'fiscal', 'politicas', 'ventas']);
  });

  it('getEffectiveWhitelist returns default ∪ additions', async () => {
    await addTagToRoleForOrg(TEST_ORG_ID, 'nala', 'rh', 'test-user');
    const result = await getEffectiveWhitelist(TEST_ORG_ID, 'nala');
    expect(result).toContain('rh');
    expect(result).toContain('cobranza');
    expect(result.length).toBe(6);
  });

  it('addTagToRoleForOrg is idempotent (double insert doesn\'t throw)', async () => {
    await addTagToRoleForOrg(TEST_ORG_ID, 'nala', 'rh', 'test-user');
    await expect(addTagToRoleForOrg(TEST_ORG_ID, 'nala', 'rh', 'test-user'))
      .resolves.not.toThrow();
  });

  it('getAllRoles returns 10 seeded roles', async () => {
    const roles = await getAllRoles();
    expect(roles.length).toBe(10);
    expect(roles).toContain('nala');
    expect(roles).toContain('nash');
  });
});
```

- [ ] **Step 2: Correr tests y verificar que fallan**

Run: `pnpm vitest run tests/lib/tags/whitelist.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implementar helpers**

`src/lib/tags/whitelist.ts`:
```typescript
import { createServiceClient } from '@/lib/supabase/service';

export async function getEffectiveWhitelist(
  orgId: string,
  role: string
): Promise<string[]> {
  const supabase = createServiceClient();
  const [defaultRes, additionsRes] = await Promise.all([
    supabase.from('role_default_tag_whitelist')
      .select('tag_slug').eq('role', role),
    supabase.from('org_role_tag_additions')
      .select('tag_slug').eq('org_id', orgId).eq('role', role),
  ]);

  if (defaultRes.error) throw defaultRes.error;
  if (additionsRes.error) throw additionsRes.error;

  const combined = new Set<string>([
    ...(defaultRes.data ?? []).map(r => r.tag_slug),
    ...(additionsRes.data ?? []).map(r => r.tag_slug),
  ]);
  return Array.from(combined);
}

export async function addTagToRoleForOrg(
  orgId: string,
  role: string,
  tagSlug: string,
  addedBy: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('org_role_tag_additions')
    .upsert({ org_id: orgId, role, tag_slug: tagSlug, added_by: addedBy });
  if (error) throw error;
}

export async function getAllRoles(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('role_default_tag_whitelist')
    .select('role');
  if (error) throw error;
  return Array.from(new Set((data ?? []).map(r => r.role)));
}
```

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `pnpm vitest run tests/lib/tags/whitelist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tags/whitelist.ts tests/lib/tags/whitelist.test.ts
git commit -m "feat(tags): whitelist helpers with effective union of default+additions"
```

---

## Phase 2: Reglas de operación

### Task 2.1: Migration `agent_rules`

**Files:**
- Create: `supabase/migrations/2026-09-24-05_agent_rules.sql`
- Create: `tests/integration/agent-rules-schema.test.ts`

**Interfaces:**
- Produces: tabla `agent_rules` con schema del spec Sección 4.4.

- [ ] **Step 1: Escribir test que falle**

`tests/integration/agent-rules-schema.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createServiceClient } from '@/lib/supabase/service';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('agent_rules schema', () => {
  beforeAll(async () => { await assertNotProdOrAllowed(); });

  it('inserts a rule with applies_to empty means all', async () => {
    const supabase = createServiceClient();
    const { data, error } = await supabase.from('agent_rules').insert({
      org_id: TEST_ORG_ID,
      regla: 'Nunca ofrecemos descuentos sin aprobación',
      applies_to: [],
    }).select().single();
    expect(error).toBeNull();
    expect(data!.applies_to).toEqual([]);
    expect(data!.active).toBe(true);
  });

  it('rejects regla longer than 500 chars', async () => {
    const supabase = createServiceClient();
    const long = 'x'.repeat(501);
    const { error } = await supabase.from('agent_rules').insert({
      org_id: TEST_ORG_ID, regla: long,
    });
    expect(error).not.toBeNull();
  });

  it('rejects detalles longer than 2000 chars', async () => {
    const supabase = createServiceClient();
    const long = 'x'.repeat(2001);
    const { error } = await supabase.from('agent_rules').insert({
      org_id: TEST_ORG_ID, regla: 'short', detalles: long,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm vitest run tests/integration/agent-rules-schema.test.ts`
Expected: FAIL

- [ ] **Step 3: Escribir migration**

`supabase/migrations/2026-09-24-05_agent_rules.sql`:
```sql
CREATE TABLE agent_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  regla       text NOT NULL CHECK (char_length(regla) BETWEEN 1 AND 500),
  detalles    text CHECK (detalles IS NULL OR char_length(detalles) <= 2000),
  applies_to  text[] NOT NULL DEFAULT '{}',
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id)
);

CREATE INDEX agent_rules_org_active_idx ON agent_rules (org_id, active);
CREATE INDEX agent_rules_applies_to_idx ON agent_rules USING GIN (applies_to);

CREATE TRIGGER agent_rules_updated_at
BEFORE UPDATE ON agent_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- si set_updated_at() no existe, incluir su creación en esta migration
```

- [ ] **Step 4: Aplicar y verificar**

Run: `pnpm supabase migration up`

- [ ] **Step 5: Correr y verificar que pasa**

Run: `pnpm vitest run tests/integration/agent-rules-schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-09-24-05_agent_rules.sql tests/integration/agent-rules-schema.test.ts
git commit -m "feat(rules): agent_rules table with regla, detalles, applies_to"
```

### Task 2.2: Service `agent-rules`

**Files:**
- Create: `src/lib/agent-rules/service.ts`
- Create: `src/lib/agent-rules/validation.ts`
- Create: `tests/lib/agent-rules/service.test.ts`
- Create: `tests/lib/agent-rules/validation.test.ts`

**Interfaces:**
- Consumes: `agent_rules` schema (Task 2.1), `getAllRoles()` (Task 1.4).
- Produces:
  - `AgentRule` type con campos del schema.
  - `async function createRule(input: CreateRuleInput): Promise<AgentRule>` — valida, inserta, cobra 1 op setup.
  - `async function updateRule(id: string, patch: Partial<CreateRuleInput>): Promise<AgentRule>` — sin cobro.
  - `async function deleteRule(id: string): Promise<void>` — sin cobro.
  - `async function listRulesForOrg(orgId: string, opts?: { activeOnly?: boolean }): Promise<AgentRule[]>`.
  - `async function getRulesForAgent(orgId: string, agentSlug: string): Promise<AgentRule[]>` — filtro `applies_to = {} OR agentSlug = ANY(applies_to)`.
  - `validateCreateRuleInput(input): { ok: true } | { ok: false; error: string }` — valida largo, applies_to slugs válidos.

- [ ] **Step 1: Escribir tests de validation que fallen**

`tests/lib/agent-rules/validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateCreateRuleInput } from '@/lib/agent-rules/validation';

describe('validateCreateRuleInput', () => {
  it('accepts valid input', () => {
    expect(validateCreateRuleInput({
      orgId: 'uuid', regla: 'No descuentos', applies_to: [],
    })).toEqual({ ok: true });
  });

  it('rejects empty regla', () => {
    const r = validateCreateRuleInput({ orgId: 'uuid', regla: '', applies_to: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects regla > 500 chars', () => {
    const r = validateCreateRuleInput({
      orgId: 'uuid', regla: 'x'.repeat(501), applies_to: [],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects applies_to with non-existent role slug', async () => {
    const r = await validateCreateRuleInput({
      orgId: 'uuid', regla: 'test', applies_to: ['nala', 'agente-fantasma'],
    }, { rosterCheck: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('agente-fantasma');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `pnpm vitest run tests/lib/agent-rules/validation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar validation**

`src/lib/agent-rules/validation.ts`:
```typescript
import { getAllRoles } from '@/lib/tags/whitelist';

export interface CreateRuleInput {
  orgId: string;
  regla: string;
  detalles?: string;
  applies_to: string[];
  created_by?: string;
}

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function validateCreateRuleInput(
  input: CreateRuleInput,
  opts: { rosterCheck?: boolean } = {}
): Promise<ValidationResult> {
  if (!input.regla || input.regla.trim().length === 0) {
    return { ok: false, error: 'La regla no puede estar vacía' };
  }
  if (input.regla.length > 500) {
    return { ok: false, error: 'La regla no puede tener más de 500 caracteres' };
  }
  if (input.detalles && input.detalles.length > 2000) {
    return { ok: false, error: 'Los detalles no pueden tener más de 2000 caracteres' };
  }
  if (opts.rosterCheck && input.applies_to.length > 0) {
    const roster = await getAllRoles();
    const invalid = input.applies_to.filter(slug => !roster.includes(slug));
    if (invalid.length > 0) {
      return { ok: false, error: `Empleados no válidos: ${invalid.join(', ')}` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `pnpm vitest run tests/lib/agent-rules/validation.test.ts`
Expected: PASS

- [ ] **Step 5: Escribir tests de service que fallen**

`tests/lib/agent-rules/service.test.ts`:
```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createRule, listRulesForOrg, getRulesForAgent, updateRule, deleteRule }
  from '@/lib/agent-rules/service';
import { createServiceClient } from '@/lib/supabase/service';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('agent-rules service', () => {
  beforeAll(async () => { await assertNotProdOrAllowed(); });
  beforeEach(async () => {
    const supabase = createServiceClient();
    await supabase.from('agent_rules').delete().eq('org_id', TEST_ORG_ID);
  });

  it('createRule inserts and returns row + charges 1 op', async () => {
    const rule = await createRule({
      orgId: TEST_ORG_ID,
      regla: 'Nunca ofrecemos descuentos sin aprobación',
      applies_to: [],
    });
    expect(rule.id).toBeTruthy();
    expect(rule.applies_to).toEqual([]);
    // verify ledger has entry with reason='rule_setup'
    const supabase = createServiceClient();
    const { data: ledger } = await supabase.from('ops_log')
      .select('*').eq('reason', 'rule_setup')
      .contains('metadata', { rule_id: rule.id });
    expect(ledger?.length).toBe(1);
  });

  it('getRulesForAgent returns applies_to=empty + rules for slug', async () => {
    await createRule({ orgId: TEST_ORG_ID, regla: 'r1 all', applies_to: [] });
    await createRule({ orgId: TEST_ORG_ID, regla: 'r2 nala', applies_to: ['nala'] });
    await createRule({ orgId: TEST_ORG_ID, regla: 'r3 nia', applies_to: ['nia'] });

    const forNala = await getRulesForAgent(TEST_ORG_ID, 'nala');
    expect(forNala.length).toBe(2); // r1 (all) + r2 (nala)
    expect(forNala.map(r => r.regla).sort()).toEqual(['r1 all', 'r2 nala']);
  });

  it('createRule rejects applies_to with invalid slug', async () => {
    await expect(createRule({
      orgId: TEST_ORG_ID,
      regla: 'test',
      applies_to: ['nala', 'agente-fantasma'],
    })).rejects.toThrow(/agente-fantasma/);
  });

  it('updateRule does NOT charge new op', async () => {
    const rule = await createRule({ orgId: TEST_ORG_ID, regla: 'original', applies_to: [] });
    const supabase = createServiceClient();
    const { count: before } = await supabase.from('ops_log').select('*', { count: 'exact', head: true })
      .contains('metadata', { rule_id: rule.id });
    await updateRule(rule.id, { regla: 'editada' });
    const { count: after } = await supabase.from('ops_log').select('*', { count: 'exact', head: true })
      .contains('metadata', { rule_id: rule.id });
    expect(after).toBe(before); // NO new charge for edit
  });
});
```

- [ ] **Step 6: Correr y verificar que fallan**

Run: `pnpm vitest run tests/lib/agent-rules/service.test.ts`
Expected: FAIL

- [ ] **Step 7: Implementar service**

`src/lib/agent-rules/service.ts`:
```typescript
import { createServiceClient } from '@/lib/supabase/service';
import { chargePool } from '@/lib/pool/ledger';
import { validateCreateRuleInput, type CreateRuleInput } from './validation';

export interface AgentRule {
  id: string;
  org_id: string;
  regla: string;
  detalles: string | null;
  applies_to: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export async function createRule(input: CreateRuleInput): Promise<AgentRule> {
  const validation = await validateCreateRuleInput(input, { rosterCheck: true });
  if (!validation.ok) throw new Error(validation.error);

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('agent_rules').insert({
    org_id: input.orgId,
    regla: input.regla,
    detalles: input.detalles ?? null,
    applies_to: input.applies_to,
    created_by: input.created_by ?? null,
  }).select().single();
  if (error) throw error;

  await chargePool({
    orgId: input.orgId,
    reason: 'rule_setup',
    count: 1,
    metadata: { rule_id: data.id, applies_to: input.applies_to },
  });

  return data as AgentRule;
}

export async function updateRule(
  id: string,
  patch: Partial<CreateRuleInput>
): Promise<AgentRule> {
  const supabase = createServiceClient();
  const updateData: any = {};
  if (patch.regla !== undefined) updateData.regla = patch.regla;
  if (patch.detalles !== undefined) updateData.detalles = patch.detalles;
  if (patch.applies_to !== undefined) updateData.applies_to = patch.applies_to;
  const { data, error } = await supabase.from('agent_rules')
    .update(updateData).eq('id', id).select().single();
  if (error) throw error;
  return data as AgentRule;
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('agent_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function listRulesForOrg(
  orgId: string,
  opts: { activeOnly?: boolean } = {}
): Promise<AgentRule[]> {
  const supabase = createServiceClient();
  let query = supabase.from('agent_rules').select('*').eq('org_id', orgId);
  if (opts.activeOnly) query = query.eq('active', true);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data as AgentRule[];
}

export async function getRulesForAgent(
  orgId: string,
  agentSlug: string
): Promise<AgentRule[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('get_rules_for_agent', {
    p_org_id: orgId,
    p_agent_slug: agentSlug,
  });
  if (error) throw error;
  return data as AgentRule[];
}
```

Y una migration menor para el RPC helper `get_rules_for_agent`:

`supabase/migrations/2026-09-24-05b_get_rules_for_agent_rpc.sql`:
```sql
CREATE OR REPLACE FUNCTION get_rules_for_agent(p_org_id uuid, p_agent_slug text)
RETURNS SETOF agent_rules AS $$
  SELECT * FROM agent_rules
  WHERE org_id = p_org_id
    AND active = true
    AND (applies_to = '{}' OR p_agent_slug = ANY(applies_to))
  ORDER BY created_at DESC
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 8: Aplicar migration adicional y correr tests**

Run:
```bash
pnpm supabase migration up
pnpm vitest run tests/lib/agent-rules/service.test.ts
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent-rules/ tests/lib/agent-rules/ supabase/migrations/2026-09-24-05b_get_rules_for_agent_rpc.sql
git commit -m "feat(rules): agent-rules service with validation, ledger charge, and per-agent filter"
```

### Task 2.3: API endpoints para reglas

**Files:**
- Create: `src/app/api/agent-rules/route.ts` (GET list, POST create)
- Create: `src/app/api/agent-rules/[id]/route.ts` (GET, PATCH, DELETE)
- Create: `tests/integration/agent-rules-endpoints.test.ts`

**Interfaces:**
- Consumes: service de Task 2.2.
- Produces: 4 endpoints REST.

- [ ] **Step 1: Escribir test que falle**

`tests/integration/agent-rules-endpoints.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { getTestAuthToken } from '@/lib/test-helpers/auth';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

describe('agent-rules endpoints', () => {
  beforeAll(async () => { await assertNotProdOrAllowed(); });

  it('POST /api/agent-rules creates rule when authenticated', async () => {
    const token = await getTestAuthToken();
    const res = await fetch(`${BASE}/api/agent-rules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        regla: 'No descuentos sin aprobación',
        applies_to: [],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.regla).toBe('No descuentos sin aprobación');
  });

  it('POST rejects unauthenticated', async () => {
    const res = await fetch(`${BASE}/api/agent-rules`, {
      method: 'POST',
      body: JSON.stringify({ regla: 'x', applies_to: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/agent-rules lists rules for org', async () => {
    const token = await getTestAuthToken();
    const res = await fetch(`${BASE}/api/agent-rules`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rules)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm dev` en background, luego `pnpm vitest run tests/integration/agent-rules-endpoints.test.ts`
Expected: FAIL (404 or route not found)

- [ ] **Step 3: Implementar route.ts**

`src/app/api/agent-rules/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRule, listRulesForOrg } from '@/lib/agent-rules/service';
import { authenticateRequest } from '@/lib/auth/authenticate-request'; // convención existente

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const activeOnly = request.nextUrl.searchParams.get('active') === 'true';
  const rules = await listRulesForOrg(auth.orgId, { activeOnly });
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await request.json();
  try {
    const rule = await createRule({
      orgId: auth.orgId,
      regla: body.regla,
      detalles: body.detalles,
      applies_to: body.applies_to ?? [],
      created_by: auth.userId,
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
```

`src/app/api/agent-rules/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { updateRule, deleteRule } from '@/lib/agent-rules/service';
import { authenticateRequest } from '@/lib/auth/authenticate-request';
import { createServiceClient } from '@/lib/supabase/service';

async function verifyOwnership(id: string, orgId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('agent_rules')
    .select('org_id').eq('id', id).single();
  return data?.org_id === orgId;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!await verifyOwnership(params.id, auth.orgId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const supabase = createServiceClient();
  const { data } = await supabase.from('agent_rules').select('*').eq('id', params.id).single();
  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!await verifyOwnership(params.id, auth.orgId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const patch = await request.json();
  try {
    const rule = await updateRule(params.id, patch);
    return NextResponse.json(rule);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (!await verifyOwnership(params.id, auth.orgId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await deleteRule(params.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `pnpm vitest run tests/integration/agent-rules-endpoints.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent-rules/ tests/integration/agent-rules-endpoints.test.ts
git commit -m "feat(rules): REST endpoints POST/GET/PATCH/DELETE with org ownership guard"
```

### Task 2.4: Cache de reglas + invalidación

**Files:**
- Create: `src/lib/agent-rules/cache.ts`
- Create: `tests/lib/agent-rules/cache.test.ts`
- Modify: `src/lib/agent-rules/service.ts` (invalidar cache al crear/actualizar/eliminar)

**Interfaces:**
- Produces:
  - `async function getCachedRulesForAgent(orgId, agentSlug): Promise<AgentRule[]>` — cache TTL 5 min.
  - `async function invalidateRulesCache(orgId): Promise<void>` — se llama en create/update/delete.

- [ ] **Step 1: Escribir test que falle**

`tests/lib/agent-rules/cache.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedRulesForAgent, invalidateRulesCache } from '@/lib/agent-rules/cache';
import * as service from '@/lib/agent-rules/service';

describe('rules cache', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('hits service on first call, cache on second', async () => {
    const spy = vi.spyOn(service, 'getRulesForAgent').mockResolvedValue([]);
    await getCachedRulesForAgent('org1', 'nala');
    await getCachedRulesForAgent('org1', 'nala');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('invalidateRulesCache forces service call', async () => {
    const spy = vi.spyOn(service, 'getRulesForAgent').mockResolvedValue([]);
    await getCachedRulesForAgent('org1', 'nala');
    await invalidateRulesCache('org1');
    await getCachedRulesForAgent('org1', 'nala');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm vitest run tests/lib/agent-rules/cache.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar cache**

`src/lib/agent-rules/cache.ts`:
```typescript
import { getRulesForAgent, type AgentRule } from './service';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { rules: AgentRule[]; expiresAt: number }>();

function key(orgId: string, agentSlug: string): string {
  return `${orgId}:${agentSlug}`;
}

export async function getCachedRulesForAgent(
  orgId: string,
  agentSlug: string
): Promise<AgentRule[]> {
  const k = key(orgId, agentSlug);
  const cached = cache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;
  const rules = await getRulesForAgent(orgId, agentSlug);
  cache.set(k, { rules, expiresAt: Date.now() + TTL_MS });
  return rules;
}

export async function invalidateRulesCache(orgId: string): Promise<void> {
  for (const k of cache.keys()) {
    if (k.startsWith(`${orgId}:`)) cache.delete(k);
  }
}
```

- [ ] **Step 4: Modificar service.ts para invalidar cache**

En `src/lib/agent-rules/service.ts`, después de cada `createRule`, `updateRule`, `deleteRule`, llamar `await invalidateRulesCache(orgId)`. Import agregado.

- [ ] **Step 5: Correr tests y verificar que pasan**

Run: `pnpm vitest run tests/lib/agent-rules/cache.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-rules/cache.ts src/lib/agent-rules/service.ts tests/lib/agent-rules/cache.test.ts
git commit -m "feat(rules): in-memory cache with 5min TTL and mutation invalidation"
```

### Task 2.5: Integrar bloque de reglas en prompt builder

**Files:**
- Modify: prompt builder canónico (path exacto de auditoría Task 0.2, ejemplo: `src/lib/prompts/meerkat-system-prompt.ts`)
- Create: `tests/integration/prompt-builder-rules.test.ts`

**Interfaces:**
- Consumes: `getCachedRulesForAgent()` (Task 2.4).
- Produces: bloque markdown `## Reglas de tu negocio (respétalas siempre)` en el system prompt.

- [ ] **Step 1: Leer el prompt builder canónico**

Read el path identificado en auditoría 0.2. Documentar en el archivo dónde se inyecta el bloque nuevo (después del "base del rol", antes de "tareas titulares" y "fichas informativas").

- [ ] **Step 2: Escribir test que falle**

`tests/integration/prompt-builder-rules.test.ts`:
```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildMeerkatSystemPrompt } from '@/lib/prompts/meerkat-system-prompt';
import { createRule } from '@/lib/agent-rules/service';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { createServiceClient } from '@/lib/supabase/service';

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

describe('prompt builder includes rules', () => {
  beforeAll(async () => { await assertNotProdOrAllowed(); });
  beforeEach(async () => {
    const supabase = createServiceClient();
    await supabase.from('agent_rules').delete().eq('org_id', TEST_ORG_ID);
  });

  it('injects "Reglas de tu negocio" block when rules exist', async () => {
    await createRule({ orgId: TEST_ORG_ID, regla: 'No descuentos', applies_to: [] });
    const prompt = await buildMeerkatSystemPrompt({
      orgId: TEST_ORG_ID, agentSlug: 'nala',
    });
    expect(prompt).toContain('## Reglas de tu negocio');
    expect(prompt).toContain('No descuentos');
  });

  it('does NOT inject block when no rules', async () => {
    const prompt = await buildMeerkatSystemPrompt({
      orgId: TEST_ORG_ID, agentSlug: 'nala',
    });
    expect(prompt).not.toContain('## Reglas de tu negocio');
  });

  it('filters rules by applies_to', async () => {
    await createRule({ orgId: TEST_ORG_ID, regla: 'para nia', applies_to: ['nia'] });
    await createRule({ orgId: TEST_ORG_ID, regla: 'para todos', applies_to: [] });
    const prompt = await buildMeerkatSystemPrompt({
      orgId: TEST_ORG_ID, agentSlug: 'nala',
    });
    expect(prompt).toContain('para todos');
    expect(prompt).not.toContain('para nia');
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `pnpm vitest run tests/integration/prompt-builder-rules.test.ts`
Expected: FAIL

- [ ] **Step 4: Modificar prompt builder**

En el prompt builder canónico, después del bloque base del rol y antes de otros bloques, agregar:

```typescript
import { getCachedRulesForAgent } from '@/lib/agent-rules/cache';

// dentro de buildMeerkatSystemPrompt:
const rules = await getCachedRulesForAgent(orgId, agentSlug);
if (rules.length > 0) {
  const rulesBlock = [
    '## Reglas de tu negocio (respétalas siempre)',
    ...rules.map(r => {
      const line = `- ${r.regla}`;
      return r.detalles ? `${line}\n  Detalles: ${r.detalles}` : line;
    }),
  ].join('\n');
  promptParts.push(rulesBlock);
}
```

Adaptar a la convención del builder (nombres de variables, cómo se concatenan los bloques).

- [ ] **Step 5: Correr tests y verificar que pasan**

Run: `pnpm vitest run tests/integration/prompt-builder-rules.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompts/meerkat-system-prompt.ts tests/integration/prompt-builder-rules.test.ts
git commit -m "feat(rules): inject 'Reglas de tu negocio' block into meerkat system prompt"
```

---

## Phase 3: Tareas programadas

### Task 3.1: Migration `agent_tasks` + `agent_task_runs`

**Files:**
- Create: `supabase/migrations/2026-09-24-06_agent_tasks_and_runs.sql`
- Create: `tests/integration/agent-tasks-schema.test.ts`

**Interfaces:**
- Produces: tablas `agent_tasks` y `agent_task_runs` con schema del spec 4.5/4.6.

- [ ] **Step 1: Escribir tests que fallen**

Similar a Task 2.1 pero para `agent_tasks`. Test inserts con cada `trigger_type`, valida `trigger_config` jsonb, valida UNIQUE `(owner_agent_id, slug)`. Test `agent_task_runs` inserts.

- [ ] **Step 2: Correr y verificar falla**

Run: `pnpm vitest run tests/integration/agent-tasks-schema.test.ts`

- [ ] **Step 3: Escribir migration**

`supabase/migrations/2026-09-24-06_agent_tasks_and_runs.sql`:
```sql
CREATE TYPE task_trigger_type AS ENUM ('cron', 'manual', 'phrase');

CREATE TABLE agent_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_agent_id  uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  mission         text NOT NULL,
  trigger_type    task_trigger_type NOT NULL,
  trigger_config  jsonb NOT NULL DEFAULT '{}',
  parameters      text,
  deliverable     text NOT NULL,
  active          bool NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id),
  UNIQUE (owner_agent_id, slug)
);

CREATE INDEX ON agent_tasks (owner_agent_id, active);
CREATE INDEX agent_tasks_cron_active_idx ON agent_tasks (trigger_type, active)
  WHERE trigger_type = 'cron' AND active = true;

CREATE TRIGGER agent_tasks_updated_at
BEFORE UPDATE ON agent_tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_task_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('running', 'success', 'error', 'cancelled')),
  trigger_source text NOT NULL CHECK (trigger_source IN ('cron', 'phrase', 'manual')),
  ledger_ops     int NOT NULL DEFAULT 0,
  error_message  text,
  metadata       jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX ON agent_task_runs (task_id, started_at DESC);
```

- [ ] **Step 4: Aplicar y correr tests**

Run: `pnpm supabase migration up && pnpm vitest run tests/integration/agent-tasks-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-09-24-06_agent_tasks_and_runs.sql tests/integration/agent-tasks-schema.test.ts
git commit -m "feat(tasks): agent_tasks and agent_task_runs tables with trigger types"
```

### Task 3.2: Service `agent-tasks` + validación

**Files:**
- Create: `src/lib/agent-tasks/service.ts`
- Create: `src/lib/agent-tasks/validation.ts`
- Create: `tests/lib/agent-tasks/service.test.ts`
- Create: `tests/lib/agent-tasks/validation.test.ts`

**Interfaces:**
- Consumes: `agent_tasks` schema (3.1), `chargePool()`.
- Produces:
  - `AgentTask` type.
  - `createTask(input)`, `updateTask(id, patch)`, `deleteTask(id)`, `listTasksForAgent(agentId)`.
  - `validateCreateTaskInput(input)` — valida cron expression con `cron-parser`, valida phrase no vacío, valida slug único, valida ownership de agent_id contra org_id.

Estructura similar a Task 2.2. La diferencia clave: `validateCreateTaskInput` debe usar la librería `cron-parser` (ya usada en Centinelia según memoria) para validar `trigger_config.cron` cuando `trigger_type = 'cron'`.

- [ ] **Step 1-6**: mismo patrón TDD que Task 2.2. Detalles del código: seguir el service de rules como plantilla. Adaptar campos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent-tasks/ tests/lib/agent-tasks/
git commit -m "feat(tasks): agent-tasks service with cron validation and org guard"
```

### Task 3.3: Endpoints API para tareas

**Files:**
- Create: `src/app/api/agent-tasks/route.ts`
- Create: `src/app/api/agent-tasks/[id]/route.ts`
- Create: `src/app/api/agent-tasks/[id]/execute/route.ts` (manual trigger)
- Create: `tests/integration/agent-tasks-endpoints.test.ts`

**Interfaces:**
- Consumes: service (3.2).
- Produces: 5 endpoints (POST list/create, GET/PATCH/DELETE por id, POST execute).

Mismo patrón que Task 2.3. Manual trigger POST `/execute` llama al executor de Task 3.6.

- [ ] **Step 1-4**: TDD estándar.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent-tasks/ tests/integration/agent-tasks-endpoints.test.ts
git commit -m "feat(tasks): REST endpoints with manual execute trigger"
```

### Task 3.4: Cron scheduler para tasks

**Files:**
- Create: `src/app/api/cron/agent-tasks-scheduler/route.ts`
- Modify: `vercel.json` (agregar cron entry, hourly)
- Create: `tests/integration/agent-tasks-scheduler.test.ts`

**Interfaces:**
- Consumes: `agent_tasks` con `trigger_type='cron'`, feature flag `agent_missions_enabled`, executor (3.6).
- Produces: endpoint cron que evalúa `next_run_at <= now()` para cada tarea activa y dispara ejecución.

- [ ] **Step 1: Escribir test que falle**

`tests/integration/agent-tasks-scheduler.test.ts`:
```typescript
describe('agent-tasks scheduler', () => {
  it('runs pending cron tasks for orgs with agent_missions_enabled=true', async () => {
    // seed: 1 task with cron `* * * * *` (every minute), next_run_at 1 hour ago
    // seed: org with agent_missions_enabled=true
    // GET /api/cron/agent-tasks-scheduler
    // expect status 200, task_run created with status=running or success
  });

  it('SKIPS cron tasks for orgs with agent_missions_enabled=false', async () => {
    // seed: 1 task with cron, next_run_at 1 hour ago
    // seed: org with agent_missions_enabled=false
    // GET /api/cron/agent-tasks-scheduler
    // expect NO task_run created for this task
  });

  it('updates next_run_at after execution', async () => {
    // ...
  });
});
```

- [ ] **Step 2-4**: TDD.

- [ ] **Step 3: Implementar scheduler**

`src/app/api/cron/agent-tasks-scheduler/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth/cron-secret';
import { createServiceClient } from '@/lib/supabase/service';
import { executeTask } from '@/lib/agent-tasks/executor';
import { isFeatureEnabled } from '@/lib/feature-flags/agent-missions';
import cronParser from 'cron-parser';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: tasks, error } = await supabase
    .from('agent_tasks')
    .select('*, organizations(id, features)')
    .eq('trigger_type', 'cron')
    .eq('active', true)
    .filter('trigger_config->>next_run_at', 'lte', now);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const results = { executed: 0, skipped_flag_off: 0, errors: [] as any[] };
  for (const task of tasks ?? []) {
    if (!isFeatureEnabled(task.organizations, 'agent_missions_enabled')) {
      results.skipped_flag_off++;
      continue;
    }
    try {
      await executeTask({ taskId: task.id, triggerSource: 'cron' });
      const interval = cronParser.parseExpression(
        task.trigger_config.cron,
        { tz: task.trigger_config.timezone ?? 'America/Monterrey' }
      );
      await supabase.from('agent_tasks').update({
        trigger_config: {
          ...task.trigger_config,
          next_run_at: interval.next().toISOString(),
        },
      }).eq('id', task.id);
      results.executed++;
    } catch (e: any) {
      results.errors.push({ task_id: task.id, error: e.message });
    }
  }
  return NextResponse.json(results);
}
```

- [ ] **Step 4: Agregar entry en vercel.json**

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/agent-tasks-scheduler", "schedule": "* * * * *" }
  ]
}
```
Nota: `* * * * *` es cada minuto. Si Vercel plan no soporta esa granularidad, usar `*/5 * * * *` (cada 5 min).

- [ ] **Step 5-6**: correr tests, commit.

```bash
git add src/app/api/cron/agent-tasks-scheduler/ vercel.json tests/integration/agent-tasks-scheduler.test.ts
git commit -m "feat(tasks): cron scheduler respects agent_missions_enabled flag"
```

### Task 3.5: Phrase matcher

**Files:**
- Create: `src/lib/agent-tasks/phrase-matcher.ts`
- Create: `tests/lib/agent-tasks/phrase-matcher.test.ts`
- Modify: meerkat tool loop (path canónico de auditoría) para invocar phrase-matcher antes de responder

**Interfaces:**
- Produces:
  - `async function matchPhraseToTask(agentId, userMessage): Promise<{ taskId, matchedPhrase } | null>` — busca en `agent_tasks` con `trigger_type='phrase'` para el agent, matches semánticos + literales.

- [ ] **Step 1: Escribir test que falle**

```typescript
describe('phrase matcher', () => {
  it('matches literal phrase in userMessage', async () => {
    // seed task with trigger_config = { phrases: ['cobra a los morosos'], match_mode: 'literal' }
    const result = await matchPhraseToTask(agentId, 'oye, cobra a los morosos por favor');
    expect(result?.taskId).toBe(taskId);
  });

  it('does not match unrelated phrase', async () => {
    const result = await matchPhraseToTask(agentId, 'buen día');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2-4**: TDD.

- [ ] **Step 5: Modificar tool loop del meerkat**

En el tool loop canónico (path exacto de auditoría 0.2), antes de invocar el LLM principal, chequear si el userMessage matchea alguna phrase task del agente. Si matchea, invocar `executeTask({ taskId, triggerSource: 'phrase' })` en vez de la conversación normal (o después, según diseño de UX).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-tasks/phrase-matcher.ts tests/lib/agent-tasks/phrase-matcher.test.ts
git commit -m "feat(tasks): phrase matcher intercepts user message and triggers matching task"
```

### Task 3.6: Executor de tarea

**Files:**
- Create: `src/lib/agent-tasks/executor.ts`
- Create: `tests/integration/agent-tasks-executor.test.ts`

**Interfaces:**
- Consumes: `agent_tasks` (3.1), `agent_task_runs` (3.1), Anthropic Claude, `chargePool()`, `logLlmCall`.
- Produces:
  - `async function executeTask(input: { taskId, triggerSource }): Promise<{ runId, status }>`.
  - Inserta `agent_task_runs` con `status='running'`, carga contexto del meerkat + parameters + deliverable, invoca Claude, agrega side-effects al ledger via `batched-consume`, marca run como `success` o `error`.

- [ ] **Step 1: Escribir tests que fallen (incluye Review Focus #5)**

```typescript
describe('executeTask', () => {
  it('creates task_execution_start ledger entry on start', async () => {});
  it('creates task_action ledger entry with count=N for N side-effects', async () => {});
  it('marks run as error if LLM fails, still charges start op', async () => {});
  it('rejects execution if org pool exhausted; alerts client; charges only start', async () => {
    // Review Focus #5: seed org with pool_remaining = 0, verify task doesn't run side-effects
  });
  it('rejects execution if agent_missions_enabled=false', async () => {});
});
```

- [ ] **Step 2-4**: TDD estándar.

- [ ] **Step 3: Implementación básica del executor**

```typescript
export async function executeTask(
  input: { taskId: string; triggerSource: 'cron' | 'phrase' | 'manual' }
): Promise<{ runId: string; status: string }> {
  // 1. Load task + org, check feature flag
  // 2. Check pool: if 0 available, log alert, don't execute, return status=cancelled
  // 3. Insert task_run with status='running'
  // 4. Charge 1 op with reason='task_execution_start' + metadata
  // 5. Compose execution context: mission + parameters + deliverable + reglas + fichas
  // 6. Invoke Claude with logLlmCall
  // 7. Execute side-effects returned by tool calls; count them
  // 8. Batched-consume 'task_action' with count=N
  // 9. Update task_run: finished_at, status, ledger_ops
  // 10. Return
}
```

- [ ] **Step 5-6**: correr tests, commit.

```bash
git add src/lib/agent-tasks/executor.ts tests/integration/agent-tasks-executor.test.ts
git commit -m "feat(tasks): executor with pool guard, feature flag, ledger start+batched actions"
```

### Task 3.7: Bloque de tareas titulares en prompt builder

**Files:**
- Modify: prompt builder canónico
- Create: `tests/integration/prompt-builder-tasks.test.ts`

Similar a Task 2.5 pero para tareas. Inyecta bloque:
```
## Tareas que puedes ejecutar
- slug: mission (dispara: [cron legible | frase | solo manual])
```

- [ ] **Step 1-5**: TDD.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompts/meerkat-system-prompt.ts tests/integration/prompt-builder-tasks.test.ts
git commit -m "feat(tasks): inject task titles block into meerkat system prompt"
```

---

## Phase 4: Retrieval nuevo con tags

### Task 4.1: Refactor retrieval con pre-filtro por whitelist

**Files:**
- Modify: `src/lib/fichas-informativas/retrieval.ts` (path exacto de auditoría)
- Create: `tests/integration/retrieval-v2-prefilter.test.ts`

**Interfaces:**
- Consumes: `getEffectiveWhitelist` (1.4), `fichas_informativas.tags` (1.3).
- Produces: retrieval en dos pasos (pre-filtro SQL + semantic search), sin rerank todavía.

- [ ] **Step 1: Escribir test que falle**

```typescript
describe('retrieval v2 pre-filter', () => {
  it('filters fichas by whitelist tags before semantic search', async () => {
    // seed: 2 fichas taggeadas ['contabilidad'], 2 taggeadas ['rh']
    // nala whitelist NO tiene 'rh'
    // query "cliente moroso"
    // expect only contabilidad fichas in candidates before semantic ranking
  });

  it('includes _untagged_ fichas in candidates', async () => {
    // seed: 1 ficha with tags=['_untagged_'] autotag_status='untagged_legacy'
    // expect it's in candidates
  });

  it('falls back to no-filter when whitelist matches 0 fichas', async () => {
    // seed: all fichas taggeadas ['rh'], meerkat is nala (no 'rh' in whitelist)
    // expect fallback: retrieval returns fichas anyway, warning log emitted
  });
});
```

Nota: el test del fallback cubre Review Focus #4.

- [ ] **Step 2-5**: TDD.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fichas-informativas/retrieval.ts tests/integration/retrieval-v2-prefilter.test.ts
git commit -m "feat(retrieval): two-stage retrieval with tag whitelist pre-filter and fallback"
```

### Task 4.2: Rerank con Haiku

**Files:**
- Create: `src/lib/fichas-informativas/rerank.ts`
- Create: `tests/lib/fichas-informativas/rerank.test.ts`
- Modify: `src/lib/fichas-informativas/retrieval.ts` (integrar rerank condicional)

**Interfaces:**
- Consumes: Anthropic Claude Haiku, feature flag `rerank_enabled`, threshold de fichas y de distancia.
- Produces: `async function rerankCandidates(query, candidates): Promise<Ficha[]>` — llamada a Haiku, devuelve top-5 IDs.

- [ ] **Step 1-4**: TDD.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fichas-informativas/rerank.ts src/lib/fichas-informativas/retrieval.ts tests/lib/fichas-informativas/rerank.test.ts
git commit -m "feat(retrieval): conditional Haiku rerank when noisy top-K detected"
```

### Task 4.3: Fallbacks completos + eval infra

**Files:**
- Create: `src/lib/fichas-informativas/fallbacks.ts`
- Create: `tests/integration/retrieval-fallbacks.test.ts`

**Interfaces:**
- Produces:
  - `async function tsvectorFallback(orgId, query, limit): Promise<Ficha[]>` — Postgres FTS cuando embedding falla.
  - `async function updatedAtFallback(orgId, limit): Promise<Ficha[]>` — top-N por updated_at cuando todo falla.

- [ ] **Step 1-4**: TDD. Tests que cubren:
  - Whitelist vacía + fallback (Review Focus #4 confirmar).
  - Embedding falla → tsvector.
  - Rerank falla → devolver top-K semánticos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fichas-informativas/fallbacks.ts tests/integration/retrieval-fallbacks.test.ts
git commit -m "feat(retrieval): tsvector and updated_at fallbacks with warning logs"
```

---

## Phase 5: UI Portal

### Task 5.1: Sección "Reglas del negocio"

**Files:**
- Create: `src/app/portal/reglas/page.tsx`
- Create: `src/app/portal/reglas/components/RuleCard.tsx`
- Create: `src/app/portal/reglas/components/NewRuleModal.tsx`
- Create: `src/app/portal/reglas/components/AppliesToMultiSelect.tsx`
- Create: `tests/e2e/portal-reglas.spec.ts` (Playwright)

**Interfaces:**
- Consumes: endpoints de Task 2.3.
- Produces: UI para CRUD de reglas, respeta Global Constraints de copy (español completo, sin em-dash, sin IA).

- [ ] **Step 1: Escribir e2e test que falle**

`tests/e2e/portal-reglas.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('cliente puede crear, editar y desactivar una regla', async ({ page }) => {
  await page.goto('/portal/reglas');
  await page.getByRole('button', { name: /nueva regla/i }).click();
  await page.getByLabel('Regla').fill('Nunca ofrecemos descuentos sin aprobación');
  await page.getByRole('button', { name: /guardar/i }).click();
  await expect(page.getByText('Nunca ofrecemos descuentos sin aprobación')).toBeVisible();
});
```

- [ ] **Step 2-4**: TDD estándar. Copy visible cumple Global Constraints.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/reglas/ tests/e2e/portal-reglas.spec.ts
git commit -m "feat(portal): Reglas del negocio section with CRUD UI"
```

### Task 5.2: Sección "Tareas de meerkat"

**Files:**
- Create: `src/app/portal/meerkats/[slug]/tareas/page.tsx`
- Create: `src/app/portal/meerkats/[slug]/tareas/components/*.tsx`
- Create: `tests/e2e/portal-tareas.spec.ts`

Wizard corto de 4 sub-pasos MAPS. Similar patrón a Task 5.1 pero con el wizard interno.

- [ ] **Step 1-4**: TDD estándar. Botón "Ejecutar ahora" invoca `POST /api/agent-tasks/[id]/execute`.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/meerkats/[slug]/tareas/ tests/e2e/portal-tareas.spec.ts
git commit -m "feat(portal): Tareas section per meerkat with MAPS wizard"
```

### Task 5.3: Onboarding wizard

**Files:**
- Create: `src/app/portal/onboarding-wizard/page.tsx`
- Create: `src/app/portal/onboarding-wizard/steps/{1,2,3,4}.tsx`
- Create: `tests/e2e/portal-onboarding-wizard.spec.ts`

Wizard de 4 pantallas del spec Sección 7.1.

- [ ] **Step 1-5**: TDD estándar.

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/onboarding-wizard/ tests/e2e/portal-onboarding-wizard.spec.ts
git commit -m "feat(portal): onboarding wizard with 4 screens (welcome, rules, tasks, review)"
```

### Task 5.4: Upgrade modal "Nueva ficha informativa"

**Files:**
- Modify: modal existente (path exacto de auditoría 0.1)
- Create: `src/app/portal/fichas/components/TagSuggestionsChips.tsx`
- Create: `tests/e2e/portal-fichas-tags.spec.ts`

- [ ] **Step 1-5**: TDD estándar. Autotag Sonnet se llama al pegar contenido en el form; chips se pre-seleccionan; cliente puede quitar/agregar.

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/fichas/ tests/e2e/portal-fichas-tags.spec.ts
git commit -m "feat(portal): ficha modal with autotag chip suggestions"
```

### Task 5.5: Nav lateral + tooltips educativos

**Files:**
- Modify: nav lateral del portal (path de auditoría)
- Create: `src/components/portal/EducationalTooltip.tsx`

- [ ] **Step 1-4**: TDD estándar. Nav agrega "Reglas del negocio" bajo "Mi negocio" y "Tareas" bajo cada meerkat. Primer acceso a Reglas dispara tooltip educativo.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/ src/app/portal/layout.tsx
git commit -m "feat(portal): nav entries and first-time tooltip explaining Reglas vs Tareas"
```

---

## Phase 6: Autotag y backfill

### Task 6.1: Autotag Sonnet síncrono al crear ficha

**Files:**
- Create: `src/lib/autotag/service.ts`
- Create: `src/lib/autotag/prompt.ts`
- Modify: endpoint de crear ficha (path de auditoría)
- Create: `tests/lib/autotag/service.test.ts`

**Interfaces:**
- Produces:
  - `async function autotagFicha(fichaId, contenido): Promise<{ tags: string[]; status: 'done' | 'error' }>` — Sonnet devuelve 1-3 tags del enum.

- [ ] **Step 1: Escribir tests que fallen (incluye Review Focus #2)**

```typescript
describe('autotagFicha', () => {
  it('returns 1-3 tags from the fixed enum', async () => {});
  it('marks status=error if Sonnet returns tag NOT in catalog', async () => {
    // Review Focus #2: autotag can return only valid tags
    // if LLM hallucinates 'inventario_veterinario', service must reject
  });
  it('calls logLlmCall', async () => {});
});
```

- [ ] **Step 2-5**: TDD.

- [ ] **Step 6: Commit**

```bash
git add src/lib/autotag/ tests/lib/autotag/
git commit -m "feat(autotag): Sonnet-based tag assignment with catalog validation"
```

### Task 6.2: Retry async cron para autotag pendiente

**Files:**
- Create: `src/app/api/cron/autotag-retry/route.ts`
- Modify: `vercel.json`
- Create: `tests/integration/autotag-retry.test.ts`

- [ ] **Step 1-5**: TDD. Cron cada 5 min busca fichas `autotag_status='pending'` no procesadas hace >5 min, reintenta con Sonnet. Max 3 retries antes de `status='error'`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/autotag-retry/ vercel.json tests/integration/autotag-retry.test.ts
git commit -m "feat(autotag): async retry cron for pending fichas with 3-strike limit"
```

### Task 6.3: Backfill masivo worker

**Files:**
- Create: `src/lib/workers/backfill-ficha-tags.ts`
- Create: `src/app/api/cron/backfill-ficha-tags/route.ts`
- Modify: `vercel.json`
- Create: `tests/integration/backfill-worker.test.ts`

**Interfaces:**
- Produces: worker que procesa fichas `untagged_legacy` en batches de 50, rate-limited a 10 fichas/seg, respeta `retrieval_v2_enabled` per-org.

- [ ] **Step 1-5**: TDD.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workers/ src/app/api/cron/backfill-ficha-tags/ vercel.json tests/integration/backfill-worker.test.ts
git commit -m "feat(backfill): batched worker for legacy fichas with rate limit and per-org flag"
```

### Task 6.4: Métricas de backfill en Nash

**Files:**
- Modify: `src/lib/monitoring/nash-checks.ts` (path exacto de auditoría o memoria `project_centinelia_pool_drift_detector`)
- Create: `tests/integration/nash-backfill-metrics.test.ts`

- [ ] **Step 1-4**: TDD. Nash chequea cada hora si `untagged_legacy` avanza; alerta si stall >24h.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/ tests/integration/nash-backfill-metrics.test.ts
git commit -m "feat(monitoring): Nash tracks backfill progress and alerts on stall"
```

---

## Phase 7: Cobro y ledger

### Task 7.1: Ledger reasons nuevos

**Files:**
- Modify: `src/lib/pool/ledger.ts` (path exacto de auditoría)
- Create: `tests/lib/pool/new-reasons.test.ts`

**Interfaces:**
- Produces: nuevos `reason` values aceptados por `chargePool`: `rule_setup`, `task_setup`, `task_execution_start`, `task_action`, `ficha_autotag_migration`. Con validación de metadata schema por reason.

- [ ] **Step 1-4**: TDD.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pool/ledger.ts tests/lib/pool/new-reasons.test.ts
git commit -m "feat(pool): new ledger reasons for rules, tasks, and migration events"
```

### Task 7.2: Drift detector extensions

**Files:**
- Modify: `src/lib/monitoring/drift-detector.ts`
- Create: `tests/integration/drift-detector-new-checks.test.ts`

**Interfaces:**
- Consumes: ledger entries.
- Produces: dos checks nuevos: `task_action_without_start`, `untagged_legacy_stall`.

- [ ] **Step 1-4**: TDD.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/drift-detector.ts tests/integration/drift-detector-new-checks.test.ts
git commit -m "feat(monitoring): drift detector catches task_action orphans and stalled backfill"
```

---

## Phase 8: Migración legacy + Hard delete

### Task 8.1: Migration script de datos legacy

**Files:**
- Create: `scripts/migrate-legacy-agent-config-to-rules-and-tasks.ts`
- Create: `tests/scripts/migrate-legacy.test.ts`

**Interfaces:**
- Consumes: campos legacy identificados en auditoría 0.
- Produces: script que Sonnet lee, clasifica ("regla" vs "tarea" vs "ambiguo"), inserta en tablas nuevas.

Este task solo aplica si la auditoría (Fase 0) encontró datos poblados en producción. Si no hay datos, este task no ejecuta código y se documenta como "no aplica".

- [ ] **Step 1: Verificar output de auditoría**

Leer `docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md`. Si "Migración necesaria" dice "ninguno", saltar este task.

- [ ] **Step 2-5**: (si aplica) TDD del script.

- [ ] **Step 6: Ejecutar el script en dev**

```bash
pnpm tsx scripts/migrate-legacy-agent-config-to-rules-and-tasks.ts --env=dev --dry-run
# revisar output
pnpm tsx scripts/migrate-legacy-agent-config-to-rules-and-tasks.ts --env=dev
```

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-legacy-agent-config-to-rules-and-tasks.ts tests/scripts/migrate-legacy.test.ts
git commit -m "feat(migration): script converts legacy agent config to rules and tasks"
```

### Task 8.2: Hard delete de columnas y archivos

**Files:**
- Create: `supabase/migrations/2026-09-24-07_drop_legacy_columns.sql`
- Delete: archivos listados en auditoría
- Modify: cualquier código que referenciaba campos legacy

**Interfaces:**
- Consumes: lista concreta de la auditoría 0.
- Produces: DB schema limpio, código sin referencias legacy.

- [ ] **Step 1: Escribir migration**

Contenido exacto según auditoría. Ejemplo:
```sql
ALTER TABLE voice_agents DROP COLUMN IF EXISTS custom_instructions;
ALTER TABLE organizations DROP COLUMN IF EXISTS business_policies;
```

- [ ] **Step 2: Eliminar archivos frontend/backend legacy**

Comando por archivo listado:
```bash
git rm src/components/AgentConfig/CustomInstructionsField.tsx
git rm src/app/api/agents/[id]/instructions/route.ts
# etc según auditoría
```

- [ ] **Step 3: Modificar cualquier código que aún referencie**

Grep final:
```bash
grep -rn "custom_instructions\|business_policies" src/
```
Debe devolver 0 resultados. Si quedan, refactor para leer de `agent_rules` o `agent_tasks` según corresponda.

- [ ] **Step 4: Correr todo test suite**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: PASS. Si falla, arreglar antes de commit.

- [ ] **Step 5: Aplicar migration**

Run: `pnpm supabase migration up` en dev, verificar que aplica limpio.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026-09-24-07_drop_legacy_columns.sql -A
git commit -m "chore: hard delete legacy agent config columns and files replaced by rules+tasks"
```

---

## Phase 9: Feature flags + Rollout

### Task 9.1: Feature flags storage y helpers

**Files:**
- Create: `src/lib/feature-flags/agent-missions.ts`
- Create: `tests/lib/feature-flags/agent-missions.test.ts`

**Interfaces:**
- Consumes: `organizations.features` jsonb.
- Produces:
  - `function isFeatureEnabled(org, flag: 'agent_missions_enabled' | 'retrieval_v2_enabled' | 'rerank_enabled'): boolean`.
  - `async function setFeatureFlag(orgId, flag, enabled): Promise<void>`.

- [ ] **Step 1-4**: TDD.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feature-flags/ tests/lib/feature-flags/
git commit -m "feat(flags): agent-missions, retrieval-v2, rerank flags with org-level storage"
```

### Task 9.2: Integrar kill switches en runtime

**Files:**
- Modify: prompt builder (Reglas y Tareas condicionales al flag)
- Modify: cron scheduler (Task 3.4 ya check flag)
- Modify: phrase matcher (Task 3.5 skip si flag off)
- Modify: retrieval v2 (Task 4.x usa flag para elegir pipeline)
- Modify: portal (esconder secciones si flag off, respeta [[feedback-hide-over-disable]])
- Create: `tests/integration/kill-switches.test.ts`

- [ ] **Step 1-4**: TDD que valida que apagar cada flag hace lo esperado.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(flags): kill switches integrated into runtime, cron, matcher, retrieval, portal"
```

### Task 9.3: Runbook de rollout

**Files:**
- Create: `docs/runbook/2026-09-24-reglas-tareas-tags-rollout.md`

Documento no-código que detalla las fases del rollout del spec Sección 10.

- [ ] **Step 1: Escribir el runbook**

Incluye:
- Checklist Fase 0 (deploy dark)
- Fase 1 (interno)
- Fase 2 (Santiago NL) con comunicación previa al cliente
- Fase 3 (Tortillería)
- Fase 4 (resto en batches)
- Criterios de rollback por fase
- Comando SQL para activar/desactivar cada flag per-org

- [ ] **Step 2: Commit**

```bash
git add docs/runbook/2026-09-24-reglas-tareas-tags-rollout.md
git commit -m "docs(runbook): 5-phase rollout plan for rules, tasks, and retrieval v2"
```

---

## Phase 10: Brain artifacts (post ship-complete)

Este phase se ejecuta después de que el feature está en producción para todos los orgs con >30 días de estabilidad. NO durante el ship inicial.

### Task 10.1: Decision doc en brain

**Files:**
- Create: `.brain/decisions/2026-09-24-reglas-tareas-y-tags-fichas.md`

- [ ] **Step 1: Escribir decision inmutable**

Contenido:
- Fecha, autor, contexto.
- Alternativas consideradas (dos objetos separados vs uno, org-level vs meerkat-level, autotag manual vs automático, etc.).
- Decisión final y razones.
- Referencia a `docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md`.

- [ ] **Step 2: Commit via PR**

Brain requiere PR review, no commit directo.

### Task 10.2: Policy doc

**Files:**
- Create: `.brain/policies/agent-missions-and-ficha-tags.md`

- [ ] **Step 1: Escribir policy mutable**

Reglas de operación de este subsistema: cómo agregar tag al catálogo, cómo agregar meerkat al roster de whitelists, cuándo activar rerank per-org, cómo manejar clientes con >2000 fichas.

- [ ] **Step 2: Commit via PR**

### Task 10.3: Skill navigable

**Files:**
- Create: `.brain/skills/adding-agent-rule-or-task.md`

- [ ] **Step 1: Escribir skill ejecutable**

Checklist para el equipo cuando necesita crear una regla o tarea nueva para un cliente (setup manual, no wizard).

- [ ] **Step 2: Commit via PR**

---

## Post-Audit Corrections (2026-09-24)

Después de escribir el plan original se ejecutó auditoría directa del repo. Estos son los hallazgos concretos que **tienen precedencia sobre cualquier detalle contradictorio en las tareas de arriba**. Toda tarea que use nombres o supuestos distintos a los de esta sección los debe reemplazar por los de aquí antes de escribir código.

### PAC-1: FK a organizations es `portal_email TEXT`, no `org_id UUID`

Convención Centinelia (confirmada en `supabase/migrations/20260923120000_fichas_informativas.sql:18`). Todas las tablas nuevas usan `portal_email` como FK. Reemplazos concretos:

- **Task 1.3**: schema de `org_role_tag_additions` cambia `org_id uuid ... REFERENCES organizations(id)` por `portal_email text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE`. `added_by` es `text` (portal_email del user), no `uuid`.
- **Task 2.1**: schema de `agent_rules` cambia `org_id uuid` por `portal_email text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE`. `created_by` es `text`, no `uuid`. Índice: `CREATE INDEX ON agent_rules (portal_email, active);`.
- **Task 3.1**: schema de `agent_tasks` agrega `portal_email text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE` (mantiene `owner_agent_id uuid`). Índice adicional: `CREATE INDEX ON agent_tasks (portal_email, active);`.
- **Task 1.3**: `ALTER TABLE fichas_informativas` mantiene el existente (ya usa `portal_email`). Índice de autotag: `CREATE INDEX ON fichas_informativas (portal_email, autotag_status) WHERE autotag_status != 'done';`.

**Los helpers del Task 1.4** (`getEffectiveWhitelist`, `addTagToRoleForOrg`) reciben `portalEmail: string` en vez de `orgId: string`. Renombrar parámetros en signatures.

**Todos los services/endpoints** (Tasks 2.2, 2.3, 3.2, 3.3): auth extrae `portal_email` del request en vez de `org_id`. Ownership checks van por `portal_email`.

### PAC-2: `role` no es columna, es jsonb `agent.features->>meerkat_role_id`

Confirmado en múltiples archivos (`src/lib/billing/employee/queue.ts:234`, `src/lib/voice/prompt-builder.ts:95`).

- **Query de reglas por meerkat** (Task 2.2 `getRulesForAgent`): el agent_slug de entrada es el `meerkat_role_id`. RPC `get_rules_for_agent` usa parámetro `p_meerkat_role_id` en vez de `p_agent_slug`. Filtro `p_meerkat_role_id = ANY(applies_to)`.
- **Prompt builder** (Task 2.5): `meerkatRoleId = agent.features?.meerkat_role_id` es como se obtiene, NO `agent.role` o `agent.slug`.
- **Executor de tarea** (Task 3.6): obtiene el `meerkat_role_id` del `owner_agent_id` con lookup a `voice_agents.features`.

### PAC-3: Roster real es 15 slugs, no 10

Confirmado en `src/lib/portal/meerkat-roles.ts:MEERKAT_ROLES`. Los 15 slugs son: `nia, noah, nico, nelia, neo, nara, naia, nova, nala, nalu, nami, neka, nox, niva, nash`.

- **Task 1.2** (seed `role_default_tag_whitelist`): usar la tabla exacta de la Sección 4.2 del spec (post-corrección). Los coordinadores `nox`, `niva`, `nash` reciben whitelist COMPLETA (todos los 15 tags). Los otros 12 tienen 3-5 tags cada uno. `navi` NO va en el seed inicial porque aún no está mergeado.
- El test del Task 1.2 valida 15 roles distintos, no 10.

### PAC-4: Prompt builder canónico confirmado + hay 3 builders a modificar

Paths exactos:

1. **`src/lib/voice/prompt-builder.ts`** con función `buildSystemPrompt(agent: VoiceAgent, learnings?, orgId?, supabase?)` async, devuelve `Promise<string>`. Este es el que Task 2.5 y Task 3.7 modifican principalmente.
2. **`src/lib/voice/outbound-prompt-builder.ts`** — para llamadas salientes. Agregar bloque de Reglas (sin Tareas titulares porque outbound ya sabe qué hacer). **Nueva sub-task 2.5b** al Task 2.5.
3. **`src/lib/whatsapp/prompt-builder.ts`** — para WhatsApp. Agregar bloques de Reglas + Tareas titulares. **Nueva sub-task 2.5c** al Task 2.5.

Los tres builders sacan `meerkat_role_id` de `agent.features?.meerkat_role_id` y `portal_email` de `agent.portal_email`.

### PAC-5: Modelo de embedding y tabla chunks

Confirmado en `20260923120000_fichas_informativas.sql`: OpenAI `text-embedding-3-small` (1536 dim), tabla `fichas_informativas_chunks` con HNSW cosine index existente.

**Task 4.1 (retrieval)** debe hacer pipeline de dos pasos en dos queries o un CTE:

1. `candidate_fichas`: parent fichas que pasan filtro por tag (WHERE clause sobre `fichas_informativas.tags`).
2. `chunks`: JOIN a `fichas_informativas_chunks` de las fichas candidatas, semantic search sobre `embedding` con cosine.

NO buscar semánticamente sobre la tabla parent (no tiene embedding). Los tags viven en la parent, la búsqueda vectorial en chunks.

### PAC-6: Campo legacy CONFIRMADO para migración + hard delete

`voice_agents.transfer_rules` (text). Escrito en `src/app/portal/[token]/AgentCustomization.tsx:66-90` vía `PATCH /api/portal/[token]/settings`.

- **Task 8.1** (migration script): para cada `voice_agents` con `transfer_rules IS NOT NULL AND length > 5`, Sonnet lee el texto y decide:
  - Si es "condición + acción" clara (ej. "cuando el cliente pida hablar con el gerente, transfiere") → insert en `agent_rules` con `portal_email = voice_agents.portal_email`, `regla = <texto directo>`, `applies_to = [<meerkat_role_id del agent>]`, `active = true`.
  - Si es texto ambiguo → insert con `active = false` y `detalles = 'Regla migrada de la sección Reglas de transferencia. Revisa antes de activar.'`.
- **Task 8.2** (hard delete):
  - `ALTER TABLE voice_agents DROP COLUMN transfer_rules;`
  - Eliminar textarea "Reglas de transferencia" en `src/app/portal/[token]/AgentCustomization.tsx` (líneas ~66-90).
  - Eliminar `transfer_rules` del body handler en `PATCH /api/portal/[token]/settings`.
  - Grep final para asegurar 0 referencias remanentes: `grep -rn "transfer_rules" src/ supabase/ tests/`.
- **Task 8.1 no aplica si**: la migración de datos revela que ningún cliente productivo tiene `transfer_rules` poblado con contenido significativo. En ese caso, se salta directo al hard delete en Task 8.2.

Nota: `voice_agents.first_message` NO es redundante (es config específica del voice pipeline de Vapi). Se mantiene.

### PAC-7: Ubicación de learnings y KB (no redundantes)

Componentes existentes que NO se tocan por este spec:

- `src/app/portal/[token]/LearningsSection.tsx` + `src/app/api/cron/learn/route.ts`: sistema separado que aprende de conversaciones reales.
- `src/app/portal/[token]/AgentKnowledgeBaseEditor.tsx` + `KnowledgeBaseEditor.tsx`: KB del negocio, coexiste con `fichas_informativas`.

La auditoría de Fase 0 confirma que estos no aparecen como redundantes. Si aparecen en algún grep durante la ejecución del plan, no eliminar sin re-confirmar.

### PAC-8: Stack y comandos exactos

Verificado en `package.json`:

- Next.js `16.2.9` (versión reciente; leer `node_modules/next/dist/docs/` si patrones parecen distintos).
- React `19.2.4`.
- TypeScript.
- Anthropic SDK `@anthropic-ai/sdk 0.116.0`.
- Testing: **Vitest** (no Jest) + **Playwright** para e2e.
- Comandos exactos:
  - `pnpm test` (unit)
  - `pnpm test:integration` (usa `vitest.integration.config.ts`)
  - `pnpm test:smoke` (usa `vitest.smoke.config.ts`)
  - `pnpm test:e2e` (Playwright)
  - `pnpm lint` (corre eslint + `check:llm-logging.mjs` que enforcea `logLlmCall`)
- Migrations Supabase: naming `YYYYMMDDHHMMSS_slug.sql`, no `YYYY-MM-DD-NN_slug.sql`. **Corregir naming en Tasks 1.1, 1.2, 1.3, 2.1, 3.1** para usar formato timestamp de 14 dígitos (ejemplo: `20260924120000_ficha_tags.sql`).

### PAC-9: Setup migration tracking

**IMPORTANTE**: según [[reference-supabase-sql-editor-no-tracker]] y sesión 2026-09-23, aplicar migrations vía dashboard NO registra en schema_migrations, causa drift silencioso con `db push`. Regla obligatoria en toda tarea de migration:

- **Aplicar SIEMPRE vía CLI**: `pnpm supabase db push` o equivalente.
- Nunca copy-paste al SQL Editor del dashboard.
- Verificar aplicación con `pnpm supabase migration list` después.

### PAC-10: `pnpm supabase` invocation

En Centinelia el CLI de Supabase se usa vía `pnpm exec supabase ...` o similar (a confirmar en scripts de `package.json`). Comandos en Tasks 1.1, 1.2, 1.3, 2.1, 3.1, 8.2 (aplicar migration):

- `pnpm exec supabase db push` (si es el patrón).
- Alternativa: `npx supabase db push`.
- Ver `scripts/vercel-ignore.sh` y otros scripts existentes para pattern real.

### Task nueva: Task 2.5b/c — Integrar bloques en outbound + whatsapp prompt builders

**Files:**
- Modify: `src/lib/voice/outbound-prompt-builder.ts`
- Modify: `src/lib/whatsapp/prompt-builder.ts`
- Create: `tests/integration/prompt-builder-outbound-rules.test.ts`
- Create: `tests/integration/prompt-builder-whatsapp-rules.test.ts`

**Interfaces:**
- Consumes: `getCachedRulesForAgent()` (Task 2.4).
- Produces: mismo bloque markdown `## Reglas de tu negocio (respétalas siempre)` inyectado en ambos builders. Outbound NO lleva bloque de Tareas titulares (tarea outbound ya sabe qué hacer); WhatsApp SÍ.

- [ ] **Step 1-4**: TDD estándar, mismo patrón que Task 2.5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/outbound-prompt-builder.ts src/lib/whatsapp/prompt-builder.ts tests/integration/prompt-builder-outbound-rules.test.ts tests/integration/prompt-builder-whatsapp-rules.test.ts
git commit -m "feat(rules): inject rules block into outbound and whatsapp prompt builders"
```

### Task nueva: Task 3.8 — Integrar phrase matcher en meerkat tool loop

**Files:**
- Modify: canonical meerkat tool loop (identificar con auditoría: probablemente `src/lib/tools/executor.ts` o `src/app/api/portal/[token]/agent-chat/route.ts` o `src/app/api/whatsapp/webhook/route.ts`)

**Interfaces:**
- Consumes: `matchPhraseToTask` (Task 3.5), `executeTask` (Task 3.6).
- Produces: mensaje del usuario que matchea una phrase task dispara `executeTask` en vez de flujo conversacional normal.

- [ ] **Step 1: Grep para localizar tool loops**

```bash
grep -rn "toolCallId\|tool_use\|toolChoice" src/lib/tools/ src/app/api/portal/ src/app/api/voice/ src/app/api/whatsapp/ 2>&1
```

- [ ] **Step 2-5**: TDD integrando phrase-matcher en cada entry point (voice inbound, chat portal, WhatsApp inbound).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tasks): phrase matcher integrated into voice/chat/whatsapp entry points"
```

---

## Self-Review

### Spec coverage
- Sección 1 Motivación: cubierto en Global Constraints + Fase 0 (auditoría).
- Sección 2 Non-goals: implícito en scope de cada fase, sin código que agregue non-goals.
- Sección 3 Decisiones clave: cada decisión mapea a al menos un task (verificado).
- Sección 4 Data Model: Tasks 1.1, 1.2, 1.3, 2.1, 3.1.
- Sección 5 Runtime prompt: Tasks 2.5, 3.7, 4.x (fichas).
- Sección 6 Retrieval con tags: Tasks 4.1, 4.2, 4.3.
- Sección 7 UI Portal: Tasks 5.1-5.5.
- Sección 8 Cobro: Tasks 7.1, 7.2 y cobros dentro de 2.2, 3.2, 3.6, 6.1.
- Sección 9 Migración: Tasks 6.3 (backfill), 8.1 (legacy datos), 8.2 (hard delete).
- Sección 10 Feature flags + Rollout: Tasks 9.1, 9.2, 9.3.
- Sección 11 Auditoría: Fase 0 (Tasks 0.1-0.4).
- Sección 12 Puntos abiertos: se resuelven en Fase 0.
- Sección 13 Riesgos: reflejados en Global Constraints, Review Focus, y validaciones de servicios.
- Sección 14 Fuera de alcance: respetado, no aparece en tasks.
- Sección 15 Brain: Fase 10 (post ship-complete).

**Gap detectado**: Sección 12 punto 6 "Feature flag storage: patrón de Navi con `organizations.features` jsonb". Verificado que Task 9.1 usa ese storage.

### Placeholder scan
- Sin "TBD", "TODO", "similar to Task N" sin código.
- Todas las tasks tienen código concreto o clarísima delegación a un patrón repetido (Task 3.2 "mismo patrón que Task 2.2" es aceptable porque Task 2.2 tiene código completo y el patrón es directo de reutilizar).
- Nombres de tablas y funciones consistentes entre tasks.

### Type consistency
- `AgentRule` type usado en Task 2.2, 2.4, 2.5 con misma shape.
- `getEffectiveWhitelist(orgId, role)` firmado igual en Task 1.4, consumido en Task 4.1.
- `chargePool({ orgId, reason, count, metadata })` consistente en Tasks 2.2, 3.6, 6.1, 7.1.
- `isFeatureEnabled(org, flag)` firmado igual en Task 9.1, consumido en 9.2.

### Review Focus
Cinco failure modes con test asignado:
1. **Regla applies_to con slug inexistente**: Task 2.2 tiene test explícito ("createRule rejects applies_to with invalid slug").
2. **Ficha con tag no presente en catálogo**: Task 6.1 tiene test explícito.
3. **Cron scheduler ejecuta tarea de org con flag off**: Task 3.4 tiene test explícito.
4. **Meerkat con whitelist vacía consulta fichas**: Task 4.1 tiene test "falls back to no-filter" + Task 4.3 confirma.
5. **Ejecución tarea supera pool disponible**: Task 3.6 tiene test explícito ("rejects execution if org pool exhausted").

Todos cubiertos.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-24-reglas-tareas-y-tags-fichas.md`. Please review the plan.

**Para este plan recomiendo Subagent-driven**, porque tiene 40+ tasks con interdependencias fuertes entre fases (data model → services → prompt builder → UI → cobro → migración → rollout), cada tarea tiene consecuencias reales en producción (migraciones Supabase, hard deletes, cambios al prompt de meerkats en producción), y un error en una fase temprana costaría mucho debuggear en fase tardía si no hay revisión fresca por tarea.

Ejecución nativa es más rápida y más barata, pero requeriría un fresh reviewer al final para cubrir el mismo terreno. Con Subagent-driven cada tarea se revisa antes de que la siguiente arranque, atrapando errores más temprano.

Does the plan capture what you want, and which approach should we use?
