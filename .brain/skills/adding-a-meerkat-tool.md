---
name: adding-a-meerkat-tool
description: Use when adding, modifying, or removing a tool from any meerkat (Nia, Nox, Niva, Nova, Neo, Naia). Enforces the 3-channel rule, tool limit, adapter pattern, and feature flag policy.
type: skill
owner: nazre
last_verified: 2026-08-26
inputs:
  - tool_name
  - purpose
  - meerkat(s) that need it
  - external system (si aplica)
output: PR con tool registrada en los 3 canales + adapter (si aplica) + feature flag + tests
---

# Adding a meerkat tool

## Antes de escribir código

### 1. ¿Ya existe algo parecido?
Grep en `src/lib/tools/registry.ts`, `src/lib/vapi/sync.ts` (buildTools), `src/app/api/portal/[token]/agent-chat/route.ts` (`ALL_TOOLS`), y `src/lib/tools/executor.ts`. Si existe algo semántico similar → **extender**, no duplicar.

### 2. ¿Cabemos en el tope?
Si el meerkat destino ya tiene ≥12-15 tools efectivas → **no agregues más sin decidir primero** cuál de estas opciones:
- Extender una tool existente (preferido).
- Mover otra tool a otro meerkat (requiere aprobación de Nazre - ver [[../people/nazre]]).
- Justificar excepción explícita en el PR.

Ver [[../policies/tool-completeness]] para las 5 reglas completas.

### 3. ¿Custom o producto?
- ¿La necesitarían 2+ clientes en los próximos 6 meses? → **Producto**. Adapter + feature flag.
- ¿Es 100% único de este cliente? (raro) → **Custom cotizado**, en módulo separado, NO en registry compartido.

Casi nada es 100% único. Antes de asumir "esto es custom", pregúntalo.

---

## Los 3 canales (obligatorio)

Cada tool DEBE quedar disponible en los 3 canales. Ver [[../decisions/2026-08-18-3-canales-obligatorio]] para el por qué.

### Voz (Vapi)
1. Agregar el tool name a `MEERKAT_VOICE_DISTRIBUTION` (o `MEERKAT_EMAIL_DISTRIBUTION` según canal) en `src/lib/vapi/sync.ts`.
2. Agregar case en `buildToolDef()` con el schema Vapi (function/parameters/server).
3. Crear route handler en `src/app/api/voice/tools/<tool-name>/route.ts`.

### Chat (portal)
En `src/app/api/portal/[token]/agent-chat/route.ts`:
1. Definir el `Anthropic.Tool` object (ej. `CREAR_CONTACTO_SALIENTE_TOOL`).
2. Agregar al array `ALL_TOOLS`.
3. Agregar mapping en `VOICE_TO_CHAT` (`voice_name: 'chat_name'`).
4. Agregar mapping en `CHAT_TOOL_BY_NAME` (`chat_name: TOOL_OBJECT`).

**Sin esos 3 mappings, `getToolsForRole()` NUNCA la incluye aunque el handler exista.** Este es el bug #1 recurrente de Centinelia.

### Email/Inbox
1. Verificar que la tool está en el executor central: `src/lib/tools/executor.ts` (usado por chat + email).
2. Verificar el registry del email agent en `src/lib/ops/inbox-processor.ts`.

### Excepciones válidas (voice-only)
Si la tool es físicamente imposible en chat/email:
- `transferir_llamada` (requiere señalización telefónica real)
- `notificar_transferencia`
- `registrar_encuesta` (inyectada por flujo inbound de Vapi)

En estos casos: dejar `null` en `VOICE_TO_CHAT` con **comentario explícito** de la razón. Null sin comentario = tool pendiente = no se mergea.

---

## Adapter pattern (si toca sistema externo)

