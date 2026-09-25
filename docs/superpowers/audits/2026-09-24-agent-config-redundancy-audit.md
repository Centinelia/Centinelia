# Auditoría de config redundante — 2026-09-24

**Estado:** Ejecutada y verificada
**Autor:** Subagent Fase 0 (verificación independiente de hallazgos del spec)
**Precedencia:** Este documento y el spec Sección 11 son AUTORITATIVOS sobre el plan.

---

## Metodología

Auditoría en dos partes:
1. Lectura del spec Sección 11 y plan "Post-Audit Corrections" que ya listaban hallazgos.
2. Verificación INDEPENDIENTE ejecutando greps contra el código actual para confirmar cada hallazgo.

Todos los greps se ejecutaron contra el worktree `C:/Users/Nazre/centinelia-reglas-tareas-tags` en la rama `feat/reglas-tareas-tags`.

---

## Verificaciones ejecutadas y resultados

### Campos redundantes buscados (patrones antiguos)

**Grep ejecutado:**
```
grep -rn "custom_instructions|business_policies|prompt_personalizado" src/ supabase/
```

**Resultado:** 0 matches. Ninguno de estos nombres de campo legacy existe en el codebase actual. El spec afirmaba que probablemente no existirían con estos nombres y la verificación lo confirma. No hay campos legacy adicionales a los ya documentados.

---

### Campo legacy CONFIRMADO: `voice_agents.transfer_rules`

**Grep ejecutado:**
```
grep -rn "transfer_rules" src/
```

**Total de matches: 15**. Distribución por archivo:

| Archivo | Línea | Tipo de referencia |
|---|---|---|
| `src/app/api/portal/[token]/generate-kb/route.ts` | 35 | Lectura — declaración de tipo `transfer_rules: string \| null` |
| `src/app/api/portal/[token]/generate-kb/route.ts` | 38 | Lectura — query a DB, campo incluido en SELECT |
| `src/app/api/portal/[token]/generate-kb/route.ts` | 91 | Lectura — lee el campo para usarlo en el prompt de generación de KB |
| `src/app/api/portal/[token]/generate-kb-tournament/route.ts` | 69 | Lectura — declaración de tipo |
| `src/app/api/portal/[token]/generate-kb-tournament/route.ts` | 72 | Lectura — query a DB, campo incluido en SELECT |
| `src/app/api/portal/[token]/generate-kb-tournament/route.ts` | 105 | Lectura — lee el campo para usarlo en el prompt |
| `src/app/api/portal/[token]/settings/route.ts` | 65 | Escritura — campo incluido en lista `allowed` del PATCH handler |
| `src/app/portal/[token]/AgentCustomization.tsx` | 19 | Escritura — función `save` que recibe `'transfer_rules'` como argumento |
| `src/app/portal/[token]/AgentCustomization.tsx` | 75 | Escritura — `onBlur` que llama `save('transfer_rules', ...)` |
| `src/app/portal/[token]/configurar/page.tsx` | 357 | Lectura — verifica si `transfer_rules` tiene contenido (booleano UI) |
| `src/app/portal/[token]/configurar/page.tsx` | 475 | Lectura — pasa el valor como prop `initTransferRules` |
| `src/lib/voice/prompt-builder.ts` | 514 | Lectura runtime — lógica condicional: si `transfer_rules` está vacío, inyecta default de transferencia genérica |
| `src/lib/voice/prompt-builder.ts` | 681 | Lectura runtime — guarda condición de existencia |
| `src/lib/voice/prompt-builder.ts` | 682 | Lectura runtime — inyecta en el bloque del system prompt bajo `REGLAS DE TRANSFERENCIA PERSONALIZADAS:` |
| `src/types/agent.ts` | 146 | Tipo — `transfer_rules?: string` con comentario explicativo |

**Discrepancia vs spec:** El spec (Sección 11.1) mencionaba las ubicaciones en `AgentCustomization.tsx` y el endpoint `settings`. La auditoría revela **4 ubicaciones adicionales** no listadas en el spec:
- `src/app/api/portal/[token]/generate-kb/route.ts` — lee y usa `transfer_rules` en el prompt de generación de KB (líneas 35, 38, 91 y L116 dentro del prompt string)
- `src/app/api/portal/[token]/generate-kb-tournament/route.ts` — ídem para el torneo (líneas 69, 72, 105 y L129)
- `src/app/portal/[token]/configurar/page.tsx` — lógica condicional UI (líneas 357 y 475)
- `src/types/agent.ts` — definición de tipo (línea 146)

Estas ubicaciones adicionales **no cambian la decisión de hard delete**, pero sí amplían la lista de archivos a limpiar en el Task 8.2.

---

