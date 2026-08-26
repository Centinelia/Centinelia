---
name: tool-completeness
description: 5 reglas duras contra tool bloat, employee saturation, y custom development sprawl. Aplican a toda modificación del catálogo de tools de meerkats.
type: policy
owner: nazre
last_verified: 2026-08-26
---

# Tool completeness - 5 reglas duras

Acordadas 2026-08-18 tras discutir estado del registry (9/9 meerkats excedían 12-15 tools por 3-4x en registry-level).

---

## 1. Tope de ~12-15 tools efectivas por empleado

**Por qué:** LLM eligiendo entre 40 tools se equivoca; entre 10 casi no. Cuantas más tools, más riesgo de que el meerkat use la que no debe para la tarea que se le pidió.

**Cómo aplicar:** Al agregar una tool nueva, contar cuántas quedaría teniendo el meerkat destino (registry + runtime efectivo con Capa 2 packs + Capa 3 overrides). Si excede, dividir en 2 empleados, agrupar en skill, o quitar tools obsoletas. La base compartida `gatedByRole: null` en `src/lib/tools/registry.ts` es la raíz del problema y eventualmente debería invertirse a opt-in.

---

## 2. Adapter pattern SIEMPRE para custom

**Por qué:** Evita explosión combinatoria de tools `X_por_cliente_Y`. Ya funciona el patrón con `InvoicingProvider` (PAC/SF) y `BillingAdapter` (CONTPAQi/Aspel) sin overlap.

**Cómo aplicar:** Nunca `qb_crear_orden_compra_ac_proyectos` o similar. Siempre nombre genérico (`crear_orden_compra`) + N adapters por ERP/cliente detrás de un registry `buildAdapter(config)`. Si aparece la tentación de nombrar por cliente, es señal de que falta abstracción.

---

## 3. Feature flag por org, obligatorio para toda tool custom

**Por qué:** El registry es compartido pero cada org solo debe ver las tools que aplican. Si no está activa la feature, la tool no existe para el meerkat, y no se puede confundir. Ver [[../decisions/2026-08-18-feature-flag-por-org]].

**Cómo aplicar:** Toda tool nueva que no sea universal (ej. no es `read_url`) debe declarar `gatedByFeature: 'nombre_feature'`. La feature se activa por org en `organizations.features` (no en `voice_agents`).

---

## 4. Filtro "custom o producto" antes de escribir código

**Por qué:** Features únicas de un cliente pueden crecer hasta que la plataforma falla por sobrecarga. Necesitamos criterio dicotómico previo.

**Cómo aplicar:** Cualquier feature que pida un cliente pasa por este filtro:
- ¿La necesitarían **2+ clientes** en los próximos 6 meses? → **Producto**. Adapter + feature flag. El cliente pagador cubre *kickstart fee*; los siguientes lo tienen incluido en su plan.
- ¿Es **100% único** de este cliente? (raro) → **Custom cotizado**, en branch/módulo separado, NO en el registry compartido.

Guía: casi nada es 100% único. Cotizaciones/OC/gastos "de AC Proyectos" en realidad las quiere cualquier constructora/comercializadora → producto, no custom.

---

## 5. Empleado nuevo se crea por rol nuevo, no por tools faltantes

**Por qué:** Si el rol ya existe (Noah=ventas, Nox=admin, Niva=director), agregar un empleado paralelo confunde a los usuarios ("¿a quién le pido qué?") y fragmenta el equipo.

**Cómo aplicar:** Preguntar primero "¿el proceso/rol es nuevo, o solo faltan tools?"
- **Rol nuevo** (ej. empleado facturación desde notas con reasoning loop propio) → sí, empleado dedicado.
- **Rol existente + tools faltantes** (ej. AC quiere cotizaciones QB, ya existe Noah=ventas) → sumar tools al meerkat existente, no crear paralelo.

---

## Ver también

- [[../skills/adding-a-meerkat-tool]] - checklist ejecutable que aplica estas 5 reglas
- [[../decisions/2026-08-18-3-canales-obligatorio]] - regla ortogonal: cada tool en los 3 canales
- [[../decisions/2026-08-18-feature-flag-por-org]] - origen de la regla 3
