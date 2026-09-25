---
name: agent-missions-and-ficha-tags
description: Reglas duras para Reglas de negocio, Tareas programadas (agent missions) y Tags de fichas. Cubre catálogo de tags, whitelist por rol, autotag, cobro y cuándo NO usar cada objeto.
type: policy
owner: nazre
last_verified: 2026-09-25
---

# Policy: Agent Missions and Ficha Tags

## Por qué

Reglas, Tareas y Tags son parte del sistema de contexto del meerkat.
- **Reglas** (org-level, applies_to opcional): políticas del negocio que el meerkat respeta siempre.
- **Tareas programadas** (por meerkat con dueño): recipes con trigger (cron, manual, frase).
- **Tags de fichas** (catálogo controlado 15 slugs): whitelist por rol para filtrar retrieval.

Estos objetos son primeros de su tipo en Centinelia. Su calidad determina la percepción del cliente sobre qué tan inteligente es su empleado.

## Cómo aplicar

### Agregar un tag nuevo al catálogo

Requiere PR con:
1. Migration nueva: `INSERT INTO ficha_tags (slug, label_es, descripcion, orden) VALUES ('nuevo_tag', 'Etiqueta', 'descripcion', 160);` (usa orden superior al max actual).
2. Actualizar `TAG_CATALOG` en `src/app/portal/[token]/TagSuggestionsChips.tsx` con el nuevo slug + label.
3. Actualizar `role_default_tag_whitelist` para roles que aplican.
4. Actualizar prompt de autotag en `src/lib/autotag/prompt.ts` para incluir el nuevo slug en la lista.

### Cambiar la whitelist de un rol

Requiere migration explícita. Nunca modificar `role_default_tag_whitelist` en runtime sin PR review.

### Activar feature flags para un cliente

Solo via SQL manual + comunicación previa al cliente. Ver `docs/runbooks/2026-09-25-reglas-tareas-tags-rollout.md`.

### Crear una Regla para un cliente en Setup

Cliente entra por primera vez a través del wizard onboarding. Si Nazre necesita setup manual (cliente sofisticado que quiere reglas específicas antes del wizard), usar `INSERT INTO agent_rules ...` con `applies_to` correcto y `created_by='nazre_setup'`.

### Cuándo NO usar Reglas

- Para configuración técnica del meerkat (voz, personalidad, tools). Eso vive en `meerkat-roles.ts` + `voice_agents.features`.
- Para conocimiento del negocio (procesos, productos, servicios). Eso vive en fichas informativas.
- Para tareas ad-hoc de un solo uso. Reglas son permanentes; para acciones únicas usar Tareas manuales.

### Cuándo NO usar Tareas programadas

- Para acciones one-off. Un botón "Ejecutar ahora" en el portal es suficiente sin crear una tarea persistente.
- Para procesos internos de Centinelia. Eso va en crons de sistema, no en Tareas del meerkat.

## Guardrails

- Autotag Sonnet debe validar que los tags devueltos existen en el catálogo. Nunca aceptar tags inventados.
- Cron scheduler debe verificar `agent_missions_enabled` per-org antes de ejecutar cualquier tarea.
- Executor v1 NO ejecuta tools reales todavía. Antes de activar `agent_missions_enabled` para un cliente productivo, verificar que sus tareas no requieran acciones automáticas (correo, cfdi, etc.) hasta que v2 esté lista.
- Cobro: task_action se cobra por batch (feedback_batched_consume_multi_io). rule_setup cobra 1 op al crear. Backfill masivo NO cobra al cliente.

## Referencias

- Decision: `.brain/decisions/2026-09-25-reglas-tareas-y-tags-fichas.md`
- Spec: `docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md`
- Runbook: `docs/runbooks/2026-09-25-reglas-tareas-tags-rollout.md`
- Skill: `.brain/skills/adding-agent-rule-or-task.md`
