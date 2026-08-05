# Portal V2 — Critical UX Audit
**Date:** 2026-08-05
**Auditor:** Claude Sonnet 4.6 via Claude Code
**Scope:** 6 pages, V2 layout (portal_v2_enabled=true)
**Method:** Source code analysis (page.tsx, LlamadasTabs.tsx, bandeja/page.tsx, agentes/page.tsx) + 5 reference screenshots

---

## /portal/[t]?tab=inicio (Inicio)

**Historia:** El dueño llega a ver cuántas llamadas tuvieron hoy, si el equipo está activo, y qué pasó recientemente. La historia es razonablemente coherente pero hay ruido en el sidebar y en la columna derecha que dispersan el foco.

**Problemas críticos:**

- [DUPLICADO] "Contexto de empleados" (sidebar izquierdo, sección USO DEL MES + columna derecha) — los progress bars de minutos/tareas ya viven en la sidebar (minutesRemain / minutesIncluded se pasan a PortalSidebarV2Client, línea 1812-1815 de page.tsx), y aparecen de nuevo en la columna derecha como card dedicada. El usuario ve la misma info en tres lugares: sidebar footer, columna derecha "Contexto de empleados", y KPI "Tareas (de 2200 disponibles)".
- [SIN VALOR] "Contexto de empleados" en columna derecha — la barra de "X tokens" de memoria del empleado no lleva a ninguna acción que el usuario pueda tomar desde /inicio. El link dice "Configurar en Empleados" que saca al usuario de la página. Si el widget existe para motivar a configurar KB, esa acción vive en /negocio o /agentes, no aquí.
- [DESBALANCEADO] La columna derecha (260px) tiene 2 cards: "Reporte mensual" (MonthReportPicker = ~120px de contenido real) y "Contexto de empleados" (~variable, puede ser vacío con mensaje placeholder). Cuando no hay KB configurado, la columna derecha colapsa a contenido fantasma y el grid 1fr/260px queda muy desbalanceado.
- [DESBALANCEADO] "Brief del día" (BriefDelDiaCard) aparece condicionado a `hasNox` pero cuando existe es un card grande con un CTA "Preparar ahora — Cuesta 5 tareas". Ocupa ~140px verticales antes de la sección de Actividad. Para la mayoría de usuarios sin Nox, este bloque no existe, lo cual hace que la página tenga alturas radicalmente distintas por cliente.
- [SIN VALOR] "Autonomía 97%" como StatChip adicional bajo los KPIs — duplica la información del KPI "Sin intervención 73 / 97% del total". Dos representaciones del mismo número en el mismo viewport.
- [FUERA DE LUGAR] "Reporte mensual" en columna derecha — descargar un CSV mensual es una acción administrativa que pertenece a /cuenta, no al dashboard de operaciones diarias.
- [FUERA DE LUGAR] Filtro de período (7 días / 30 días / Todo) floats en el top de la página con `?period=` en URL — cuando el usuario cambia el período, los KPIs cambian pero el "Brief del día" y "Contexto de empleados" no cambian. El filtro parcialmente aplica, lo cual es confuso.
- [DUPLICADO] "Tu equipo hoy" — lista de empleados con estado activo/inactivo y llamadas. Esta misma info vive en /agentes como EquipoHoySection (línea 743 agentes/page.tsx). Tener la tabla en dos páginas simultaneamente sin diferenciación clara crea confusión de "¿a cuál le hago caso?".

**Propuesta de rediseño (esencial only):**
1. Greeting banner + status del sistema (activo/pausado) — mover el pulse dot al header o eliminarlo del body
2. KPI row: 3 tarjetas primarias (Conversaciones, Sin intervención, Tareas)
3. StatChips: solo Tasa contestada + Leads + Citas (eliminar Autonomía duplicada)
4. Actividad reciente: feed de últimas 5 interacciones con tabs Recientes/Horaria
5. Filtro de período

**Eliminar:**
- Card "Contexto de empleados" de la columna derecha
- StatChip "Autonomía" (ya en KPI "Sin intervención")
- "Tu equipo hoy" de /inicio (ya vive en /agentes con más contexto)
- Columna derecha entera: mover MonthReportPicker a /cuenta

