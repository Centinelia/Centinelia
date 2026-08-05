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

## Principio de diseño: "4 verbos + Cuenta"

Un dueño de PYME resuelve 4 preguntas en un portal así. Toda la navegación se organiza alrededor de esas 4, más un espacio administrativo:

| Verbo       | Pregunta que responde                 | Espacio      |
|-------------|---------------------------------------|--------------|
| **Ver**     | ¿Cómo va mi negocio?                  | 🏠 Inicio     |
| **Actuar**  | ¿Qué requiere mi atención ahora?      | 📥 Bandeja    |
| **Revisar** | ¿Qué pasó?                            | 📞 Actividad  |
| **Ajustar equipo** | ¿Qué está haciendo mi equipo? Configurarlo. | 👥 Equipo    |
| —           | Organización, integraciones, billing  | ⚙️ Cuenta    |

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
Sidebar (5 grupos):
├─ 🏠 Inicio
├─ 📥 Bandeja
├─ 📞 Actividad
│    · Llamadas (filtros: entrantes · salientes · campañas · missed)
│    · Reportes
│    · Aprendizajes
│    · Investigación
├─ 👥 Equipo
│    · Lista de empleados
│    · Configurar empleado [modal/drawer con 5 tabs]
│    · Cómo trabajamos (patrones + insights)
└─ ⚙️ Cuenta
     · Organización (perfil, marca, horarios)
     · Herramientas (launcher grid)  ← 9 tools ops
     · Integraciones
     · Usuarios y permisos [owner]
     · Uso y compras
     · Historial
```

Total: **5 items visibles en el sidebar principal**, resto es sub-navegación contextual dentro de cada espacio (pills, tabs, drawers). El usuario ve 5 opciones a la vez, no 25.

## Cambios específicos

### 1. Fusión de "Llamadas" — de 3 rutas a 1

**Antes:** `/llamadas/entrantes`, `/llamadas/salientes`, `/oficina/llamadas` (4 tabs).

**Después:** una sola ruta `/actividad/llamadas` con pills filtro en el header:

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

### 4. "Oficina" como launcher, no como grupo

El grupo "Oficina" **desaparece del sidebar**. Sus 14 items se redistribuyen:

| Ítem actual          | Nueva ubicación                     |
|----------------------|-------------------------------------|
| Hoy en la oficina    | Se fusiona con Inicio (widget "Equipo hoy" ya existe) |
| Bandeja              | → 📥 Bandeja (top-level)             |
| Llamadas             | → 📞 Actividad › Llamadas            |
| Reportes             | → 📞 Actividad › Reportes            |
| Aprendizajes         | → 📞 Actividad › Aprendizajes        |
| Investigación        | → 📞 Actividad › Investigación       |
| Mesa de ayuda        | → 📥 Bandeja (chip "Mesa de ayuda")  |
| Documentos           | → ⚙️ Cuenta › Herramientas           |
| Contratos            | → ⚙️ Cuenta › Herramientas           |
| Plantillas           | → ⚙️ Cuenta › Herramientas           |
| Tareas programadas   | → ⚙️ Cuenta › Herramientas           |
| Juntas               | → ⚙️ Cuenta › Herramientas           |
| Onboarding           | → ⚙️ Cuenta › Herramientas           |
| Encuestas            | → ⚙️ Cuenta › Herramientas           |
| Integraciones        | → ⚙️ Cuenta › Integraciones          |
| Cabildo (gov)        | → ⚙️ Cuenta › Herramientas (solo si gov) |

**Herramientas** es una sola página `/cuenta/herramientas` con grid de cards. Cabe en una pantalla. Es un espacio al que entras cuando lo necesitas, no ruido permanente del sidebar.

### 5. Inicio — bajar densidad

**Antes:** 7 KPIs + 4 widgets grandes + 6 anclas de scroll.

**Después:**
- **3 KPIs primarios** grandes: Ahorros del mes · Llamadas hoy · Requieren tu atención (count)
- **1 fila secundaria** de 4 stats: Autonomía · Tasa contestada · Sin intervención · Tareas completadas
- **2 widgets** máximo: "Equipo hoy" (con estado tiempo real) + "Feed" (últimos eventos importantes)
- Quita: "Cómo trabajamos" (mover a Equipo), Insights (mover a Actividad › Aprendizajes), 3 anclas de scroll

### 6. Deduplicación explícita

Un solo lugar por concepto:

| Concepto      | Ubicación única                        |
|---------------|----------------------------------------|
| Documentos    | `/cuenta/herramientas/documentos`      |
| Integraciones | `/cuenta/integraciones`                |
| Reportes      | `/actividad/reportes` (resumen en Inicio) |
| Contactos     | `/actividad/llamadas?filtro=salientes&view=contactos` |
| Horarios      | `/cuenta/organizacion#horarios`        |
| Marca         | `/cuenta/organizacion#marca`           |