### Roster real de meerkats

**Grep ejecutado:**
```
grep -rn "meerkat_role_id" src/lib/portal/meerkat-roles.ts
```
El tipo `MeerkatRoleId` se define como unión de literales en las líneas 3-7. Los 15 slugs confirmados son:

```
nia, noah, nico, nelia, neo, nara, naia, nova, nala, nalu, nami, neka, nox, niva, nash
```

Constantes adicionales confirmadas:
- `COORDINATOR_ROLE_IDS = ['nox', 'niva', 'nash']` (línea 9)
- `INTERNAL_MEERKAT_IDS = new Set(['nash', 'neka'])` (línea 23)
- El slug `navi` NO aparece en el tipo ni en `MEERKAT_ROLES`. El spec lo indica correctamente: Navi aún no está en producción.

---

### Convención FK portal_email

**Grep ejecutado:**
```
grep -rn "portal_email.*REFERENCES organizations|REFERENCES organizations.*portal_email" supabase/migrations/
```

**12 matches encontrados** en 7 archivos de migración. Muestra representativa:

| Archivo de migración | Patrón |
|---|---|
| `20260804_sheets_mappings.sql:5` | `portal_email TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE` |
| `20260817120000_billing_shared_layer.sql` (3 matches) | Mismo patrón |
| `20260831130000_module_activations.sql:10` | Mismo patrón |
| `20260923120000_fichas_informativas.sql:37,72` | Mismo patrón |
| `20260924120000_perfiles_vivos.sql:22,83` | Mismo patrón |

Confirmado: todas las FKs a `organizations` usan `portal_email TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE`. La convención es consistente y activa.

---

### Modelo de embedding

**Grep ejecutado:**
```
grep -rn "text-embedding-3-small|voyage" src/ supabase/
```

**Matches:** encontrados en:
- `src/lib/observability/llm-log.ts:8` — entrada de pricing para `text-embedding-3-small`
- `src/lib/rag/embed.ts:5,8` — comentario y constante `EMBED_MODEL = 'text-embedding-3-small'`
- `supabase/migrations/20260923120000_fichas_informativas.sql:12,97` — comentario y columna comment
- `supabase/migrations/20260923150000_fichas_informativas_stuffed_mode.sql:26` — comment de columna

**Voyage:** 0 matches. El modelo de embedding es exclusivamente OpenAI `text-embedding-3-small`, 1536 dim. Confirmado.

---

### Prompt builders identificados

**Grep ejecutado:**
```
find src/lib -name "*prompt-builder*"
find src/lib -name "*prompt*builder*"
```

Los 3 archivos identificados y sus funciones exportadas principales:

| Path | Función principal | Notas |
|---|---|---|
| `src/lib/voice/prompt-builder.ts` | `buildSystemPrompt(agent, learnings?, orgId?, supabase?)` async → `Promise<string>` | Canónico inbound voice |
| `src/lib/voice/outbound-prompt-builder.ts` | `buildOutboundSystemPrompt(...)` | Llamadas salientes |
| `src/lib/whatsapp/prompt-builder.ts` | `buildWASystemPrompt(agent, brandVoiceGuide?)` | WhatsApp |

Los tres archivos existen exactamente como el spec los describe.

---

## Consolidado para hard delete inline

> **ACTUALIZADO 2026-09-25** — Fase 8 MODIFICADA (NO DROP COLUMN) ejecutada en commits `e9a6ad5f` (Task 8.1) y `1dd12af7` (Task 8.2). Estado final documentado abajo.

Lista concreta de ubicaciones limpiadas en Task 8.2 (Fase 8 modificada):

- **Columna SQL:**
  - [x] **PRESERVADA INTENCIONALMENTE** — `voice_agents.transfer_rules` NO se hace DROP. Safety net para rollback sin migration reversa.

- **Tipo TypeScript:**
  - [x] `src/types/agent.ts:147` — propiedad marcada `@deprecated`, conservada para compat legacy (Opción B).

- **Componente UI:**
  - [x] `src/app/portal/[token]/AgentCustomization.tsx` — sección "Reglas de transferencia" eliminada. Props `initTransferRules` y estado `transferRules` eliminados.
  - [x] `src/app/portal/[token]/configurar/page.tsx` — eliminada lógica `hasTransferRules` y prop `initTransferRules`.

- **Endpoints:**
  - [x] **PRESERVADO INTENCIONALMENTE** — `src/app/api/portal/[token]/settings/route.ts:65` mantiene `'transfer_rules'` en lista `allowed` para compat con clientes API externos.
  - [x] `src/app/api/portal/[token]/generate-kb/route.ts` — eliminado del SELECT, de la variable local y del prompt de generación.
  - [x] `src/app/api/portal/[token]/generate-kb-tournament/route.ts` — ídem.

