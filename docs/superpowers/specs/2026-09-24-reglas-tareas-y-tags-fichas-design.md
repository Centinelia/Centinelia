# Reglas de negocio, Tareas programadas y Tags en fichas informativas

**Fecha:** 2026-09-24
**Autor:** Nazre + Claude (brainstorming)
**Estado:** Diseño aprobado en chat, spec para review
**Cliente kickstart:** Santiago NL (primer org donde se activa el pipeline nuevo de retrieval, ver Sección 10)

## 1. Motivación

Hoy Centinelia tiene un mecanismo para dar contexto de negocio a los meerkats: `fichas_informativas` (pack shipped 2026-09-23). El cliente sube fichas org-level; los meerkats las consultan en runtime. Modo dual stuffed/embeddings ya existe.

Se detectaron dos huecos que este spec resuelve juntos:

**Hueco 1: escala mal.** Sin filtrado por dominio, cuando un org sube 500 a 2200 fichas todos los meerkats las ven. Consecuencias observables: modo stuffed muere (miles de tokens), modo embeddings alucina silencioso (retrieval trae fichas semánticamente cercanas pero de dominio equivocado, meerkat responde con confianza usando la ficha mala), costos suben por ruido. Punto de quiebre calculado: cerca de 100 a 200 fichas por org.

**Hueco 2: cliente no puede instruir al meerkat en su idioma.** Fichas informativas dan contexto del negocio ("así funciona mi empresa"), pero no capturan la parte de "quiero que este empleado haga esto específico" ni "aquí van las reglas duras que aplican siempre". Hoy Centinelia llena este vacío con setup fee ($14,990) donde el equipo interno traduce necesidades del cliente a prompts. Escala mal, y el resultado depende de quién haga el setup, no de quién dueño de PyME sabe su negocio.

Este spec resuelve ambos huecos en una sola iteración porque comparten infra (tagging + whitelist por rol + retrieval de dos pasos) y porque intentar shippearlos por separado forzaría a diseñar `fichas_de_encargo` sobre una infra de tags que aún no existiría.

### 1.1 Concepto: Reglas de operación y Tareas programadas

En lenguaje de dueño de PyME:

- **Regla de operación**: cómo opera tu negocio siempre. Aplica a todos tus empleados digitales por default. Ejemplo: "nunca ofrecemos descuentos sin mi aprobación", "el horario laboral es lunes a viernes de 9 a 6", "siempre validamos razón social antes de facturar".
- **Tarea programada**: algo específico que quieres que suceda en cierto momento. Pertenece a un meerkat dueño. Ejemplo: "cada día 5, Nala manda cobranza a clientes con mora >30 días", "cada lunes 9am, Nash genera reporte de ventas".

Fuente conceptual: framework MAPS (Misión, Ask/Trigger, Parámetros, Shape/Entregable). Reglas usan una versión simplificada de 2 campos (una oración cortas más detalles opcionales). Tareas usan MAPS completo.

## 2. Non-goals

- **Reemplazar `fichas_informativas`.** Fichas siguen siendo la fuente de conocimiento del negocio. Reglas y Tareas son objetos nuevos, complementarios.
- **Prompt-engineering visible al cliente.** El cliente no ve "system prompts", "tokens", "embeddings" ni "triggers". Copy educativo en español sin jerga técnica es requerimiento duro.
- **Meerkats custom por cliente.** Regla de negocio existente ([[feedback-no-custom-meerkat]]): 'custom' está eliminado, roles vía `/pedir-rol`. Reglas y Tareas parametrizan los roles existentes, no crean roles nuevos.
- **Bot-to-bot cross-org.** La conversación entre meerkats de distintos orgs ya sucede de facto por correo (Nala de A escribe a Nala de B). No se modela protocolo interno en v1.
- **Triggers avanzados en v1.** v1 soporta cron + manual + frase del cliente. Eventos del sistema (webhook de Dropbox, correo entrante), cascadas entre meerkats, y tareas multi-meerkat coordinadas explícitamente quedan para v2 si aparece demanda real.
- **Sunset del retrieval antiguo en el ship inicial.** Rollout gradual con feature flag. Sunset del código antiguo va en PR separado, mínimo 60 días post ship-complete.

## 3. Decisiones clave (resumen)

| Decisión | Elegido | Motivo corto |
|---|---|---|
| Naturaleza | Dos objetos separados en portal: **Reglas** y **Tareas** | Distinguen mentalmente sin jerga técnica. Config permanente vs recipe con trigger. |
| Alcance Reglas | Org-level con `applies_to` opcional (default `{}` = todos) | Reglas son políticas de negocio, no del empleado. Escribir una vez, aplicar a todos. |
| Alcance Tareas | Por meerkat con `owner_agent_id` único | Cada tarea tiene un dueño. Coordinación con otros meerkats via invocación dinámica de tools (patrón existente). |
| Catálogo de tags | Enum fijo controlado por Centinelia (15 slugs) | Consistencia entre orgs, whitelists por rol simples, evolución controlada. |
| Asignación de tags | Autotag con Sonnet + validación editable en modal | Baja fricción, alta precisión. Patrón Neka CSF replicado. |
| Whitelist por rol | Fija por Centinelia + escape hatch para AGREGAR | Consistencia base, extensión controlada. Nunca se puede quitar el core del rol. |
| Triggers Tareas v1 | Cron + Manual + Frase del cliente | Cubre 90% de casos PyME. Eventos y cascadas a v2. |
| Schema Reglas | 2 campos: `regla` (obligatorio) + `detalles` (opcional) | Reglas de negocio son cortas. MAPS completo sería overkill. |
| Schema Tareas | MAPS completo: `mission`, `trigger_type` + `trigger_config`, `parameters`, `deliverable` | Recipe con trigger encaja natural en MAPS. |
| Composición runtime | Reglas siempre stuffed. Tareas titular stuffed, detalle on-demand. Fichas dual mode + filtro por tag. | Cada tipo en el lugar donde da mejor resultado y no se pierde en retrieval. |
| Cobro setup | 1 op por Regla, 1 op por Tarea. Ficha mantiene 1 op setup ya shipped. | Alineado con [[feedback-pool-work-based]]. |
| Cobro runtime | Reglas 0 ops (stuffed). Tarea: 1 op arranque + N ops por side-effects (batched-consume). Ficha mantiene 1 op runtime ya shipped. | Cliente paga por trabajo iniciado. Rerank Haiku absorbido. |
| Cobro autotag | Absorbido en el setup de la ficha, no cobrado extra. | Costo interno Centinelia ~$0.001. Alineado con [[feedback-batch-eval-no-charge]]. |
| Migración fichas legacy | Feature flag por org + backfill background rate-limited a ~10 fichas/seg. Cero cobro al cliente. | Rollout seguro, arranca con Santiago NL. |
| Depuración | Hard delete inline al ship. Auditoría previa lista qué borrar. | [[feedback-hide-over-disable]] no aplica cuando el reemplazo es 100%. |

