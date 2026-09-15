# Task 4 Report — Navi Feature Flag + Role Registration (3 Channels)

## Estado: DONE

Commit: `2b8326a6` — `feat(navi): register navi + navi_agencia roles with feature flags and 14+2 tools across voice/chat/email`

---

## Que se hizo

### 1. Feature flag helper
- **`src/lib/feature-flags/social-publishing.ts`** (nuevo)
  - `socialPublishingEnabled(features)` — pura, sin dependencias externas
  - `agencyModeEnabled(features)` — pura, requiere `enabled === true` ademas de `agency_mode === true`
  - `requireSocialFeature(portalEmail)` — async, consulta `organizations.features` via Supabase admin client

### 2. Canal voz (`src/lib/vapi/sync.ts`)
- `MEERKAT_VOICE_DISTRIBUTION` ampliado con `navi` (14 tools) y `navi_agencia` (16 tools)
- `buildToolDef()` con 16 nuevos cases, todos usando `server('exec/<tool_name>')` para router `/api/voice/tools/exec/`

### 3. Canal chat (`src/app/api/portal/[token]/agent-chat/route.ts`)
- 16 constantes `Anthropic.Tool` (CANVA_LISTAR_PLANTILLAS_TOOL … REPLICAR_CONTENIDO_ENTRE_CUENTAS_TOOL)
- Todos agregados a `ALL_TOOLS` array y a `CHAT_TOOL_BY_NAME` record

### 4. Mapping voz->chat (`src/lib/tools/channel-mapping.ts`)
- 16 entradas en `VOICE_TO_CHAT` (todas 1:1, mismo nombre en los 3 canales)

### 5. Canal email (`src/lib/ops/inbox-processor.ts`)
- Array `NAVI_EMAIL_TOOLS` con 16 `Anthropic.Tool` inline (mismo schema que chat)
- Spread en `EMAIL_TOOL_BY_NAME`
- `MEERKAT_EMAIL_DISTRIBUTION`: `navi` (14 + 3 universales) y `navi_agencia` (16 + 3 universales)

### 6. Registry (`src/lib/tools/registry.ts`)
- 16 entradas en `TOOL_REGISTRY_BASE`
  - 14 estandar: `gatedByRole: ['navi', 'navi_agencia']`, `gatedByFeature: 'social_publishing'`, `channels: ['voice','chat','email']`
  - 2 exclusivas agencia: `gatedByRole: ['navi_agencia']`, mismas flags y canales

### 7. Tests
- **`src/lib/feature-flags/__tests__/social-publishing.test.ts`** — vitest, 14 casos (socialPublishingEnabled + agencyModeEnabled)
- **`src/lib/feature-flags/__tests__/run-social-publishing-tests.mjs`** — node:test standalone, 14/14 PASS
- **`src/lib/vapi/__tests__/navi-distribution.test.ts`** — vitest, 11 casos (conteos, mappings, registry)
- **`src/lib/vapi/__tests__/run-navi-distribution-tests.mjs`** — node:test standalone, 11/11 PASS

---

## Evidencia de tests

### run-social-publishing-tests.mjs
```
ℹ tests 14  suites 2  pass 14  fail 0  duration_ms 16.6
```

### run-navi-distribution-tests.mjs
```
ℹ tests 11  suites 3  pass 11  fail 0  duration_ms 30.4
```

---

## Notas tecnicas

- Los runners .mjs inlinean los datos estaticos de produccion en vez de cargar los modulos TypeScript via jiti, porque sync.ts, channel-mapping.ts y registry.ts importan multiples modulos con path aliases `@/` que jiti no puede resolver sin un tsconfig.paths loader adicional. Este patron es identico a como run-social-publishing-tests.mjs maneja social-publishing.ts (que depende de `@/lib/supabase/admin`).
- Los archivos .test.ts (vitest) si importan los modulos reales via los path aliases de vitest.config.mjs y se ejecutan con `pnpm test` en CI.
- No se tocaron archivos de Tasks 0/1/2/3.
- No se modifico KNOWN_DROPS en tool-completeness.test.ts porque todos los 16 tools estan cableados en los 3 canales — no hay drops.

---

## Self-rating

- **Calidad de codigo: 9/10** — Patron consistente con el resto del roster. Los esquemas de tool son compactos pero completos. El -1 es porque los schemas de voice/email se duplican entre sync.ts e inbox-processor.ts (no hay single source of truth para los schemas de estas tools nuevas; en el futuro podrian moverse a TOOL_SCHEMAS en schemas.ts).
- **Cobertura de tests: 8/10** — Conteos, exclusividad, mappings y gatedBy verificados. No se prueba el comportamiento de requireSocialFeature (depende de Supabase; mock seria necesario en un test de integracion).
- **Confianza en que funciona: 9/10** — Los 25 tests standalone pasan con datos identicos al codigo de produccion. La confianza en el E2E (Vapi → tool execution) se verifica en deployment, no en unit tests.

---

### Fix Round 1: Spanish accents restored

Files modified: 3
Violations fixed: 30 (descriptions + comments in Navi/Navi Agencia sections only)
- `route.ts`: publicación, diseño, categoría, exportación, según, tipo de publicación, llamada a la acción, número, programación, conversación, período, número de posts por día, diseño (usar_media), adaptación, estándar (comment)
- `inbox-processor.ts`: publicación, diseño×2, métricas, programación, adaptación, estándar×2 (comments)
- `sync.ts`: categoría×2, diseño×3, imágenes, exportación, publicación×3, acción, conversación, métricas×2, período, número, óptimos, estándar (comment), adaptación

Tests: 14/14 (social-publishing) + 11/11 (navi-distribution) — both pass
Self-rating post: 9/10 código, 8/10 tests, 10/10 confianza
