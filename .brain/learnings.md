---
name: learnings
description: Append-only log de correcciones revisadas y lecciones extraídas. Cada entrada linkea a la capa del brain que se ajustó (policy / skill / decision) o al commit del fix.
type: learning
owner: nazre
last_verified: 2026-08-26
---

# Learnings - append-only

**Regla del archivo:** solo se **agrega** al final. Si una lección queda obsoleta, no se borra: se agrega una nueva entrada abajo que la corrige, con link a la anterior.

Formato de cada entrada:
```
## YYYY-MM-DD - <slug corto del incidente>
**Qué pasó:** ...
**Por qué pasó:** ...
**Lección:** ...
**Capa ajustada:** [[link]] o commit `<sha>`
```

---

## 2026-08-19 - Nox invoca `create_document` con `template=factura`

**Qué pasó:** En E2E chat post-eliminación del flujo manual de `solicitar_factura`, Nox recibió petición de facturar en org sin PAC configurado. En lugar de responder gate `no_pac` y llamar `crear_lead`, invocó `create_document` con `template=factura` - tool que no existe para ese template. La respuesta al usuario fue ambigua.

**Por qué pasó:** El prompt-builder de Nox tenía un fallback genérico "usa create_document para generar el archivo" que colisionaba con el gate `no_pac` de `solicitar_factura`. El modelo eligió el path aparentemente más cercano al output esperado (un documento) sin validar que el template existiera.

**Lección:** Cuando una tool queda gated (retorna `{ error: 'no_pac' }` o similar), el prompt del meerkat debe explicitar **el fallback exacto** (`crear_lead` con nota específica). Fallbacks genéricos ("intenta con otra herramienta") llevan al modelo a inventar combinaciones inválidas.

**Capa ajustada:** commits `ba88abda` + `5d8afbdd`. Prompt-builder actualizado. Escenario E2E documentado en [[../../../.claude/projects/C--Users-Nazre/memory/handoff_post_flujo_manual_pendientes]] para futura re-ejecución.

**Aplica a:** cualquier tool con gate condicional → validar que el prompt del meerkat tenga fallback explícito y probado en E2E.

---

## 2026-08-10 - `crear_contacto_saliente` shipeada solo en voz

**Qué pasó:** Tool shipeada con voice + `executor.ts` handler, pero SIN registro en `agent-chat/route.ts` (`ALL_TOOLS` / `VOICE_TO_CHAT` / `CHAT_TOOL_BY_NAME`). Email sin verificar. Sofia en chat inventó respuestas ("el contacto no existe") durante 3 turnos porque el modelo del chat nunca vio la tool. Detectado en producción con cliente real (Roberto Meireles).

**Por qué pasó:** Falta de checklist explícito para los 3 canales. El desarrollador (yo/asistente) asumió que registrar el handler en `executor.ts` bastaba porque el executor sirve chat+email, sin darse cuenta de que el session tools del chat se arma antes en `agent-chat/route.ts`.

**Lección:** Handler ≠ registro. El LLM del chat necesita ver la tool en su `tools` de la request Anthropic, y eso requiere los 3 mappings en `agent-chat/route.ts`. Sin eso, el modelo inventa.

**Capa ajustada:** hotfix commit `bacb5d2a`. Regla formalizada en [[decisions/2026-08-18-3-canales-obligatorio]]. Checklist ejecutable en [[skills/adding-a-meerkat-tool]].

**Aplica a:** toda tool nueva. Este es el bug #1 recurrente de Centinelia - si el brain solo previene esto en el próximo año, ya justificó su existencia.