## 4. Data Model

### 4.1 Tabla `ficha_tags` (catálogo controlado)

```sql
CREATE TABLE ficha_tags (
  slug        text PRIMARY KEY,
  label_es    text NOT NULL,
  descripcion text,
  orden       int NOT NULL DEFAULT 0,
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

Seed inicial (afinable antes del ship):

| slug | label_es | descripcion breve |
|---|---|---|
| contabilidad | Contabilidad | facturación, CFDI, conciliaciones, régimen fiscal |
| cobranza | Cobranza | mora, recordatorios, pagos vencidos |
| ventas | Ventas | cotizaciones, precios, ofertas, cierres |
| atencion_cliente | Atención al cliente | tono, quejas, respuestas frecuentes |
| catalogo_productos | Catálogo de productos | SKUs, características, disponibilidad |
| politicas | Políticas | descuentos, devoluciones, garantías |
| rh | Recursos humanos | empleados, vacaciones, nómina, incidencias |
| operaciones | Operaciones | procesos internos, horarios, ubicaciones |
| logistica | Logística | rutas, envíos, tiempos de entrega |
| marketing | Marketing | campañas, promociones, brand voice |
| finanzas | Finanzas | flujo de caja, cuentas por pagar/cobrar |
| legal | Legal | contratos, cláusulas, cumplimiento no fiscal |
| fiscal | Fiscal | régimen, CSDs, PACs, obligaciones SAT |
| onboarding_clientes | Onboarding de clientes | proceso de alta, requisitos, welcome |
| soporte_tecnico | Soporte técnico | fallas, tickets, troubleshooting |

Nota: Postgres ENUM se descartó porque agregar tags nuevos requiere migration. Tabla permite `INSERT ... ON CONFLICT DO NOTHING` sin schema change.

### 4.2 Tabla `role_default_tag_whitelist` (fija por Centinelia)

```sql
CREATE TABLE role_default_tag_whitelist (
  role      text NOT NULL,      -- 'nala', 'nia', 'nox', 'nash', ...
  tag_slug  text NOT NULL REFERENCES ficha_tags(slug),
  PRIMARY KEY (role, tag_slug)
);
```

Seed inicial (afinable con el equipo de producto contra roster real, ver Sección 12):

| role | tags |
|---|---|
| nala | contabilidad, cobranza, ventas, politicas, fiscal |
| nia | atencion_cliente, catalogo_productos, politicas, ventas, onboarding_clientes |
| nox | operaciones, logistica, atencion_cliente, politicas |
| nash | (todos) |
| nova | operaciones, logistica |
| nelia | atencion_cliente, politicas, onboarding_clientes |
| neka | contabilidad, cobranza, fiscal, operaciones |
| noah | ventas, catalogo_productos, atencion_cliente, marketing |
| navi | marketing, atencion_cliente, ventas, catalogo_productos |
| nalu | finanzas, contabilidad, fiscal |

Nash es transversal por default (auditor/reporting). Los demás tienen 3 a 5 tags por rol.

### 4.3 Tabla `org_role_tag_additions` (escape hatch aditivo)

```sql
CREATE TABLE org_role_tag_additions (
  org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role      text NOT NULL,
  tag_slug  text NOT NULL REFERENCES ficha_tags(slug),
  added_at  timestamptz NOT NULL DEFAULT now(),
  added_by  uuid REFERENCES users(id),
  PRIMARY KEY (org_id, role, tag_slug)
);
```

Whitelist efectiva de un meerkat en un org = `role_default_tag_whitelist(role) ∪ org_role_tag_additions(org_id, role)`. Solo permite agregar, nunca quitar (el core del rol es inmutable).

### 4.4 Tabla `agent_rules` (Reglas de operación)

```sql
CREATE TABLE agent_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  regla       text NOT NULL CHECK (char_length(regla) BETWEEN 1 AND 500),
  detalles    text CHECK (detalles IS NULL OR char_length(detalles) <= 2000),
  applies_to  text[] NOT NULL DEFAULT '{}',  -- lista de role slugs; vacío = todos
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id)
);

CREATE INDEX ON agent_rules (org_id, active);
CREATE INDEX ON agent_rules USING GIN (applies_to);
```

Semántica de `applies_to`:
- `applies_to = '{}'` (default): aplica a **todos** los meerkats del org.
- `applies_to = '{nala}'`: aplica solo a Nala.
- `applies_to = '{nala,nia}'`: aplica a Nala y Nia.

Nota terminológica: en este spec "role slug", "meerkat slug" y "role" refieren al mismo string identificador del meerkat (`nala`, `nia`, `nox`, etc.). Corresponde a la columna que hoy identifica al rol en `voice_agents` (nombre exacto de la columna a confirmar en auditoría, Sección 12).

No lleva tags. Reglas se stufean cuando `applies_to = '{}' OR meerkat_slug = ANY(applies_to)`, sin pasar por retrieval.

### 4.5 Tabla `agent_tasks` (Tareas programadas)

```sql
CREATE TYPE task_trigger_type AS ENUM ('cron', 'manual', 'phrase');