**Mover:**
- MonthReportPicker → /cuenta (es acción administrativa de billing)
- "Contexto de empleados" → /agentes (está directamente relacionado con la configuración de cada empleado)
- Brief del día → bloque colapsado dentro de la actividad, no card separada del mismo nivel que los KPIs

**Severity total:** MEDIA — funciona, pero tiene 8 issues de duplicación y posicionamiento que fragmentan el foco

---

## /portal/[t]?tab=negocio (Organización)

**Historia:** El dueño configura todo lo relacionado con su negocio: datos, branding, manual de la empresa, horarios. La historia es correcta pero el layout 3 columnas es estructuralmente roto.

**Problemas críticos:**

- [DESBALANCEADO] Layout 3 columnas con alturas radicalmente distintas: Col 1 (flex-1, ~5 cards grandes: OrgCard + BrandKitEditor + KnowledgeBaseEditor + OwnerProfileEditor + ContractTrackerSection) puede tener 1800px de altura. Col 2 (flexBasis:420px, WebsiteSyncButton + ReviewLinkEditor + EmailSettings) ~400px. Col 3 (flexBasis:280px, solo BusinessHoursEditor) ~280px. Con `items-start` el grid colapsa en alturas 1800/400/280 — las columnas 2 y 3 quedan como islas cortas al lado de una columna altísima.
- [FUERA DE LUGAR] ContractTrackerSection (rastreo de contratos internos con clientes) está en /negocio cuando pertenece a /cuenta o a una sección dedicada de "Documentos". Es un tracker financiero-legal, no una configuración del negocio.
- [FUERA DE LUGAR] BrandKitEditor (colores de email, logo, dirección, pie de email) está en /negocio pero es específicamente la configuración de output de documentos/correos. Pertenece a /negocio solo si /negocio es "todo lo visual", pero actualmente convive con el Manual de KB y el Perfil del dueño que son contenido, no apariencia.
- [SIN VALOR] La Col 2 agrupa WebsiteSyncButton + ReviewLinkEditor en una sola Card bajo el título "Sitio web y reseñas" — dos funciones conceptualmente distintas (sincronizar conocimiento vs. captar reseñas) agrupadas por razones de layout, no semánticas.
- [SIN VALOR] EmailSettings ("Notificaciones automáticas al cliente") en Col 2 bajo "PRESENCIA" — la configuración de dominio de correo saliente es una operación técnica de nivel de cuenta, más cercana a Integraciones que a Organización.
- [DESBALANCEADO] Col 3 tiene solo BusinessHoursEditor dentro de una card. Un solo widget en toda una columna fija de 280px. En pantallas de 1280px, esto ocupa el 17% del ancho de página con un formulario de horarios que apenas necesita 200px de altura.

**Propuesta de rediseño (esencial only):**
1. Col 1 (main): OrgCard, KnowledgeBaseEditor, OwnerProfileEditor
2. Col 2 (sidebar 360px): WebsiteSyncButton, BusinessHoursEditor, ReviewLinkEditor
3. BrandKitEditor → mover a /configurar del empleado o a una sección "Identidad" separada
4. EmailSettings → mover a /oficina/integraciones o a /cuenta
5. ContractTrackerSection → mover a /cuenta o sección dedicada

**Eliminar:**
- Col 3 como columna separada: colapsar BusinessHoursEditor en Col 2

**Mover:**
- ContractTrackerSection → /cuenta
- EmailSettings → /oficina/integraciones
- BrandKitEditor → subsección dentro de OrgCard o configuración de empleado

**Severity total:** ALTA — el layout 3 columnas con disparidad de ~1520px es el caso más roto visualmente de las 6 páginas

---

## /portal/[t]?tab=cuenta (Cuenta)

**Historia:** El usuario ve cuántos minutos y tareas tiene, puede comprar más, ver historial y conocer su número de cuenta. La historia es coherente pero tiene los problemas de col 3 vacía y duplicación que Nazre ya identificó.

**Problemas críticos:**

