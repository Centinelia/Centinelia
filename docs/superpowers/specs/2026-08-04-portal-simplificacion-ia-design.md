# Portal Centinelia — Simplificación de Arquitectura de Información

**Fecha:** 2026-08-04
**Autor:** Nazre + Claude
**Estado:** Draft — pendiente review

## Problema

El portal actual está organizado por **arquitectura interna del producto** (agentes, ops, features), no por lo que el usuario intenta hacer. Consecuencias medibles:

- **6 grupos** en el sidebar principal
- **25+ rutas** top-level bajo `/portal` y `/oficina`
- Grupo "Oficina" con **14 items** compitiendo visualmente
- Página `/configurar` con **30+ anclas/secciones** (fragmentación)
- **Duplicación**: Llamadas viven en 3 rutas, Documentos en 3, Integraciones en 3, Reportes en 3
- Ambigüedad de dónde va cada acción: "ver una llamada de hoy" puede ser Inicio, Llamadas Entrantes u Oficina→Llamadas

El costo: curva de aprendizaje alta, sensación de abrumamiento en primera visita, soporte reactivo por preguntas de navegación.

## Objetivo

Reducir carga cognitiva del portal para que:
- Un usuario nuevo entienda en < 30 segundos qué ve y dónde ir
- Las tareas más frecuentes estén a ≤ 2 clicks
- Cero funcionalidad aparezca en 2+ lugares
- El diseño mantenga el nivel actual (Radix + Tailwind + tokens)

No-goals: rebranding, cambio de motor de datos, refactor de tools.

## Principio de diseño: "El portal ES tu oficina digital"

La landing promete una "oficina digital". Ponerla como un ítem del sidebar (compitiendo con otros 5) *debilita* la marca — la degrada a "una sección más". La forma fuerte de honrar la promesa es: **el portal entero es la oficina**. La marca vive en el header/wordmark (persistente en todas las vistas), y las secciones son *áreas* de la oficina, con lenguaje físico.

Analogía: cuando entras a Gmail no hay un botón "Gmail" en el sidebar — la app *es* Gmail; los items son Inbox, Sent, Drafts. Aquí igual.

### Header persistente

En la parte superior del portal, siempre visible:
> **Tu oficina digital · [Nombre del negocio]**

Con el logo Centinelia + logo del negocio. Refuerza el concepto en cada vista sin robarle un slot al sidebar.

### 5 áreas de tu oficina

Un dueño de PYME resuelve 5 preguntas al llegar a su oficina. Lenguaje físico, no técnico:

| Área              | Metáfora física                       | Pregunta que responde                    |
|-------------------|---------------------------------------|------------------------------------------|
| **Escritorio**    | Dónde llegas cada mañana              | ¿Cómo va mi negocio hoy?                 |
| **Bandeja**       | El buzón encima del escritorio        | ¿Qué requiere mi atención ahora?         |
| **Historial**     | El archivero al fondo                 | ¿Qué pasó?                               |
| **Tu equipo**     | Los empleados de la oficina           | ¿Qué está haciendo mi equipo? Ajustarlo. |
| **Administración**| El despacho administrativo            | Organización, integraciones, billing     |

## Arquitectura de información propuesta

### Antes (actual)

```
Sidebar (6 grupos, 25+ rutas):
├─ Inicio (6 anclas internas)
├─ Organización (8 anclas)
├─ Empleados → /agentes → /configurar (30+ anclas)
├─ Oficina (14 items):
│    Hoy · Bandeja · Llamadas · Reportes · Aprendizajes ·
│    Investigación · Documentos · Contratos · Plantillas ·
│    Tareas programadas · Juntas · Onboarding · Encuestas ·
│    Mesa de ayuda · Integraciones
├─ Llamadas [si no hay ops]:
│    Entrantes (2) · Salientes (3)
├─ Cuenta (3 secciones)
└─ Usuarios y permisos [owner]
```

### Después (propuesto)