CREATE TABLE agent_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_agent_id  uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  slug            text NOT NULL,  -- identificador legible: 'cobranza_mensual'
  mission         text NOT NULL,
  trigger_type    task_trigger_type NOT NULL,
  trigger_config  jsonb NOT NULL,  -- ver 4.5.1
  parameters      text,
  deliverable     text NOT NULL,
  active          bool NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id),
  UNIQUE (owner_agent_id, slug)
);

CREATE INDEX ON agent_tasks (owner_agent_id, active);
CREATE INDEX ON agent_tasks (trigger_type, active) WHERE trigger_type = 'cron';
```

#### 4.5.1 Formato de `trigger_config`

```jsonb
-- cron
{ "cron": "0 9 5 * *", "timezone": "America/Monterrey", "next_run_at": "2026-10-05T15:00:00Z" }

-- phrase
{ "phrases": ["cobra a los morosos", "manda recordatorios de pago"], "match_mode": "semantic_or_literal" }

-- manual
{}
```

Un solo `trigger_type` por tarea (YAGNI). Si el cliente quiere cron + frase para la misma tarea, crea dos filas con misma `mission` y `slug` distinto. Simplifica scheduler y evita ambigüedad en el ledger.

### 4.6 Tabla `agent_task_runs` (historial de ejecuciones)

```sql
CREATE TABLE agent_task_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('running', 'success', 'error', 'cancelled')),
  trigger_source text NOT NULL CHECK (trigger_source IN ('cron', 'phrase', 'manual')),
  ledger_ops     int NOT NULL DEFAULT 0,   -- total ops consumidos (agregable con batched-consume)
  error_message  text,
  metadata       jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX ON agent_task_runs (task_id, started_at DESC);
```

Portal muestra historial por tarea con paginación (últimas 50 ejecuciones inline, resto detrás de "Ver más").

### 4.7 `fichas_informativas` (alteración del pack shipped)

```sql
ALTER TABLE fichas_informativas
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN autotag_status text NOT NULL DEFAULT 'pending'
    CHECK (autotag_status IN ('pending', 'done', 'manual_override', 'untagged_legacy', 'error'));

CREATE INDEX ON fichas_informativas USING GIN (tags);
CREATE INDEX ON fichas_informativas (org_id, autotag_status) WHERE autotag_status != 'done';
```

Estados de `autotag_status`:
- `pending`: ficha recién creada, autotag async no ha corrido.
- `done`: Sonnet asignó tags y el cliente aceptó tal cual (o autotag corrió sin UI porque es backfill).
- `manual_override`: cliente modificó los tags sugeridos por Sonnet al crear o después.
- `untagged_legacy`: ficha subida antes del ship, backfill pendiente. Participa del retrieval sin filtro con `tags = '{_untagged_}'`.
- `error`: autotag falló 3 veces. Alerta a Nash. Participa del retrieval sin filtro también.

Backfill masivo (Sección 10) mueve `untagged_legacy` a `done`.

## 5. Runtime: composición del system prompt del meerkat

Cuando un meerkat va a operar (chat, correo, voz), se ensambla su system prompt en este orden. Bloques 2 y 3 son nuevos.

### 5.1 Bloque 1: Base del rol (existente, sin cambios)

Personalidad, tools disponibles, capacidades por slug. Sigue viviendo en el prompt builder actual (`src/lib/prompts/meerkat-role-builder.ts` o donde esté hoy; se confirma en auditoría de Sección 11).

### 5.2 Bloque 2: Reglas aplicables (nuevo, siempre stuffed)

```sql
SELECT regla, detalles
FROM agent_rules
WHERE org_id = :org_id
  AND active = true
  AND (applies_to = '{}' OR :meerkat_slug = ANY(applies_to))
ORDER BY created_at DESC;
```

Se inyecta como bloque markdown:

```
## Reglas de tu negocio (respétalas siempre)
- Nunca ofrecemos descuentos sin mi aprobación
  Detalles: descuentos menores a 5% en cotizaciones grandes sí se pueden ofrecer.
- El horario laboral es lunes a viernes de 9 a 6
- Siempre validamos razón social antes de facturar
```

Overhead esperado: ~30 reglas × ~100 tokens promedio = ~3K tokens. Vive en el prompt cache de Anthropic. Invalidación de cache por evento cuando cambia una regla (RPC en Supabase con `pg_notify` o TTL 5 min como fallback).

### 5.3 Bloque 3: Tareas activas titulares (nuevo, solo cabezal stuffed)

```sql
SELECT id, slug, mission, trigger_type, trigger_config
FROM agent_tasks
WHERE owner_agent_id = :agent_id AND active = true
ORDER BY created_at DESC;
```

Se inyecta como bloque corto para que el meerkat sepa qué puede ejecutar por frase:

```
## Tareas que puedes ejecutar
- cobranza_mensual: cobrar a clientes con mora >30 días (dispara: día 5 cada mes, o si te dicen "cobra a los morosos")
- reporte_semanal: generar reporte de ventas (dispara: lunes 9am, o si te dicen "arma el reporte")
```

El detalle completo (`parameters` + `deliverable`) se carga solo cuando la tarea se ejecuta (frase match, cron dispara, o botón manual). Ahorra tokens.

### 5.4 Bloque 4: Fichas informativas (rediseñado)

Modo dual:

- **Modo stuffed** si el org tiene ≤20 fichas activas totales: carga todas las que estén en la whitelist efectiva del meerkat.
- **Modo retrieval** si >20 fichas: pipeline de tres pasos (Sección 6).

Threshold 20 configurable por org via `organizations.features.fichas.stuffed_threshold`.

### 5.5 Bloque 5: Contexto del turno (existente)

Historial de la conversación, canal, memoria de sesión. Sin cambios.

### 5.6 Presupuesto de tokens del system prompt

| Bloque | Worst case |
|---|---|
| Base del rol | ~2K |
| Reglas stuffed | ~3K (30 reglas × 100 tokens) |
| Tareas titulares | ~1K (5-10 tareas × 100 tokens) |
| Fichas stuffed cuando aplique | ~5K (20 fichas × 250 tokens) |
| Fichas retrieval cuando aplique | ~4K (top-5 × 800 tokens) |
| **Total esperado** | **~11K tokens fijos por llamada** |

Se paga full en el primer request cada 5 min (miss del prompt cache); el resto cacheado. Beneficio directo por el prompt caching de Anthropic.

### 5.7 Logging (obligatorio)

Todas las nuevas llamadas a Anthropic pasan por `logLlmCall` sin excepción. Enforced por `pnpm lint` según [[feedback-anthropic-debe-loggearse]]. Aplica a:
- Autotag de fichas (Sonnet).
- Rerank de retrieval cuando aplique (Haiku).
- Ejecución de Tarea programada (Sonnet o el modelo default del meerkat).

## 6. Retrieval de fichas informativas con tags

Solo aplica cuando el org tiene >20 fichas activas (modo retrieval, ver 5.4). Pipeline de tres pasos.

### 6.1 Paso 1: Pre-filtro SQL por whitelist del meerkat

Se calcula la whitelist efectiva del meerkat consultante (union de default + org additions). Cache 5 minutos por `(org_id, meerkat_slug)`.

```sql
SELECT id, contenido, embedding, tags, titulo
FROM fichas_informativas
WHERE org_id = :org_id
  AND active = true
  AND autotag_status IN ('done', 'manual_override', 'untagged_legacy', 'error')
  AND (
    tags && :effective_whitelist
    OR tags = '{_untagged_}'
  );
