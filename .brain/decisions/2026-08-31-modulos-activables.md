---
name: 2026-08-31-modulos-activables
description: "El producto se vende como Meerkat base + N módulos activables por org. Nunca 'versión custom del meerkat X para cliente Y'. Consultoría privada hasta madurar 5-6 módulos, después catálogo público."
type: decision
owner: nazre
decided_on: 2026-08-31
last_verified: 2026-08-31
---

# Decisión — Producto empaquetado como Meerkat base + módulos activables

**Regla**: cada Meerkat tiene una **base inmutable** (capabilities núcleo que definen su rol: recepción para Nia, facturista para Nala, admin para Nox, etc). Toda extensión de comportamiento por cliente se hace vía **módulos activables** que empaquetan tools + prompt fragments + config UI + integraciones. **Nunca** creamos "Nelia versión Tortillería" vs "Nelia versión Salón" — es la misma Nelia con distintos módulos activados.

## Contexto

2026-08-31. Nazre plantea el problema real de escala: cada empresa tiene sus procesos distintos. Un empleado standard no puede servir 100% a todo el mundo. La tentación es hacer versiones custom por cliente, pero eso no escala (multiplicaría el mantenimiento) y no es SaaS puro.

Al mismo tiempo, varios clientes están cerca de firmar (piloto Tortillería, AC Proyectos, Beatriz facturación, otros en pipeline). Necesitamos un modelo que:
1. Diga qué se vende y en qué precio.
2. Permita cobrar más por customización sin volverse consultoría.
3. No fragmente el código.
4. Deje puntos de extensión para el 80% de variaciones y un límite claro para el 20% raro.

## Regla operativa

1. **La base del meerkat es INMUTABLE**. Nelia siempre es "recepción + registro de eventos + agenda", nunca vendas "Nelia versión X". Esto es lo que se demuestra en demo y aparece en pricing.

2. **Los módulos son add-ons activables por org**. Se guardan en `organizations.features` (JSONB) — un flag por módulo. Ya existe la arquitectura desde [[../decisions/2026-08-18-feature-flag-por-org]].

3. **Cada módulo trae contract explícito** con 5 campos obligatorios (`ModuleDefinition` en `src/lib/modules/catalog.ts`):
   - `capabilities`: lista de lo que SÍ hace.
   - `outOfScope`: lista de lo que NO hace — setea expectativas.
   - `requirements`: qué debe existir antes de poder activarlo (ej: CSD vigente, QB conectado).
   - `meerkats`: qué empleados aprovechan el módulo.
   - `configPath`: dónde el cliente lo configura en el portal.

4. **Puntos de extensión SIN código nuevo** — la mayoría de variaciones entre clientes se cubren con:
   - Template Excel/PDF custom (bitácora ya lo hace).
   - Recipient rules por regla (quién recibe qué correo).
   - Field mapping (qué col captura qué canonical field).
   - Trigger overrides (cuándo dispara, con qué frecuencia).
   - Prompt fragments client-specific vía KB por org.

5. **Cuando el cliente cae en el 20% raro**: dos únicas opciones — NUNCA "custom code por cliente":
   - **Pull it into the pack**: si 3+ clientes piden lo mismo, es señal de nuevo módulo o extensión al existente.
   - **Setup service** (onboarding fee): cobras ajustar módulos existentes a su caso. Si la config no alcanza, dile "eso no lo hacemos aún".

6. **Vender por módulo activado, no por meerkat con features**. Pricing: `Meerkat base $X/mes + $Y por cada módulo activo`. Ejemplo: Tortillería paga `Nelia base + Bitácora + Facturación a clientes`; Salón paga `Nelia base + Seguimiento nómina + Dashboard semanal`. Mismo código, distinto precio y comportamiento.

## Nombres de módulos (patrón)

Deben comunicar **dirección o intención en la primera palabra**. Evita jerga técnica que confunde entre casos de uso opuestos:

- ✅ **"Facturación a clientes"** vs **"Facturación de proveedores"** (dirección explícita).
- ❌ "Facturación CFDI" vs "Ciclo OC-CFDI" (ambos son CFDI, cliente no distingue).
- ✅ **"Bitácora de incidencias"** (qué es + qué cubre).
- ❌ "Incidencia flow" (jerga interna).

## Approach comercial vigente 2026-08-31

**Consultoría privada + activación manual** hasta madurar 5-6 módulos. El catálogo técnico ya está construido (`src/lib/modules/catalog.ts`, `/portal/[token]/modulos`, endpoint POST `/api/portal/[token]/modules`), pero el item del sidebar está oculto (ver `portal-v2-areas.ts` comentario). Nazre activa módulos manualmente por piloto.

Módulos considerados **listos al 100%** hoy (para vender):
- Bitácora de incidencias
- Catálogo en la nube
- Llamadas salientes

Módulos **en construcción / con piloto activo**:
- Facturación a clientes (piloto Beatriz)
- Facturación de proveedores (piloto AC Proyectos, bloqueado por externos)
- QuickBooks (parcial)
- Google Sheets (parcial)

Módulos **para verticales específicos**:
- Reportes cívicos (gobierno)
- Trámites municipales (gobierno)

Módulos **no maduros**:
- Contratos (borradores generados por Nox — pendiente de validar)

Cuando lleguemos a 5-6 módulos maduros, descomentar item del sidebar en `portal-v2-areas.ts` y publicar el catálogo.

## Alcance de esta decisión

- Aplica a **toda extensión de comportamiento** que un cliente pida.
- **No aplica** a la personalización base (logo, KB, tono de marca, plantilla de contratos) — esa siempre es libre y no cuenta como módulo.
- **No aplica** a fixes de bugs que apliquen a todos los clientes — eso es mantenimiento del núcleo.

## Aprobación y cambios

Nazre — cambio a esta decisión requiere nueva decisión con `supersedes: 2026-08-31-modulos-activables`. Renombrar un módulo o cambiar su contract NO requiere nueva decisión (es evolución operativa del catálogo).

## Ver también

- [[../decisions/2026-08-18-feature-flag-por-org]] — arquitectura de gating por org (dependencia dura).
- [[../policies/tool-completeness]] — las 5 reglas de bloat (los módulos son también forma de contener el bloat).
- `src/lib/modules/catalog.ts` — fuente de verdad del catálogo actual.