- **Lecturas en runtime (prompt builder):**
  - [x] `src/lib/voice/prompt-builder.ts` — eliminada lógica condicional con `transfer_rules` en bloque TRANSFERENCIA INTELIGENTE (ahora usa default genérico siempre). Eliminado bloque `REGLAS DE TRANSFERENCIA PERSONALIZADAS`.

**Resultado final de grep `transfer_rules` en `src/`:**

```
src/app/api/portal/[token]/settings/route.ts:65   (PRESERVADO — compat API legacy)
src/types/agent.ts:147                             (PRESERVADO — tipo @deprecated)
```

Cero referencias en prompt builders, KB generators, UI components, ni otros archivos de runtime.

**Script de migración:** `scripts/migrate-legacy-transfer-rules.ts` + tests en `tests/scripts/migrate-legacy-transfer-rules.test.ts` (15 unit tests verdes). Pendiente que el controller corra `pnpm tsx scripts/migrate-legacy-transfer-rules.ts --dry-run` antes del run real.

**Nota:** Los builders de outbound (`outbound-prompt-builder.ts`) y WhatsApp (`whatsapp/prompt-builder.ts`) no tenían referencias a `transfer_rules` desde el inicio. Confirmado.

---

## Migración de datos requerida

Query para saber si hay datos poblados antes de ejecutar el hard delete:

```sql
SELECT COUNT(*) FROM voice_agents
WHERE transfer_rules IS NOT NULL AND length(transfer_rules) > 5;
```

- Si count > 0: ejecutar Task 8.1 (migration script Sonnet legacy → agent_rules).
- Si count = 0: saltar Task 8.1, ir directo a Task 8.2 (hard delete).

---

## Nombres confirmados

- **Tabla de agentes:** `voice_agents`. La columna `role` NO existe como columna directa. El identificador de rol vive en `features->>meerkat_role_id` (jsonb path). Ejemplo de uso: `.eq('features->>meerkat_role_id', 'nala')`.
- **FK a organizations:** `portal_email TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE`. Sin excepción en ninguna migración existente.
- **Modelo de embedding:** OpenAI `text-embedding-3-small`, 1536 dim, HNSW cosine. Constante en `src/lib/rag/embed.ts`.
- **Naming de migrations:** la mayoría usa 14 dígitos (`YYYYMMDDHHMMSS_slug.sql`). Hay variantes históricas con 12 dígitos (`YYYYMMDD_slug`) y `YYYY-MM-DD-slug`, pero el patrón reciente (últimas 10+ migraciones) es 14 dígitos. Las migrations nuevas de este spec deben usar 14 dígitos.
- **Prompt builders:** 3 archivos (voice inbound, outbound, whatsapp).
- **Stack:** Next.js 16.2.9, React 19.2.4, Anthropic SDK 0.116.0, Vitest + Playwright.
- **Comandos test:** `pnpm test`, `pnpm test:integration`, `pnpm test:smoke`, `pnpm test:e2e`.
- **Lint:** `pnpm lint` corre `eslint && check:llm-logging.mjs` que enforcea `logLlmCall` en todo llamado LLM.
- **Supabase CLI:** `pnpm exec supabase` o `npx supabase`. Nunca via dashboard SQL Editor (causa drift silencioso en `schema_migrations`).

---

## Discrepancias vs spec

**Una discrepancia de alcance encontrada (no bloqueante):**

El spec (Sección 11.1) y el plan (PAC-6) mencionaban como ubicaciones de `transfer_rules`:
1. `AgentCustomization.tsx` — CONFIRMADO
2. `PATCH /api/portal/[token]/settings` — CONFIRMADO
3. `prompt-builder.ts` en runtime — CONFIRMADO (mencionado como "uso probable")

La auditoría encontró **4 ubicaciones adicionales** no listadas:
- `generate-kb/route.ts` (lectura + uso en prompt de KB generation)
- `generate-kb-tournament/route.ts` (ídem)
- `configurar/page.tsx` (lógica UI condicional)
- `types/agent.ts` (definición del tipo TypeScript)

**Impacto:** Estas ubicaciones adicionales se agregan a la lista de limpieza en Task 8.2. La decisión de hard delete no cambia; solo amplía el scope de limpieza en 4 archivos más. El Task 8.2 debe incluir estos archivos en su grep final de verificación de 0 referencias: `grep -rn "transfer_rules" src/ supabase/ tests/`.

**Todo lo demás cuadra:** roster de meerkats (15 slugs), modelo embedding, convención FK, naming de migrations, prompt builders (3 archivos), stack y comandos. Ninguna contradicción en esos puntos.