```

Reduce el universo del ~100% al ~20-30% del total según cliente y meerkat. Índice GIN sobre `tags` hace el filtro barato.

Fichas `untagged_legacy` y `error` participan sin filtro (fallback seguro durante migración).

### 6.2 Paso 2: Semantic search sobre el subset

Embedding de la query del turno con el modelo actual ya usado por `fichas_informativas` (OpenAI text-embedding-3-small o Voyage; se confirma en Sección 12). Top-K = 15 por distancia cosine con pgvector.

### 6.3 Paso 3 (condicional): Rerank con Haiku

Se activa si al menos una de estas es cierta:
- Org tiene >100 fichas totales.
- Top-K semánticos tienen distancias muy cercanas: `top_5_max_distance - top_5_min_distance < 0.05` (indicador de retrieval ruidoso).
- Feature flag `rerank_enabled` está activo para el org.

Prompt del rerank (Haiku):

```
Sistema: Estos son fragmentos recuperados de la base de conocimiento del negocio del cliente
para responder a esta pregunta: "{query}".

Devuelve los IDs de los 5 fragmentos que REALMENTE responden. Si menos de 5 son relevantes,
devuelve menos. Formato: JSON array de IDs.

Fragmentos:
1. [id: uuid, titulo: ..., contenido_preview: primeras 200 palabras]
...

Responde solo con: {"ids": ["...", "..."]}
```

Costo estimado: ~$0.0001 por consulta. Absorbido en el `1 op runtime` que la ficha ya cobra.

### 6.4 Composición final del bloque de contexto

Los top-K finales (5 con rerank, 15 sin rerank) se inyectan como bloque en el system prompt:

```
## Contexto relevante de tu negocio
### {ficha 1 titulo}
{contenido completo o preview según longitud, capado a 2K tokens por ficha}