```
┌────────────────────────────────────────────────────┐
│  Tu oficina digital · [Nombre del negocio]         │  ← header persistente
└────────────────────────────────────────────────────┘

Sidebar (5 áreas):
├─ 🏠 Escritorio
├─ 📥 Bandeja
├─ 📞 Historial
│    · Llamadas (filtros: entrantes · salientes · campañas · missed)
│    · Reportes
│    · Aprendizajes
│    · Investigación
├─ 👥 Tu equipo
│    · Lista de empleados
│    · Configurar empleado [drawer con 5 tabs]
│    · Cómo trabajamos (patrones + insights)
└─ ⚙️ Administración
     · Organización (perfil, marca, horarios)
     · Recursos de la oficina (launcher grid)  ← 9 tools ops
     · Integraciones
     · Usuarios y permisos [owner]
     · Uso y compras
     · Facturación
```

Total: **5 items visibles en el sidebar principal**, resto es sub-navegación contextual dentro de cada espacio (pills, tabs, drawers). El usuario ve 5 opciones a la vez, no 25.

## Cambios específicos

### 1. Fusión de "Llamadas" — de 3 rutas a 1

**Antes:** `/llamadas/entrantes`, `/llamadas/salientes`, `/oficina/llamadas` (4 tabs).

**Después:** una sola ruta `/historial/llamadas` con pills filtro en el header:

```
[ Entrantes ] [ Salientes ] [ Campañas ] [ Missed recovery ]
```

Los tabs contextuales (Leads · Citas · Pedidos) aparecen **solo** cuando el filtro activo es "Entrantes". Los sub-menús actuales de "Salientes" (Contactos · Campañas · DNC) pasan a pills secundarios al filtrar "Salientes".

Impacto: elimina 2 rutas, elimina 4 tabs redundantes, un solo mental model de "llamadas".

### 2. Bandeja unificada — absorbe todo lo accionable

**Antes:** Bandeja (mensajes) + Mesa de ayuda + Aprobaciones pendientes (integrations panel) + Fallas reportadas + Tareas de agentes + Investigaciones sin revisar viven en 5 lugares distintos.

**Después:** una sola Bandeja con el patrón **"Requieren tu acción / Al día"** ya validado en sesión 53. Chips de categoría (ya existentes) + chip de agente + chip de tipo (mensaje · aprobación · falla · tarea · investigación).

Sub-navegación por URL: `/bandeja?tipo=aprobaciones`, `/bandeja?agente=nia`, etc.

### 3. Configurar empleado — de 30 anclas a 5 tabs

`/configurar` colapsa su sidebar interno de 30+ secciones en **5 tabs**:

| Tab                          | Qué contiene                                                    |
|------------------------------|-----------------------------------------------------------------|
| Personalidad y voz           | Voz Vapi, nombre, personalidad, saludos, endpointing, MDP       |
| Conocimiento y guardrails    | KB, business_description, guardrails, políticas, aprendizajes   |
| Herramientas e integraciones | Tools por canal, capabilities, integrations panel               |
| Horarios y automatizaciones  | Jornada, horarios, heartbeat, weekly-insights, iniciativa       |
| Marca y ajustes              | Logo, colores, plantillas email, passphrase, team numbers       |

Dentro de cada tab: acordeones para lo poco frecuente. Lo más usado (voz, KB, tools) al inicio del tab sin acordeón.

### 4. "Oficina" como concepto, no como grupo — se disuelve en el todo

El grupo "Oficina" **desaparece del sidebar** (el portal entero YA es la oficina, redundante tenerlo también como sección). Sus 14 items se redistribuyen:

| Ítem actual          | Nueva ubicación                          |
|----------------------|------------------------------------------|
| Hoy en la oficina    | Se fusiona con Escritorio (widget "Equipo hoy" ya existe) |
| Bandeja              | → 📥 Bandeja (top-level)                  |
| Llamadas             | → 📞 Historial › Llamadas                 |
| Reportes             | → 📞 Historial › Reportes                 |
| Aprendizajes         | → 📞 Historial › Aprendizajes             |
| Investigación        | → 📞 Historial › Investigación            |
| Mesa de ayuda        | → 📥 Bandeja (chip "Mesa de ayuda")       |
| Documentos           | → ⚙️ Administración › Recursos            |
| Contratos            | → ⚙️ Administración › Recursos            |
| Plantillas           | → ⚙️ Administración › Recursos            |
| Tareas programadas   | → ⚙️ Administración › Recursos            |
| Juntas               | → ⚙️ Administración › Recursos            |
| Onboarding           | → ⚙️ Administración › Recursos            |
| Encuestas            | → ⚙️ Administración › Recursos            |
| Integraciones        | → ⚙️ Administración › Integraciones       |
| Cabildo (gov)        | → ⚙️ Administración › Recursos (solo si gov) |

**Recursos de la oficina** es una sola página `/administracion/recursos` con grid de cards. Cabe en una pantalla. Es un espacio al que entras cuando lo necesitas, no ruido permanente del sidebar.

### 5. Escritorio — bajar densidad

**Antes:** 7 KPIs + 4 widgets grandes + 6 anclas de scroll.

**Después:**
- **3 KPIs primarios** grandes: Ahorros del mes · Llamadas hoy · Requieren tu atención (count)
- **1 fila secundaria** de 4 stats: Autonomía · Tasa contestada · Sin intervención · Tareas completadas
- **2 widgets** máximo: "Equipo hoy" (con estado tiempo real) + "Feed" (últimos eventos importantes)
- Quita: "Cómo trabajamos" (mover a Tu equipo), Insights (mover a Historial › Aprendizajes), 3 anclas de scroll

### 6. Deduplicación explícita

Un solo lugar por concepto:

| Concepto      | Ubicación única                                       |
|---------------|-------------------------------------------------------|
| Documentos    | `/administracion/recursos/documentos`                 |
| Integraciones | `/administracion/integraciones`                       |
| Reportes      | `/historial/reportes` (resumen en Escritorio)         |
| Contactos     | `/historial/llamadas?filtro=salientes&view=contactos` |
| Horarios      | `/administracion/organizacion#horarios`               |
| Marca         | `/administracion/organizacion#marca`                  |

### 7. Onboarding — bienvenida a la oficina

Primera vez que un usuario entra al portal, un mini-tour de bienvenida presenta las 5 áreas con lenguaje de oficina. Toast inicial: *"Bienvenido a tu oficina digital. Te muestro rápido cómo se organiza."*

1. "Este es tu **Escritorio** — dónde llegas cada mañana" → resalta ítem
2. "Aquí tu **Bandeja** — lo que requiere tu atención" → resalta ítem
3. "Aquí el **Historial** — todo lo que pasó" → resalta ítem
4. "Aquí **Tu equipo** — tus empleados digitales" → resalta ítem
5. "Y aquí la **Administración** — organización, integraciones, cuenta" → resalta ítem

Persistido en `portal_users.onboarding_seen_at` o similar. Skippable.

## Anti-patterns evitados

- No colapsar todo en un mega-sidebar con árbol expandible (esconde jerarquía)
- No mover a un launcher de tiles estilo Windows Start (dos clicks para todo)
- No cambiar copy sin razón (respetar guías centinelia-copy-guidelines: sin em-dash, sin "IA" visible, empleado digital)
- No introducir nuevos iconos custom — solo Lucide (regla feedback_no_emojis)

## Constraints técnicos

- **Preservar routing existente** con redirects: `/llamadas/entrantes` → `/historial/llamadas?filtro=entrantes`, etc. No romper links compartidos ni bookmarks de usuarios activos.
- **Preservar `getAgentAccess` / módulos por sub-usuario** (sesión 9-10). El nuevo sidebar debe seguir filtrando por permisos.
- **Preservar dev bypass en proxy.ts** (feedback_dev_bypass).
- **Preservar IDOR pattern** en todas las rutas nuevas (sesiones 35-37).
- Trabajar sobre componentes shadcn/Radix ya instalados (sesión 54: Radix Tabs, Select, Popover, DatePicker, EmptyState).