Si la tool habla con CONTPAQi, SF, QB, Notion, Drive, ML, etc.:
- Lógica va en `src/lib/adapters/<sistema>.ts` (o el path que corresponda al patrón existente).
- La tool solo orquesta: valida input → llama adapter → formatea salida.
- **Nunca meter llamadas HTTP directas en la definición del tool.**
- Nombre de tool debe ser **genérico** (`crear_orden_compra`, no `qb_crear_orden_compra_ac_proyectos`).
- Adapter se elige por `buildAdapter(config)` según fuente de la org (ej. `organizations.invoicing_provider`).

Ejemplos ya existentes que siguen el patrón: `InvoicingProvider` (PAC/SF), `BillingAdapter` (CONTPAQi/Aspel).

---

## Feature flag

Toda tool nueva que no sea universal (ej. no es `read_url`) arranca gated:

```ts
// en src/lib/tools/registry.ts
{
  name: 'nueva_tool',
  gatedByFeature: 'nombre_feature',
  // ...
}
```

- Feature se activa por org en `organizations.features` (NO en `voice_agents`).
- Default: `false`.
- Se activa por-org tras validación con Nazre.

Ver [[../decisions/2026-08-18-feature-flag-por-org]] para el por qué.

---

## Empleado nuevo vs tools nuevas en meerkat existente

Antes de crear un empleado paralelo, pregúntate: **¿el rol es nuevo, o solo faltan tools?**
- Rol nuevo (ej. empleado facturación con reasoning loop propio) → sí, empleado dedicado.
- Rol existente + tools faltantes (ej. AC quiere cotizaciones QB, ya existe Noah=ventas) → **sumar tools al meerkat existente**, no crear paralelo.

Multiplicar meerkats fragmenta el equipo desde la perspectiva del usuario ("¿a quién le pido qué?").

---

## Tests

- **Unit test del adapter** (mock del externo) si hay adapter.
- **Integration test del tool** en al menos 1 de los 3 canales.
- **E2E obligatorio** si la tool toca dinero / CFDI / factura antes de merge a main.

---

## Distribución intencional (no es bug)

Ojo con esto: la distribución fragmentada de tools entre meerkats es **diseño de producto** (monetización - cliente contrata 2-3 empleados en vez de 1). No la "arregles" al descubrir que Nia no puede crear documentos: es intencional, Nia delega a Noah/Nox via `DELEGATION_TOOLS`.

Antes de asumir bug → verifica el mapa en `src/lib/vapi/sync.ts::MEERKAT_VOICE_DISTRIBUTION`.

---

## Checklist antes de PR

- [ ] Grep confirma que no duplica tool existente
- [ ] Meerkat destino no excede 12-15 tools efectivas (o excepción justificada)
- [ ] Voice: distribución + `buildToolDef()` + route handler
- [ ] Chat: `Anthropic.Tool` + `ALL_TOOLS` + `VOICE_TO_CHAT` + `CHAT_TOOL_BY_NAME`
- [ ] Email: registrada en executor + inbox-processor
- [ ] Adapter separado si hay externo
- [ ] `gatedByFeature` con feature declarada, default false
- [ ] Tests correspondientes (unit + integration + E2E si toca dinero)
- [ ] Copy en español respeta reglas (no "IA" en outputs visibles, no em-dashes, no emojis en UI)
- [ ] Si es "custom", justificación explícita en descripción del PR

---

## Cuándo NO usar esta skill

- Bugfix a una tool existente que no cambia su firma ni comportamiento observable → commit normal.
- Refactor interno del adapter sin cambiar contrato → commit normal.
- Renombrar variables internas → commit normal.

Si tienes duda: usa la skill. El costo de sobre-aplicarla es bajo; el costo de olvidar un canal ya lo pagamos (commit `bacb5d2a`, incidente Roberto Meireles).

---

## Ver también

- [[../policies/tool-completeness]] - 5 reglas contra bloat
- [[../decisions/2026-08-18-3-canales-obligatorio]] - origen de la regla de 3 canales
- [[../decisions/2026-08-18-feature-flag-por-org]] - origen de la regla de feature flag
- [[../learnings]] - bugs pasados (incluye Nox `create_document template=factura`)