### {ficha 2 titulo}
{contenido}
...
```

Capado global a 5 fichas y 10K tokens de bloque combinado, ajustable por org.

### 6.5 Failure modes con fallback

| Fallo | Fallback | Log |
|---|---|---|
| Pre-filtro devuelve 0 fichas (whitelist no matchea) | Semantic search sin filtro | Warning: whitelist_no_match, señal fuerte para revisar rol o tags |
| Embedding falla (OpenAI down, timeout) | Full-text tsvector sobre `contenido` | Warning: embedding_fallback |
| Rerank falla (Anthropic down) | Devuelve top-K semánticos sin rerank | Warning: rerank_fallback |
| Todo falla | Devuelve fichas top-N por `updated_at DESC` | Error: retrieval_full_fallback + alerta Nash |

### 6.6 Métricas de producción (eval periódica)

Alineado con regla 8 del CLAUDE.md global:

- **Recall del pre-filtro**: eval set curado detecta si una ficha correcta se pierde en paso 1. Bug del rol o del autotag.
- **Precisión post-rerank**: sample humano semanal, "las top-5 son relevantes o no" (binario por ficha).
- **Costo por retrieval**: tokens embedding + Haiku vs pool cobrado. Auditable ledger.
- **Untagged_legacy stall**: cron chequea si el backfill avanza (<5% en 24h dispara alerta).

## 7. UI Portal

### 7.1 Onboarding wizard (primera activación de meerkat client-facing)

Se dispara al activar el primer meerkat client-facing del org, después de que el cliente ya subió fichas informativas básicas (dependencia dura sobre el pack shipped).

Wizard de 4 pantallas:

**Pantalla 1: Bienvenida.**
> Vamos a enseñarle a tu empleado digital cómo opera tu negocio. Toma de 5 a 8 minutos y hace que trabaje con tu criterio, no con el de nadie más.

**Pantalla 2: Reglas base.**
Muestra 3 ejemplos concretos como inspiración. Cliente escribe 3 a 5 reglas cortas. Cada card:
- Campo "Regla" obligatorio (max 500 chars, contador visible).
- Campo "Detalles opcionales" (max 2000 chars).
- Toggle "Aplica a todos" default ON. Al apagar, aparece multi-select de meerkats activos del org.

**Pantalla 3: Tareas base.**
Muestra 2 ejemplos por industria (ejemplo por defecto: comercio, servicios). Cliente escribe 1 a 2 tareas. Wizard corto de 4 sub-pasos, uno por campo MAPS:
- Sub-paso 1: "¿Qué debe lograr esta tarea?" (mission, max 500 chars).
- Sub-paso 2: "¿Cuándo se dispara?" Selector visual:
  - Calendario con opciones legibles: "cada día X del mes", "cada [día de la semana] a las [hora]", "cada [hora] al día". Genera `cron` internamente sin exponerlo.
  - Frase: texto libre. Preview: "cuando alguien te diga 'cobra a los morosos', ejecutas esta tarea".
  - Solo manual: "yo la disparo desde el portal".
- Sub-paso 3: "Reglas específicas de esta tarea" (parameters, opcional).
- Sub-paso 4: "¿Cómo te entrega el resultado?" Selector: correo, mensaje en portal, WhatsApp al dueño, resumen tácito (sin entregable visible al cliente).

**Pantalla 4: Resumen y confirmar.**
Vista de todo lo que va a quedar guardado. Botón "Guardar y activar". Botón "Saltar por ahora" siempre visible con nota: "Sin esto tu empleado va a operar sin contexto de tu negocio."

### 7.2 Sección "Reglas del negocio" (org-level)

Ruta: `/portal/reglas`.

Nav lateral: bajo "Mi negocio", junto a "Fichas informativas".

Vista de cards, una por regla:

```
Regla: nunca ofrecemos descuentos sin mi aprobación
Detalles: descuentos menores a 5% en cotizaciones grandes sí se pueden ofrecer.
Aplica a: Todos los empleados
[Editar] [Desactivar] [Eliminar]
```

Cuando `applies_to` no es "todos", muestra chips con los meerkats afectados:
```
Aplica a: [Nia] [Nala]
```

Botón "+ Nueva regla" abre modal con:
- Campo "Regla" (textarea, contador).
- Campo "Detalles opcionales" (textarea).
- Toggle "Aplica a todos" (default ON) + multi-select condicional.

Ordenamiento default: más reciente arriba. Búsqueda por texto libre.

Tooltip educativo que aparece la primera vez que se entra a esta sección:
> Regla es cómo opera tu negocio siempre (aplica a todo). Tarea es algo específico que quieres que suceda en cierto momento (aplica a un empleado). Si dudas, empieza con reglas.

### 7.3 Sección "Tareas de [meerkat]" (por perfil de meerkat)

Ruta: `/portal/meerkats/[slug]/tareas`.

Vista de cards por tarea:

```
Cobranza mensual
Se dispara cada día 5 del mes.
Última ejecución: 5 sep 2026, todo correcto (12 correos, 14 ops).
Próxima: 5 oct 2026.
[Ejecutar ahora] [Editar] [Ver historial] [Desactivar]
```

Botón "+ Nueva tarea" abre el mismo wizard corto de 4 sub-pasos de 7.1.

Ver historial abre panel lateral con `agent_task_runs` paginados. Cada run muestra timestamp, resultado, ops consumidos, botón "Ver detalle" que abre el log completo si aplica.

### 7.4 Upgrade en modal "Nueva ficha informativa" (pack shipped)

Cambio menor al modal existente. Al llenar la ficha, aparece bloque:

```
Sugerencias de categoría (elegidas por Centinelia según el contenido):
[✓ contabilidad]  [✓ políticas]  [+ agregar otra]
```

Sonnet devuelve 1 a 3 chips pre-seleccionados. Cliente puede quitar o agregar de la lista fija de 15 tags.

Al guardar:
- Aceptó tal cual: `autotag_status = 'done'`.
- Modificó algo: `autotag_status = 'manual_override'`.

### 7.5 Reglas de copy

- Cero jerga técnica en cliente-facing: nada de "trigger", "cron", "prompt", "system message", "IA", "AI", "embedding", "retrieval". En su lugar: "se dispara", "cuando pasa esto", "cómo trabaja".
- Respetar [[feedback-no-ia-visible]], [[feedback-no-em-dash]], [[feedback-espanol-completo]] (ñ, á, é, í, ó, ú, ¿, ¡), [[feedback-regionalismos-regio-vs-chilango]] (evitar "te late").
- Respetar [[feedback-empleado-digital]]: lenguaje HR, "empleado" no "agente".

## 8. Cobro y consumo del pool

### 8.1 Setup (crear objetos)

| Objeto | Ledger reason | Ops | Metadata |
|---|---|---|---|
| Regla | `rule_setup` | 1 | `{rule_id, applies_to}` |
| Tarea | `task_setup` | 1 | `{task_id, trigger_type}` |
| Ficha informativa (existente) | `ficha_setup` | 1 | `{ficha_id}` |

Idempotencia: request lleva `client_dedup_key`, ledger verifica antes de insertar.

Reglas de fallo:
- Insert falla → NO cobra.
- Validación de cron/phrase inválida → NO cobra.
- Autotag Sonnet falla (ficha) → ficha se guarda con `autotag_status = 'pending'`, cobra igual el setup (retry async).

### 8.2 Runtime

| Acción | Ledger reason | Ops | Metadata |
|---|---|---|---|
| Meerkat consulta reglas stuffed | (ninguno, incluido en llamada del meerkat) | 0 | - |
| Meerkat consulta fichas via retrieval | `ficha_retrieval` (existente) | 1 | `{ficha_ids: [...]}` |
| Tarea programada arranca | `task_execution_start` | 1 | `{task_id, run_id, trigger_source}` |
| Tarea ejecuta N side-effects | `task_action` con `count = N` | N | `{task_id, run_id, action_types: ['email', 'invoice']}` |

Reglas de fallo:
- Tarea falla antes de cualquier side-effect: cobra solo arranque (1 op). Sin refund. Cliente pagó por trabajo iniciado (contexto compuesto, LLM consultado).
- Rerank falla: no cobra extra; el fallback ya cae en `ficha_retrieval` con su costo normal.
- Embedding falla: no cobra extra; el fallback tsvector consume la misma cuenta que `ficha_retrieval`.

Alineado con [[feedback-pool-accuracy-top-priority]] y [[feedback-zero-debt]]: todo cobra, cero gaps.

### 8.3 Casos que NO cobran

- Backfill de autotag durante migración: `bill_to = 'centinelia_migration'`, no toca pool cliente.
- Retry async de autotag si sync falló: 0 ops.
- Evaluaciones periódicas de recall/precisión (regla 8): `bill_to = 'centinelia_eval'`. [[feedback-batch-eval-no-charge]].
- Edición de regla o tarea existente: 0 ops (corrección).
- Desactivar o reactivar: 0 ops.
- Cambio manual de tags de una ficha existente: 0 ops.
- Consulta del meerkat a reglas stuffed: incluido en costo normal de llamada del meerkat.

### 8.4 Ledger entries navegables

Cada entry lleva `metadata.related_object_id` para navegación bidireccional entre ledger y objeto. Portal muestra en historial de una tarea:

```
Ejecución del 5 sep 2026 09:00:
  - Arranque: 1 op
  - Correos enviados: 12 ops (batched)
  - Reporte final: 1 op
  Total: 14 ops