- [DUPLICADO] "NÚMERO DE CUENTA" en Col 3 — el serial (CNT-TNV7Q) ya vive en el header como `AccountSerialBadge variant="header"` (línea 1820 de page.tsx). La Col 3 completa (300px fija) existe solo para mostrar ese badge como card con descripción. Es decir: Col 3 = 300px de ancho fijo para un valor que ya está en el header. Altura real del contenido de Col 3: ~120px frente a Col 1 que puede tener 600px y Col 2 con historial de 420px.
- [DESBALANCEADO] Grid 3 columnas `lg:grid-cols-[1fr_300px_300px]`: Col 1 tiene Uso del mes + Comprar saldo + Recarga automática (dentro de CuentaUsageTabsCard con tabs). Col 2 tiene Consumo promedio + Historial de minutos (maxHeight:420px scroll). Col 3 tiene solo AccountSerialBadge. Alturas estimadas: Col 1 ~380px, Col 2 ~600px, Col 3 ~120px. Disparidad de 480px entre Col 2 y Col 3.
- [SIN VALOR] "ANÁLISIS — Consumo promedio" (Col 2) muestra promedios de días/semana/mes de minutos y tareas. Son números informativos puro: "3.5 min por día", "24 min por semana", "104 min por mes". No tienen acción asociada (no hay botón de "recargar si el promedio excede X", no navegan a nada, no son clicables). Ocupan el espacio de mayor visibilidad en Col 2 antes del historial.
- [FUERA DE LUGAR] ContractTrackerSection debería estar aquí (hoy vive en /negocio), pero no está. La relación entre contratos financieros con Centinelia y el estado de cuenta es natural; los contratos con clientes internos no.
- [DUPLICADO] Los progress bars de Minutos y Tareas del uso mensual en la sidebar izquierda (USO DEL MES) duplican exactamente la card "Uso del mes" de Col 1. El usuario puede ver "979 restantes / 1599 restantes" en sidebar Y en la card al mismo tiempo.

**Propuesta de rediseño (esencial only):**
1. Layout 2 columnas: Col 1 (fused: uso + comprar + recarga en tabs), Col 2 (historial)
2. Serial number → solo en header (eliminar card)
3. Consumo promedio → colapsado o debajo del historial como insight contextual con acción "recarga anticipada si excedes tu plan"
4. Agregar ContractTrackerSection (traída desde /negocio) como sección adicional al fondo

**Eliminar:**
- Col 3 completa (AccountSerialBadge card)
- "Consumo promedio" como card prominente de Col 2 — colapsar como tooltip/detail bajo el historial

**Mover:**
- ContractTrackerSection desde /negocio → aquí
- Uso del mes de la sidebar → solo sidebar (eliminar duplicado en Col 1), o al revés: quitar de sidebar y dejar aquí

**Severity total:** ALTA — Col 3 vacía confirmada con 120px de contenido vs 600px de la col adyacente; duplicación del serial; duplicación de uso en sidebar

---

## /portal/[t]/agentes (Empleados)

**Historia:** El dueño ve todos sus empleados con estado, capacidades y puede configurar o pausar cada uno. La historia es coherente. El problema es la secuencia: hay 3 bloques distintos en la misma página sin jerarquía clara.

**Problemas críticos:**

- [FUERA DE LUGAR] EquipoHoySection (tabla de actividad en tiempo real de cada empleado) aparece en /agentes antes de la lista de tarjetas. Esta misma sección también aparece en /inicio. La duplicación entre páginas significa que si el dueño quiere ver el estado del equipo hoy, no sabe si debe ir a /inicio o a /agentes.
- [DESBALANCEADO] Las tarjetas de agentes son 120px de avatar + nombre + descripción + capacidades colapsadas + stats + botones = ~280px por tarjeta en grid 3 columnas. Pero cuando un meerkat tiene descripción larga + muchas capacidades desplegadas, el card crece a ~400px mientras otro card sin descripción se queda en ~220px. El grid no nivela alturas porque `flex-col` con `flex-1 justify-end` en las capacidades no resuelve el desbalance entre tarjetas con y sin descripción.
- [SIN VALOR] "Capacidad Oficina" banner (capabilityBanner) calcula overallPct de herramientas cubiertas vs disponibles y muestra un "tier" (Oficina Básica, Profesional, etc.). Para un usuario que acaba de ver las tarjetas de sus empleados, este banner de porcentaje agrega una capa de abstracción innecesaria. El 95% de los usuarios no sabe qué significa "Oficina Empresarial" ni qué herramientas les faltan para subirlo.
- [SIN VALOR] "Ranking del equipo" (AgentRankingSection) aparece al fondo de la página, debajo de las tarjetas y del capabilityBanner. Es un tercero bloque de info sobre los empleados que no tiene CTA: no puedes reordenar, no puedes actuar desde ahí. Informacional puro.
- [FUERA DE LUGAR] MeerkatPicker (botón "Contratar empleado") en el header de /agentes cuando `missingCats.length > 0` — aparece tambien dentro del capabilityBanner. El botón de contratar tiene dos instancias en la misma página (líneas 727 y 753 de agentes/page.tsx).

