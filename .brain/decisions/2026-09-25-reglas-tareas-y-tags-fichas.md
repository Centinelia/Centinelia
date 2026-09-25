---
name: 2026-09-25-reglas-tareas-y-tags-fichas
description: Arquitectura de Reglas de negocio, Tareas programadas y Tags de fichas para meerkats. 9 fases, 3 tablas nuevas, cobro por acción, feature flags por org.
type: decision
owner: nazre
decided_on: 2026-09-25
last_verified: 2026-09-25
supersedes: none
---

# Reglas, Tareas y Tags en Fichas Informativas

## Contexto

Centinelia empezó Q3 2026 con pack de `fichas_informativas` para dar contexto a los meerkats. El pack shipped 2026-09-23 tenía dos huecos operacionales:
- Escalaba mal: sin filtrado por dominio, más de 100 fichas por org producía ruido en retrieval y alucinaciones silenciosas.
- No permitía al dueño de PyME instruir tareas específicas en su lenguaje (setup fee dependía de configuración manual por Centinelia).

Diseñado 2026-09-24 (brainstorming + spec), implementado 2026-09-24 al 2026-09-25 (9 fases).

## Alternativas consideradas

1. **Solo 1 objeto (Reglas + Tareas fusionadas)**: rechazado por conflación conceptual entre políticas permanentes y recipes ejecutables. Nazre eligió 2 objetos separados con copy educativo.
2. **Alcance por meerkat individual**: rechazado. Reglas son políticas del negocio, no del empleado. Adoptado alcance por org con `applies_to` opcional.
3. **Tags libres por cliente**: rechazado. Sin catálogo controlado, whitelist por rol imposible de mantener. Adoptado enum fijo de 15 tags controlado por Centinelia.
4. **Autotag manual por cliente**: rechazado. Alta fricción, cliente PyME no quiere pensar en categorización. Adoptado autotag Sonnet + validación editable (patrón Neka CSF).
5. **Rutas de portal `/portal/meerkats/[slug]/tareas`**: divergido en implementación a `/configurar?tab=tareas` (integrado en la config per-agent existente). Deuda arquitectónica documentada.
6. **DROP COLUMN transfer_rules destructivo**: rechazado por Nazre (no romper). Adoptado hide UI + limpiar prompt builder + preservar columna en DB como safety net.

## Decisión final

Diseño arquitectural en 9 fases:
- Fase 1-4: infra tags, Reglas, Tareas, Retrieval con tags.
- Fase 5: UI Portal (wizard onboarding + secciones Reglas/Tareas + upgrade modal fichas).
- Fase 6: autotag Sonnet + backfill worker + Nash checks.
- Fase 7: Cobro y ledger extension (7 reasons, chargeOrgDirectly org-level fallback).
- Fase 8 MODIFICADA: migración legacy transfer_rules a agent_rules SIN DROP COLUMN.
- Fase 9: Feature flags + rollout gradual.

Convenciones clave:
- FK a organizations por `portal_email TEXT` (no `org_id UUID`).
- Meerkat role slug vía `agent.features->>meerkat_role_id` jsonb (no columna directa).
- Naming migrations 14 dígitos timestamp.
- `logLlmCall` obligatorio (enforcement `pnpm lint`).
- Cero cobro cliente en migraciones internas (bill_to='centinelia_migration').

## Rulings acumulados durante ejecución

- Endpoint `/agent-missions/` (tabla sigue siendo `agent_tasks`) por colisión histórica con endpoint preexistente.
- `applies_to` con `meerkat_role_id` slug (no UUID) -- corregido en fix round de Fase 5.
- Executor v1 narra sin ejecutar tools reales (v2 requiere refactor de tool-calling).
- Autotag síncrono al crear ficha absorbido (no cobra ops adicionales).
- Feature flag `agent_missions_enabled` default OFF; secciones UI siempre visibles (feedback_hide_over_disable).
- Drift SQL Editor histórico requirió migration repair (147 hashes revertidos + 47 aplicados). Aún hay 2 archivos legacy con timestamp duplicado `20260923120000` (deuda de cleanup separada).

## Referencia

- Spec: `docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md`
- Plan: `docs/superpowers/plans/2026-09-24-reglas-tareas-y-tags-fichas.md`
- Runbook: `docs/runbooks/2026-09-25-reglas-tareas-tags-rollout.md`
- Audit: `docs/superpowers/audits/2026-09-24-agent-config-redundancy-audit.md`
- Ledger SDD: `.superpowers/sdd/2026-09-24-reglas-tareas-y-tags-fichas/progress.md`