```

Respeta [[feedback-pool-transparencia]].

### 8.5 Drift detector (Nash)

`project_centinelia_pool_drift_detector` (Nash hourly) se extiende con dos checks nuevos:

1. **Task action sin execution_start**: `task_action` en ledger cuyo `run_id` no tiene un `task_execution_start` correspondiente = bug de cobro.
2. **Untagged_legacy stall**: si un org lleva >7 días con fichas en `autotag_status = 'untagged_legacy'` y `retrieval_v2_enabled = true`, alerta a Nash.

### 8.6 Planes y setup fee

- Planes existentes ([[project-centinelia-pricing]]): MJ 250min+300ops, JC 500min+600ops, AD 1000min+1200ops.
- Las nuevas ops (rule_setup, task_setup, task_execution_start, task_action) consumen del mismo pool de ops del plan. No se separan.
- Setup fee $14,990 MXN cubre: onboarding wizard, creación inicial de reglas y tareas base, backfill de tags de fichas ya subidas. Se documenta explícito en copy del setup fee.
- No se cobra retroactivo a clientes existentes. Migración es gratis para el cliente actual.

## 9. Migración de datos existentes

### 9.1 Backfill de tags sobre `fichas_informativas`

- **Job**: `backfill-ficha-tags`, corre continuo en loop cuando hay trabajo y sleep cuando no. Vive en `src/lib/workers/` o donde estén los workers actuales (se confirma en auditoría).
- **Batching**: procesa 50 fichas por vuelta con Sonnet en modo batch API cuando aplique.
- **Rate limit**: ~10 fichas/segundo agregado, backoff exponencial ante 429.
- **Orden**: por `created_at ASC` dentro del org (primero las fichas más viejas).
- **Rollout por org**: feature flag `retrieval_v2_enabled` per-org. Santiago NL primero. Batches de 3-5 orgs por semana después de 48h de estabilidad.
- **Cero cobro al cliente**: `bill_to = 'centinelia_migration'`.
- **Retry policy**: fichas que fallen autotag se marcan `pending`, se reintentan hasta 3 veces. Si siguen fallando: `autotag_status = 'error'`, alerta a Nash, quedan participando del retrieval sin filtro.

### 9.2 Migración de datos legacy de config del empleado y del org

Si la auditoría (Sección 11) encuentra que clientes reales tienen datos poblados en campos que van a desaparecer (por ejemplo `agents.custom_instructions`, `organizations.business_policies`, etc.), hay que migrarlos antes del hard delete.

Script `migrate-legacy-agent-config-to-rules-and-tasks.ts`:

Para cada agente/org con campos legacy poblados:
1. Sonnet lee el texto y clasifica: "regla permanente" vs "tarea con trigger" vs "ambiguo".
2. Reglas claras → insert en `agent_rules` con `applies_to = [agent_slug]` (o `applies_to = '{}'` si el campo era del org).
3. Tareas claras → insert en `agent_tasks` con `owner_agent_id = agent.id`, `trigger_type = 'manual'` por default. Cliente puede después agregar cron o frase.
4. Ambiguo → insert en `agent_rules` con `active = false` y `detalles = 'Regla migrada de tu configuración anterior. Revisa y activa si sigue aplicando.'`.

Costo Sonnet absorbido, `logLlmCall` sin cobro al cliente. Ejecuta ANTES del deploy del hard delete para que no haya ventana de datos perdidos.

### 9.3 Backwards compatibility durante rollout

- Fichas `untagged_legacy` participan del retrieval sin filtro (paso 1 las incluye con `OR tags = '{_untagged_}'`).
- Reglas y tareas son features nuevas, funcionan desde el día 1 sin depender del backfill.
- Cliente sin `retrieval_v2_enabled`: retrieval antiguo funciona idéntico a hoy.

### 9.4 Métricas del backfill

Trackeadas por Nash hourly:
- % fichas con `autotag_status = 'done'` por org.
- Alerta si avance <5% en 24h para un org activo.
- Alerta si `autotag_error_rate > 10%` en un batch (prompt malo, enum insuficiente, o problema Sonnet).
- Reporte al finalizar el backfill: distribución de tags asignados por org, para detectar tags sub-utilizados o faltantes.

## 10. Feature flags, kill switches, rollout secuencial

### 10.1 Feature flags (per-org)

| Flag | Alcance | Default | Kill switch impacto |
|---|---|---|---|
| `agent_missions_enabled` | Reglas + Tareas + wizard onboarding | OFF | Off = bloque de Reglas y Tareas no se inyecta en system prompt, cron scheduler ignora tareas del org, phrase listener ignora tareas del org. Meerkats vuelven al comportamiento pre-ship. |
| `retrieval_v2_enabled` | Pipeline nuevo de retrieval con tags | OFF | Off = pipeline cae a retrieval antiguo sin filtro por tag. Tags asignados quedan inertes. |
| `rerank_enabled` | Rerank con Haiku (etapa 3) | OFF | Off = retrieval sigue con dos pasos, devuelve top-K semánticos sin rerank. |

Los tres flags son independientes. Un org puede tener solo uno activo.

### 10.2 Fases del rollout

**Fase 0: Deploy dark.**
- Código en producción, todos los flags OFF.
- Verificación: los flujos existentes funcionan idénticos (regresión zero).
- Duración: 24-48h de observación antes de Fase 1.

**Fase 1: Cuenta interna dev.**
- Activar los 3 flags para una cuenta explícita de test interna. **Cuenta a usar: por confirmar con Nazre antes de arrancar**, típicamente un `nazre20+centinelia-dev@gmail.com` o similar creada específicamente para este piloto.
- **Prohibido**: usar cuentas reales de cliente (Tortillería, Santiago NL, AC Proyectos). Ver [[feedback-tortilleria-portal-real]] y [[feedback-no-test-a-clientes]].
- Nazre y Beatriz crean 5 reglas + 3 tareas + suben 30 fichas nuevas.
- Verificaciones: tareas se disparan por cron, frase y manual sin errores. Meerkats respetan reglas en muestras de conversación. Autotag propone tags coherentes >90%.
- Si algo falla, fix inmediato, no avanzar.

**Fase 2: Santiago NL.**
- Activar `agent_missions_enabled` y `retrieval_v2_enabled`. Backfill de tags arranca en background.
- Comunicación previa al cliente por correo o WhatsApp, redactado en tono de mejora para su negocio.
- Monitor 48-72h: métricas de recall, precisión, latencia, costo por retrieval, tasa de reglas violadas.
- Criterio para avanzar: 0 quejas + eval no baja >10% + costo por retrieval no sube >30%.

**Fase 3: Tortillería Estrella.**
- Activar igual. Ojo especial en Nala (facturación) y Neka (ops).
- Monitoreo 5-7 días antes de Fase 4.

**Fase 4: Resto de orgs en batches de 3-5 por semana.**
- Priorización por volumen de fichas y actividad.
- Activar viernes en la noche, monitor sábado y domingo, evaluar el lunes.

**Fase 5: Ship-complete.**
- Todos los orgs con feature activo.
- Feature flags permanecen como kill switches por 60 días.

### 10.3 Regla de rollback por fase

- Falla en Fase 1: fix inmediato, no avanzar.
- Falla en Fase 2 (Santiago NL): kill switch específico, no avanzar. Investigar y corregir antes de intentar Fase 3.
- Falla en Fase 3+: kill switch para el org afectado, avanzar con los demás si el bug es específico del cliente. Si es sistémico, retroceder todos.

### 10.4 Sunset del código antiguo (futuro)

PR separado, mínimo 60 días post ship-complete sin incidentes:
- Eliminar path del retrieval antiguo (sin filtro).
- Eliminar path del prompt builder sin Reglas y Tareas.
- Eliminar los feature flags (comportamiento único).

No bloquea nada. Deuda técnica trackable en `learnings.md` del brain.

## 11. Auditoría previa (bloqueante antes de implementación)

Antes de escribir código de las tablas nuevas y componer los nuevos prompts, se ejecuta esta fase de investigación. Su output alimenta el plan de implementación con listas concretas de qué depurar.

### 11.1 Pasos de auditoría

1. **Grep en portal (frontend)**:
   - Componentes de config del empleado con campos que se vuelven redundantes ("instrucciones", "prompt personalizado", "notas", "reglas específicas del agente").
   - Componentes de config del org con campos redundantes ("políticas generales", "reglas del negocio" antiguas).
   - Formularios que capturan estos campos y sus validaciones.

2. **Grep en backend**:
   - Endpoints que leen esos campos (rutas API bajo `/api/agents/[id]/config`, `/api/orgs/[id]/policies`, o similares).
   - System prompt builders que inyectan esos campos.
   - Tools de meerkats que consultan esos campos.

3. **Grep en Supabase**:
   - Columnas de `voice_agents`, `organizations` y afines que quedan muertas.
   - Foreign keys que se rompen al drop.

4. **Output**: sección `## Depuración inline` del spec (o addendum) con lista específica:
   ```
   - voice_agents.custom_instructions (text) → reemplazado por agent_rules.regla + agent_tasks
   - organizations.business_policies (text) → reemplazado por agent_rules (applies_to = '{}')
   - src/lib/prompt-builder/legacy-instructions.ts → eliminar
   - src/app/api/agents/[id]/instructions/route.ts → eliminar
   - src/components/agent-config/CustomInstructionsField.tsx → eliminar
   ...
   ```

