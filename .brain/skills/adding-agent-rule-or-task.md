---
name: adding-agent-rule-or-task
description: Use when adding a business rule (agent_rules) or a scheduled task (agent_tasks) for a specific client, either during manual setup or as a correction after demo feedback. Covers pre-checks, SQL, verification, billing notes, and rollback.
type: skill
owner: nazre
last_verified: 2026-09-25
inputs:
  - portal_email del cliente
  - texto de la regla O misión de la tarea
  - applies_to (slugs meerkat_role_id, vacío = todos) — solo para reglas
  - owner_agent_id (UUID del voice_agent) — solo para tareas
  - trigger_type (cron / manual / phrase) — solo para tareas
output: Row en agent_rules o agent_tasks verificado en DB + confirmación que runtime lo ve
---

# Skill: Adding an Agent Rule or Task

## Cuándo usar

Cuando necesitas configurar una regla o tarea programada para un cliente específico, ya sea:
- En setup manual (cliente sofisticado que precisa reglas antes del wizard).
- En respuesta a feedback de demo (ej. Nia de Santiago NL después del demo del 2026-09-24 requiere restricciones específicas).
- Como corrección rápida ante bug reportado por cliente.

## Cuándo NO usar

- Si el cliente puede configurarlo por sí mismo desde el portal (`/portal/[token]/reglas` o `/configurar?tab=tareas`). Prefiere el auto-servicio.
- Para configuración técnica del meerkat (voz, personalidad, tools). Eso vive en otro sistema.
- Para acciones de un solo uso. Considera si es realmente permanente o programada antes de crear.

## Inputs necesarios

- `portal_email` del cliente (identificador org).
- Para reglas: texto de la regla + detalles opcionales + `applies_to` (lista de meerkat_role_id slugs, vacío = todos).
- Para tareas: `owner_agent_id` (uuid del voice_agent específico), slug único por agent, mission, trigger_type (cron/manual/phrase), trigger_config jsonb, parameters opcional, deliverable.

## Checklist

### Antes de tocar DB

1. [ ] Verificar `agent_missions_enabled` para el org:
   ```sql
   SELECT features->>'agent_missions_enabled'
   FROM organizations
   WHERE portal_email = '<x>';
   ```
   Si devuelve `false` o null, la regla existirá en DB pero el meerkat no la respetará hasta que el flag se active.

2. [ ] Confirmar el `meerkat_role_id` del agent afectado:
   ```sql
   SELECT features->>'meerkat_role_id'
   FROM voice_agents
   WHERE id = '<agent-uuid>';
   ```

3. [ ] Validar que el texto de la regla es imperativo/condicional claro (no ambiguo). Si es ambiguo, mejor no crearla.

### Insertar la regla

```sql
INSERT INTO agent_rules (portal_email, regla, detalles, applies_to, active, created_by)
VALUES (
  '<portal_email>',
  '<regla en una oración>',
  '<detalles opcionales o NULL>',
  ARRAY['<meerkat_role_id>']::text[],  -- vacío ARRAY[]::text[] = aplica a todos
  true,
  'nazre_setup'
);
```

### Insertar una tarea

```sql
INSERT INTO agent_tasks (portal_email, owner_agent_id, slug, mission, trigger_type, trigger_config, parameters, deliverable, active, created_by)
VALUES (
  '<portal_email>',
  '<agent uuid>',
  '<slug único como cobranza_mensual>',
  '<misión>',
  'cron',  -- o 'manual' o 'phrase'
  '{"cron": "0 9 5 * *", "timezone": "America/Monterrey"}'::jsonb,
  '<parameters opcional>',
  '<deliverable>',
  true,
  'nazre_setup'
);
```

Para trigger_type='phrase':
```json
{"phrases": ["cobra a los morosos", "revisa cartera"], "match_mode": "literal"}
```

Para trigger_type='manual':
```json
{}
```

### Verificación post-insert

4. [ ] Query la regla:
   ```sql
   SELECT * FROM agent_rules WHERE portal_email = '<x>' ORDER BY created_at DESC LIMIT 3;
   ```
5. [ ] Verificar que el runtime la ve: llama al portal con una conversación de prueba y observa si el bloque `## Reglas de tu negocio` aparece en los logs de la próxima llamada.

## Cobro asociado

INSERT en `agent_rules` desde SQL directo NO cobra ops (bypass del service). Si quieres que el ledger tenga la entrada `rule_setup`, usa el endpoint `POST /api/portal/[token]/agent-rules` en lugar de SQL manual. Alternativa: agregar entrada manual en `ai_ops_log` post-INSERT.

## Rollback

Para desactivar sin borrar:
```sql
UPDATE agent_rules SET active = false WHERE id = '<x>';
```

Para eliminar completa:
```sql
DELETE FROM agent_rules WHERE id = '<x>';
```

## Ver también

- Policy: `.brain/policies/agent-missions-and-ficha-tags.md`
- Decision: `.brain/decisions/2026-09-25-reglas-tareas-y-tags-fichas.md`
- Runbook de rollout: `docs/runbooks/2026-09-25-reglas-tareas-tags-rollout.md`