### 7. Onboarding — mini-tour primera visita

Primera vez que un usuario entra al portal, tooltip highlight sobre los 4 verbos + Cuenta, uno por vez:

1. "Aquí ves cómo va tu negocio" → resalta Inicio
2. "Aquí actúas sobre lo que requiere tu atención" → resalta Bandeja
3. "Aquí revisas lo que pasó" → resalta Actividad
4. "Aquí ajustas a tu equipo" → resalta Equipo
5. "Y aquí lo administrativo" → resalta Cuenta

Persistido en `portal_users.onboarding_seen_at` o similar.

## Anti-patterns evitados

- No colapsar todo en un mega-sidebar con árbol expandible (esconde jerarquía)
- No mover a un launcher de tiles estilo Windows Start (dos clicks para todo)
- No cambiar copy sin razón (respetar guías centinelia-copy-guidelines: sin em-dash, sin "IA" visible, empleado digital)
- No introducir nuevos iconos custom — solo Lucide (regla feedback_no_emojis)

## Constraints técnicos

- **Preservar routing existente** con redirects: `/llamadas/entrantes` → `/actividad/llamadas?filtro=entrantes`, etc. No romper links compartidos ni bookmarks de usuarios activos.
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

- ¿"Empleado" como verbo top-level ("👥 Equipo") o dentro de Cuenta? *Recomendación: top-level, es el core del producto.*
- ¿"Herramientas" cabe en Cuenta o merece top-level? *Recomendación: dentro de Cuenta — no son diarias.*
- ¿Feature flag por org o rollout global con revert? *Recomendación: feature flag, sin fecha de forzado.*
- ¿Piloto interno con AC Proyectos primero antes de rollout? *Recomendación: sí — coincide con handoff_google_sheets_integration.*

## Anexo — mapping viejo → nuevo (redirects)

```
/portal/[t]                          → sin cambio (Inicio)
/portal/[t]?tab=negocio              → /cuenta/organizacion
/portal/[t]?tab=cuenta               → /cuenta/uso
/agentes                             → /equipo
/configurar                          → /equipo/[id]/configurar
/llamadas/entrantes                  → /actividad/llamadas?filtro=entrantes
/llamadas/salientes                  → /actividad/llamadas?filtro=salientes
/oficina                             → /inicio (widget "Equipo hoy" absorbe)
/oficina/bandeja                     → /bandeja
/oficina/llamadas                    → /actividad/llamadas
/oficina/reportes                    → /actividad/reportes
/oficina/aprendizajes                → /actividad/aprendizajes
/oficina/investigacion               → /actividad/investigacion
/oficina/helpdesk                    → /bandeja?tipo=helpdesk
/oficina/documentos                  → /cuenta/herramientas/documentos
/oficina/contratos                   → /cuenta/herramientas/contratos
/oficina/plantillas                  → /cuenta/herramientas/plantillas
/oficina/tareas-programadas          → /cuenta/herramientas/tareas
/oficina/juntas                      → /cuenta/herramientas/juntas
/oficina/onboarding                  → /cuenta/herramientas/onboarding
/oficina/encuestas                   → /cuenta/herramientas/encuestas
/oficina/cabildo                     → /cuenta/herramientas/cabildo
/oficina/integraciones               → /cuenta/integraciones
/usuarios                            → /cuenta/usuarios
```