5. **Migración de datos**: si algún campo tiene datos poblados en clientes reales, se ejecuta el script de Sección 9.2 antes del hard delete.

### 11.2 Producto de la auditoría

- Lista concreta de campos, componentes, endpoints, archivos a eliminar.
- Lista de tablas y columnas a `ALTER TABLE ... DROP COLUMN`.
- Confirmación de qué scripts de migración son necesarios (o "ninguno" si los campos están vacíos en producción).
- Confirmación de nombres exactos de tablas y convenciones existentes (por ejemplo `voice_agents` vs `agents`).

Sin este output, el plan de implementación no se puede escribir con precisión.

## 12. Puntos abiertos a resolver en el plan de implementación

Estos son puntos concretos que dependen de leer el código actual y no pueden decidirse en el spec sin verificar. Se resuelven en la fase de writing-plans o de auditoría (11):

1. **Convención de nombres de tabla**: `voice_agents` es la tabla actual según brain README. Confirmar que `owner_agent_id` en `agent_tasks` referencia a `voice_agents(id)`.
2. **Modelo de embeddings actual**: brain menciona `fichas_informativas` con embeddings, pero no especifica el modelo. Confirmar text-embedding-3-small vs Voyage vs otro.
3. **Ubicación del prompt builder**: `src/lib/prompts/*` o `src/lib/agents/prompt-builder.ts` o similar. Auditoría lo localiza.
4. **Roster real de meerkats**: brain README menciona Nia, Nox, Niva, Nova, Neo, Naia. Memoria auto-local menciona además Nala, Nelia, Neka, Noah, Navi, Nalú. Confirmar contra tabla `voice_agents` distinct `role`.
5. **Seed inicial de `role_default_tag_whitelist`**: la propuesta de 4.2 se afina contra el roster real y contra los packs de tools activos de cada rol.
6. **Feature flag storage**: existe `organizations.features` jsonb según brain (patrón de Navi). Confirmar que los tres flags nuevos entran ahí.
7. **Cron scheduler**: patrón actual para tareas programadas del sistema (crons Vercel según [[project-centinelia-crons]]). El nuevo scheduler de `agent_tasks` debe integrarse a la infra existente, no duplicarla.