## Métricas de éxito

- Reducción de items visibles en sidebar de 25+ → ≤ 8 top-level
- Reducción de anclas en `/configurar` de 30+ → 5 tabs
- Tiempo a primera acción (llamada nueva usuario): objetivo < 30s desde login
- Cero duplicación semántica (mismo concepto en 2+ URLs)

## Fases sugeridas de implementación

Para no romper todo de golpe, tres fases:

### Fase 1 — IA sin refactor (1-2 días)
- Nuevo sidebar con 5 grupos (feature flag `portal_v2`)
- Redirects de rutas viejas → nuevas
- Sin cambios en las páginas mismas todavía

### Fase 2 — Fusiones estructurales (3-5 días)
- `/actividad/llamadas` unificada con pills
- Bandeja absorbe mesa de ayuda + aprobaciones + fallas
- `/cuenta/herramientas` launcher grid

### Fase 3 — Refactor `/configurar` (2-3 días)
- Colapso de 30 anclas → 5 tabs
- Acordeones dentro de cada tab
- Onboarding tour

Cada fase se lanza detrás del feature flag `portal_v2`, activable por org.

## Preguntas abiertas

- ¿Feature flag por org o rollout global con revert? *Recomendación: feature flag, sin fecha de forzado.*
- ¿Piloto interno con AC Proyectos primero antes de rollout? *Recomendación: sí — coincide con handoff_google_sheets_integration.*
- ¿URLs en español (`/escritorio`, `/historial`) o mantener inglés (`/desktop`, `/history`) por consistencia dev? *Recomendación: español, coincide con el resto del portal (`/oficina`, `/agentes`, `/llamadas`).*

## Anexo — mapping viejo → nuevo (redirects)

```
/portal/[t]                          → sin cambio (/escritorio)
/portal/[t]?tab=negocio              → /administracion/organizacion
/portal/[t]?tab=cuenta               → /administracion/uso
/agentes                             → /equipo
/configurar                          → /equipo/[id]/configurar
/llamadas/entrantes                  → /historial/llamadas?filtro=entrantes
/llamadas/salientes                  → /historial/llamadas?filtro=salientes
/oficina                             → /escritorio (widget "Equipo hoy" absorbe)
/oficina/bandeja                     → /bandeja
/oficina/llamadas                    → /historial/llamadas
/oficina/reportes                    → /historial/reportes
/oficina/aprendizajes                → /historial/aprendizajes
/oficina/investigacion               → /historial/investigacion
/oficina/helpdesk                    → /bandeja?tipo=helpdesk
/oficina/documentos                  → /administracion/recursos/documentos
/oficina/contratos                   → /administracion/recursos/contratos
/oficina/plantillas                  → /administracion/recursos/plantillas
/oficina/tareas-programadas          → /administracion/recursos/tareas
/oficina/juntas                      → /administracion/recursos/juntas
/oficina/onboarding                  → /administracion/recursos/onboarding
/oficina/encuestas                   → /administracion/recursos/encuestas
/oficina/cabildo                     → /administracion/recursos/cabildo
/oficina/integraciones               → /cuenta/integraciones
/usuarios                            → /administracion/usuarios
```

## Anexo — glosario de renombres

Para mantener consistencia entre landing, portal y comunicaciones:

| Concepto en producto | Copy visible en portal | Nota |
|---|---|---|
| Portal | "Tu oficina digital" (header) | La landing lo llama así, aquí también |
| Dashboard/Inicio | "Escritorio" | Metáfora física |
| Sección de billing/perfil | "Administración" | En lugar de "Cuenta" (más neutro que "Mi cuenta", más cálido que "Ajustes") |
| Historial de eventos | "Historial" | En lugar de "Actividad" |
| Sub-sección con docs/plantillas/contratos | "Recursos de la oficina" | En lugar de "Herramientas" (no confundir con tools de agente) |
| Empleados IA | "Tu equipo" | Coherente con feedback_empleado_digital |