**Propuesta de rediseño (esencial only):**
1. Header: "Mis empleados" + count + botón "Agregar empleado" (único CTA de contratación)
2. Grid de tarjetas (sin EquipoHoySection, que debe quedarse solo en /inicio)
3. Tarjetas: nombre + rol + estado + 2 stats + botones (quitar descripción a tooltip/hover)

**Eliminar:**
- EquipoHoySection de /agentes (mantenerla solo en /inicio)
- AgentRankingSection (no es accionable, es vanity metric)
- capabilityBanner "Oficina Básica/Empresarial" — demasiado abstracto para el dueño PYME; si el objetivo es vender más empleados, el CTA debe ser directo, no un porcentaje gamificado

**Mover:**
- MeerkatPicker CTA → eliminar duplicado del capabilityBanner, dejar solo en header

**Severity total:** MEDIA — funciona pero tiene 2 secciones duplicadas (EquipoHoy) y 2 secciones sin acción (ranking, officeBanner)

---

## /portal/[t]/oficina/bandeja (Bandeja)

**Historia:** El agente/dueño ve qué elementos necesitan su atención (correos pendientes) y puede configurar el helpdesk. La historia es simple. La página en sí no es problemática structuralmente.

**Problemas críticos:**

- [DESBALANCEADO] AttentionPanel (parte superior "Necesitan tu atención") muestra un empty state gigante (~240px) cuando no hay pendientes: icono verde checkmark grande, texto "Todo al día / Sin pendientes en este momento", luego "ACCESO RÁPIDO" con 3 links (Críticos, Contratos, Juntas). Cuando está vacío, el empty state domina 60% de la altura visible de la página para decir "no hay nada".
- [SIN VALOR] "Acceso rápido: Críticos / Contratos / Juntas" dentro del AttentionPanel cuando está vacío — estos links existen en la sidebar izquierda de /oficina. Son atajos a secciones que el usuario ya puede navegar. En el estado vacío (el más común) son el contenido más visible de la página.
- [SIN VALOR] BandejaHelpdeskToggle muestra tabs "Bandeja / Mesa de ayuda" — si el usuario no tiene Neo (meerkat IT), la tab "Mesa de ayuda" muestra información sobre helpdesk como un callout pero sin funcionalidad real. Es una sección de marketing dentro de una página operacional.
- [FUERA DE LUGAR] CommsRoutingEditor (visible solo para gobierno `vertical === 'gobierno'`) aparece entre AttentionPanel y BandejaHelpdeskToggle. Para la mayoría de usuarios esto no aplica, pero el código genera el slot condicionalmente. No es un problema para usuarios normales pero es una señal de que la bandeja tiene lógica de segmentos mezclada.
- [DESBALANCEADO] Cuando la Bandeja tiene items (filtro Pendientes activo), el search input ocupa el ancho completo pero el listado de mensajes abajo queda en una columna sola sin panel de detalle. El usuario abre un mensaje ¿dónde va? No hay panel lateral — parece que navega o abre modal. Si el listado es largo, hay mucho scroll con poco contexto.

**Propuesta de rediseño (esencial only):**
1. AttentionPanel: si vacío, colapsar a una barra slim de "Todo al día" con un count badge; reservar espacio grande solo cuando hay items
2. Bandeja de entrada: tabs Pendientes/Auto-enviados/Spam/Todo con search
3. Mesa de ayuda: solo mostrar si `hasNeo === true`; si no, omitir la tab

**Eliminar:**
- "Acceso rápido" links en el empty state del AttentionPanel (ya en sidebar)
- Tab "Mesa de ayuda" cuando no hay Neo configurado

**Mover:**
- CommsRoutingEditor → a una sección de configuración de la bandeja, no entre el panel y el listado

