# Runbook: Activar Nia de Santiago NL con Reglas del demo 2026-09-24

**Contexto**: el equipo de Santiago NL entregó documento de observaciones tras el demo del 2026-09-24 con 9 problemas detectados en Nia. Categoría A (4 problemas) se resuelve con Reglas de operación del nuevo sistema. Categoría B (2 problemas) se resuelve con Fichas Informativas mejor tageadas. Categoría C (3 problemas de infra Vapi/ElevenLabs) es scope separado.

## Prerequisitos

- Branch `feat/reglas-tareas-tags` mergeado a main.
- Fase 7 SQL aplicada (ADD COLUMN reason en ai_ops_log).
- Script migración legacy transfer_rules corrido en dry-run + real.

## Paso 1: Identificar portal_email y voice_agent de Nia de Santiago NL

```sql
SELECT
  v.id AS agent_id,
  v.agent_name,
  v.portal_email,
  v.features->>'meerkat_role_id' AS meerkat_role_id,
  o.business_name
FROM voice_agents v
JOIN organizations o ON o.portal_email = v.portal_email
WHERE o.business_name ILIKE '%santiago%'
  AND v.features->>'meerkat_role_id' = 'nia';
```

Guarda `portal_email` y `agent_id` para los pasos siguientes. Referencia como `<PORTAL_EMAIL>` y `<AGENT_ID>`.

## Paso 2: Activar feature flags

```sql
UPDATE organizations
SET features = features || jsonb_build_object(
  'agent_missions_enabled', true,
  'retrieval_v2_enabled', true,
  'rerank_enabled', true
)
WHERE portal_email = '<PORTAL_EMAIL>';
```

Verificar:

```sql
SELECT features->>'agent_missions_enabled' AS am,
       features->>'retrieval_v2_enabled' AS rv2,
       features->>'rerank_enabled' AS rr
FROM organizations
WHERE portal_email = '<PORTAL_EMAIL>';
```

Esperado: `true, true, true`.

## Paso 3: Insertar las 4 Reglas de operación (Categoría A del documento)

```sql
INSERT INTO agent_rules (portal_email, regla, detalles, applies_to, active, created_by)
VALUES
(
  '<PORTAL_EMAIL>',
  'Nunca inventes ni asumas el nombre del usuario que llama',
  'Solo usa el nombre del usuario si él mismo lo dijo explícitamente en la llamada actual. Si no lo dijo, refiérete a él de forma neutral (ciudadano, señor, señora).',
  ARRAY['nia']::text[],
  true,
  'nazre_setup_2026-09-25'
),
(
  '<PORTAL_EMAIL>',
  'Antes de confirmar cualquier transferencia, verifica que el trámite existe',
  'Consulta primero las fichas informativas. Si el trámite solicitado no aparece o no lo maneja el municipio de Santiago, dilo explícito: "Ese servicio no lo maneja el municipio, no puedo transferirlo." NO confirmes ni ofrezcas transferencias para trámites que no existen.',
  ARRAY['nia']::text[],
  true,
  'nazre_setup_2026-09-25'
),
(
  '<PORTAL_EMAIL>',
  'Respeta las palabras o términos que el usuario pida no usar durante la llamada',
  'Si el usuario dice "no me digas X" o "no uses la palabra Y", NO la vuelvas a usar en el resto de la conversación. Esta restricción vive solo durante la llamada actual y se olvida al final.',
  ARRAY['nia']::text[],
  true,
  'nazre_setup_2026-09-25'
),
(
  '<PORTAL_EMAIL>',
  'Al transferir, siempre menciona primero el departamento y la persona antes que la extensión',
  'Formato correcto: "Te voy a transferir con [Departamento], con [Nombre de la persona si lo tienes], extensión [número]." Nunca digas solo el número de extensión sin el contexto del departamento.',
  ARRAY['nia']::text[],
  true,
  'nazre_setup_2026-09-25'
);
```

Verificar:

```sql
SELECT id, regla, applies_to, active, created_by
FROM agent_rules
WHERE portal_email = '<PORTAL_EMAIL>'
  AND created_by = 'nazre_setup_2026-09-25'
ORDER BY created_at DESC;
```

Esperado: 4 filas, todas `active=true`, `applies_to = {nia}`.

## Paso 4: Auditar fichas informativas de Santiago NL (Categoría B)

### 4.1: Ficha de multas de tránsito

**Problema del demo**: Nia orienta a Tesorería para aclarar multas, cuando Tesorería solo cobra.

Query para ver la ficha actual:

```sql
SELECT id, titulo, tags, autotag_status,
       dependencia, contacto_nombre, contacto_puesto, contacto_correo, contacto_telefono
FROM fichas_informativas
WHERE portal_email = '<PORTAL_EMAIL>'
  AND (titulo ILIKE '%multa%' OR raw_text ILIKE '%multa%');
```