## 13. Riesgos conocidos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Autotag Sonnet asigna tags equivocados | Ruido en retrieval | Cliente valida en modal antes de guardar; escape hatch para editar tags después; alerta si tag distribution está muy sesgada |
| Cliente escribe reglas contradictorias | Meerkat confundido, respuestas inconsistentes | Sonnet detecta contradicción entre reglas al guardar y avisa; cliente puede confirmar o corregir |
| Tarea programada dispara y hace daño (correo masivo mal escrito, cobros incorrectos) | Impacto reputacional al cliente | Kill switch immediato; requerir preview de deliverable en primera ejecución; feature flag por org |
| Backfill de fichas explota Anthropic rate limit | Retraso en migración | Rate limit ~10 fichas/seg + batch API cuando aplique; alerta si stall >24h |
| Pre-filtro por whitelist excluye ficha relevante | Recall baja | Fallback a sin filtro cuando 0 matches + log; eval periódico detecta; escape hatch permite agregar tag al rol |
| Costo de tokens sube por reglas stuffed + tareas titulares | Margen baja | Prompt caching de Anthropic amortiza; overhead esperado ~4K tokens fijos, manejable con caching |
| Depuración de campos legacy borra datos que un cliente sí usaba | Cliente pierde config | Migración obligatoria antes del delete + validación por org que no queden datos huérfanos |
| Feature flag mal configurado activa rollout prematuro | Cliente afectado sin aviso | Flag off por default, activación manual per-org por Nazre, comunicación previa obligatoria |

## 14. Fuera de alcance (v2+)

Ideas conversadas pero explícitamente fuera de v1:

- **Eventos del sistema como trigger**: correo entrante, webhook Dropbox, mensaje WhatsApp. Requiere event bus interno.
- **Cascadas entre meerkats**: "cuando Nala termine su tarea, Nash arranca la suya". Requiere workflow engine.
- **Tareas multi-meerkat coordinadas explícitas**: hoy se resuelve con invocación dinámica de tools (Nala llama a Nash como tool). En v2 se puede modelar explícito si aparece el patrón.
- **Detección de meerkat hablando con otro meerkat cross-org por correo**: header `X-Sent-By: centinelia-nala-v2` + cambio de tono a más estructurado. Requiere trickle antes de estandarizar.
- **Plantillas por industria pre-cargadas en onboarding**: cliente elige "soy tortillería / restaurante / clínica veterinaria" y se cargan reglas + tareas plantilla. Se agrega cuando haya 3+ industrias con demanda comprobada.
- **Segundo nivel de tags (subtags)**: hoy tags son planos (`contabilidad`). En v2, `contabilidad:facturas_mensuales` como refinamiento para semantic search.
- **Loop-breaker para tareas que hablan entre sí**: si dos meerkats intercambian correos >6 rondas sin cerrar, escalar a humano.

## 15. Post-ship: promover al brain

Este spec vive en `docs/superpowers/specs/`. Post-aprobación del user review y post ship-complete, se crean estos artefactos en el brain (fuente autoritativa según brain README):

1. **`.brain/decisions/2026-09-24-reglas-tareas-y-tags-fichas.md`** - Decisión inmutable con contexto, alternativas evaluadas, y decisión final. Referencia a este spec.
2. **`.brain/policies/agent-missions-and-ficha-tags.md`** - Reglas de operación de este subsistema. Cómo se crea una nueva regla, cómo se cambia una whitelist de rol, cuándo se activa el rerank, etc.
3. **`.brain/skills/adding-agent-rule-or-task.md`** - Checklist ejecutable para agregar reglas/tareas nuevas por parte del equipo.

Estos artefactos son parte de la definition of done del proyecto, no del spec inicial.

---

## Referencias a memoria y brain

Este spec depende de y respeta:

- [[feedback-no-custom-meerkat]] - roles vía /pedir-rol, no custom
- [[feedback-tool-bloat-reglas]] - tope 12-15 tools por meerkat, adapter, feature flag
- [[feedback-pool-work-based]] - cada acción cobra 1 tarea; voz=minutos, chat/correo/acciones=tareas
- [[feedback-pool-accuracy-top-priority]] - cero gaps en cobro, todo se registra
- [[feedback-pool-transparencia]] - ledger event-sourced y auditable
- [[feedback-batched-consume-multi-io]] - N side-effects = 1 cobro count=N
- [[feedback-batch-eval-no-charge]] - evaluaciones no cobran al cliente
- [[feedback-anthropic-debe-loggearse]] - logLlmCall enforced por pnpm lint
- [[feedback-zero-debt]] - bug o gap se arregla en la misma sesión
- [[feedback-empleado-digital]] - lenguaje HR, no "agente"
- [[feedback-no-ia-visible]] - nunca "IA" en copy visible al cliente
- [[feedback-no-em-dash]] - sin em-dashes en copy español
- [[feedback-espanol-completo]] - ñ, á, é, í, ó, ú, ¿, ¡ obligatorios
- [[feedback-regionalismos-regio-vs-chilango]] - evitar "te late"
- [[feedback-hide-over-disable]] - hide sobre disable (no aplica cuando reemplazo es 100%, ver Sección 11)
- [[feedback-close-gaps-before-testing]] - self-rating <10/10 con gaps atacables se cierra antes de test real
- [[project-centinelia-fichas-informativas]] - pack shipped 2026-09-23 sobre el que se construye
- [[project-centinelia-pool-drift-detector]] - Nash hourly, se extiende (Sección 8.5)
- [[project-centinelia-pricing]] - planes MJ/JC/AD, setup fee $14,990
- [[project-centinelia-crons]] - 52 activos, cron scheduler existente que se integra
- Brain: `.brain/README.md`, `.brain/policies/tool-completeness.md`, `.brain/decisions/2026-08-18-3-canales-obligatorio.md`