**Severity total:** BAJA — structuralmente funciona; los problemas son de empty state y de secciones condicionales que agregan ruido

---

## /portal/[t]/oficina/llamadas?filtro=entrantes (Llamadas)

**Historia:** El dueño ve el historial de llamadas entrantes, puede buscar, filtrar y descargar. Opcional: ver salientes y campañas. La historia es correcta y la estructura de tabs funciona bien.

**Problemas críticos:**

- [DESBALANCEADO] Las tarjetas de llamadas en el registro (CallsSearch via LeadsTabsSection) tienen altura variable: algunas muestran solo nombre + número + duración (~60px), otras con transcript largo pueden crecer a ~200px. En la vista de la screenshot hay tarjetas que muestran párrafos completos de transcripción inline, lo que hace que el scroll sea impredecible.
- [SIN VALOR] "Capturas desde el inicio" (LeadsTabsSection, línea 153 de LlamadasTabs) aparece como bloque separado debajo del registro de llamadas con label "Capturas desde el inicio". Muestra leads/pedidos/citas acumulados de todos los tiempos. Hay un mismatch semántico: el filtro de período de /inicio no aplica aquí, y los datos son "all time" sin posibilidad de filtrar. El usuario que acaba de ver las llamadas del período no esperaría ver totales históricos al hacer scroll.
- [FUERA DE LUGAR] OutboundToggles dentro del tab "Salientes" — los toggles de "activar llamadas salientes" y "activar missed call recovery" son cambios de configuración del empleado. Aparecen dentro de la página de llamadas cuando deberían vivir en /configurar del empleado o en /agentes → Configurar. Que estén aquí hace que el usuario los vea cada vez que cambia al tab Salientes, incluso después de haberlos configurado ya.
- [SIN VALOR] "Live pulse" texto ("Nox atendió su última llamada hace X min") aparece cuando la última llamada tiene menos de 2 horas. Es informacional y solo aparece en estado edge. No es accionable.
- [DUPLICADO] Las tabs del filtro (Entrantes / Salientes / Campañas) cambian la URL con `?filtro=` y hacen server-side fetch. Pero el tab "Campañas" muestra la misma OutboundSection que "Salientes", más un OutboundSection con `initialTab="campanas"`. La división Salientes/Campañas como dos tabs separadas cuando comparten el mismo componente y los mismos datos crea confusión sobre qué diferencia a una de la otra.

**Propuesta de rediseño (esencial only):**
1. Header: pills Entrantes (N) / Salientes / Campañas — ok, mantener
2. Tab Entrantes: registro de llamadas con search + download; nada más
3. Capturas (leads/citas/pedidos): mover a una sub-sección de /inicio o a /contactos, no al fondo de llamadas
4. Tab Salientes: solo el listado de contactos y campañas activas; mover OutboundToggles a /configurar

**Eliminar:**
- "Capturas desde el inicio" de /llamadas
- "Live pulse" text (no aporta valor accionable)

**Mover:**
- OutboundToggles (activar salientes/recovery) → /agentes → Configurar del empleado específico
- LeadsTabsSection → /inicio o /contactos

**Severity total:** MEDIA — la estructura de tabs es correcta, pero tiene 5 issues de posicionamiento y duplicación de datos

---

## Resumen ejecutivo

| Página | Issues | Severity |
|---|---|---|
| /inicio | 8 | MEDIA |
| /negocio | 6 | ALTA |
| /cuenta | 5 | ALTA |
| /agentes | 5 | MEDIA |
| /bandeja | 5 | BAJA |
| /llamadas | 5 | MEDIA |

**Patrón transversal detectado:** Los datos de uso (minutos/tareas) aparecen en 3 lugares distintos (sidebar, KPI en /inicio, card en /cuenta). El serial de cuenta aparece en 2 lugares. EquipoHoySection aparece en 2 páginas. Antes de cualquier rediseño por página, hay que decidir la fuente de verdad para estos elementos compartidos y eliminar las copias.

**Problema sistémico mayor:** /negocio tiene 3 columnas con alturas 1800/400/280px — es el layout más roto. /cuenta tiene Col 3 de 120px vs Col 2 de 600px. Ambos necesitan colapsar a 2 columnas.