Verifica:
- Que hay una ficha para "consultar multa" (no solo para "pagar multa").
- Que la ficha tiene tags `atencion_cliente` y `operaciones`.
- Que los contactos son del área que ACLARA, no solo del área que COBRA.

Si no existe: subir una nueva ficha desde el portal (`/portal/[token]` → Fichas informativas → Nueva ficha) con:
- Título: "Consulta y aclaración de multas de tránsito"
- Contenido: qué área atiende consultas, quién atiende, extensiones, horario.
- Tags que aparezcan sugeridas por autotag Sonnet: `atencion_cliente`, `operaciones`, quizá `politicas`.

Si existe pero tags mal: actualizar via portal (edit ficha, quitar tags irrelevantes, agregar correctos).

### 4.2: Directorio de servidores públicos

**Problema del demo**: Nia no reconoce un servidor cuando el usuario usa solo el primer nombre.

Query:

```sql
SELECT id, titulo, contacto_nombre, tags
FROM fichas_informativas
WHERE portal_email = '<PORTAL_EMAIL>'
  AND (titulo ILIKE '%directorio%' OR titulo ILIKE '%contactos%');
```

Si no existe una ficha de directorio: crear una con nombres completos + apellidos + puestos. Ejemplo de contenido:

```
Directorio de servidores públicos del Municipio de Santiago NL

- Juan Pérez García (primer nombre: Juan, apellidos: Pérez García)
  Puesto: Director de Tránsito
  Extensión: 1234
  Correo: juan.perez@santiago.gob.mx

- María López (primer nombre: María, apellidos: López)
  Puesto: Jefa de Tesorería
  ...
```

Con este formato, el retrieval indexa cada variante y Nia puede resolver "Juan" o "Juan Pérez" o "el señor García" a la misma persona.

Tags sugeridos: `atencion_cliente`, `operaciones`.

## Paso 5: Verificación funcional post-setup

Con los flags activos y las reglas insertadas:

1. Hacer llamada de prueba a Nia de Santiago NL (o dev call).
2. Verificar que Nia NO asigna nombres al usuario.
3. Pedirle transferencia a un trámite inventado (ej. "quiero renovar mi licencia de piloto"). Esperado: rechaza.
4. Pedirle no usar una palabra específica (ej. "no me digas señor"). Verificar que no la vuelve a usar.
5. Pedir una transferencia real. Esperado: menciona departamento y persona antes de la extensión.
6. Preguntar por una multa de tránsito. Esperado: dirige al área que aclara, no solo a la que cobra.

## Paso 6: Métricas post-activación

Trackear durante 48-72h:
- Latencia p95 de llamadas de Nia de Santiago (baseline pre-activación vs post).
- Costo por llamada (nuevo `logLlmCall` + tokens del bloque de Reglas cacheado).
- Tasa de reglas violadas: revisar aleatoriamente 10 llamadas y verificar que las 4 reglas se respetan.
- Feedback del cliente: pedir a Santiago NL que reevalúe con las mismas pruebas del demo original.

## Rollback si algo se rompe

Desactivar cualquier flag:

```sql
UPDATE organizations
SET features = features - 'agent_missions_enabled'
WHERE portal_email = '<PORTAL_EMAIL>';
```

O desactivar reglas específicas:

```sql
UPDATE agent_rules
SET active = false
WHERE portal_email = '<PORTAL_EMAIL>'
  AND created_by = 'nazre_setup_2026-09-25';
```

Efecto: instantáneo. Nia vuelve al comportamiento pre-activación en la próxima llamada (cache TTL 5 min).

## Categoría C — fuera de scope de este runbook

Los 3 problemas de infra (interrupción por ruido, audio entrecortado, corte al transferir) requieren un branch nuevo `fix/nia-santiago-infra` con:
- Ajuste de VAD/interrupt sensitivity en config Vapi del agent.
- Investigación de la falla de audio (ElevenLabs? Vapi? Conexión?).
- Fix del flow de transferencia (por qué cuelga en vez de transferir).
- Opcional: activar `client_memory=true` en features del agent para persistir historial entre llamadas.

Ese branch se planea en sesión separada.

## Referencias

- Documento del demo: `C:/Users/Nazre/.claude/uploads/.../43ce8286-Informe_de_Observaciones...docx`
- Decision: `.brain/decisions/2026-09-25-reglas-tareas-y-tags-fichas.md`
- Policy: `.brain/policies/agent-missions-and-ficha-tags.md`
- Skill: `.brain/skills/adding-agent-rule-or-task.md`
- Runbook general del rollout: `docs/runbooks/2026-09-25-reglas-tareas-tags-rollout.md`
