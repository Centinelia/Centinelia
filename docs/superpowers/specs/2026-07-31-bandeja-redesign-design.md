# Rediseño de la bandeja del portal (Oficina · Bandeja)

**Fecha:** 2026-07-31
**Trigger:** Sesión 50 (2026-07-31). Nazre reportó: "Siento la bandeja muy desordenada. Es difícil encontrar un correo, no sé qué sea pero no me gusta."
**Estado:** Diseño aprobado, listo para implementación.

## Contexto

La bandeja (`/portal/[token]/oficina/bandeja`, componente `src/app/portal/[token]/OpsInboxSection.tsx`) muestra `ops_inbox` items en una lista plana bajo tabs de status. Nazre reporta fricción sin poder articular la causa. Brainstorming reveló:

- **Volumen bajo (<20 items típicos).** El problema no es escala, es jerarquía visual y arquitectura de información.
- **Modo de búsqueda mental mezcla tiempo + acción requerida.** No es identidad ni categoría pura.
- **Al entrar espera ver "lo que requiere tu acción ya".** Es una bandeja de trabajo, no un archivo cronológico.
- **Extraña de Gmail:** categorías automáticas visibles (Primary/Promotions style).
- **Las 4 categorías de fricción aplican:** falta estructura, filtros débiles, densidad visual mala, multi-agente confuso.

## Objetivos

1. Que Nazre entre a la bandeja y vea en primer scan qué requiere su acción vs qué está al día.
2. Que la categoría de cada correo (cliente, proveedor, factura, urgente, otros) sea visible sin expandir.
3. Que se distinga visualmente qué agente procesó qué correo cuando hay >1 agente activo.
4. Que read/unread tenga contraste real (peso tipográfico + color), no solo un dot.

## No objetivos

- Paginación / infinite scroll (volumen bajo lo hace innecesario).
- Búsqueda en el cuerpo del correo (fuera de scope, requeriría full-text en Supabase).
- Sub-tabs por categoría (fricción de navegación con <20 items).
- Snooze, star, threads (patrones Gmail no priorizados en brainstorm).
- Cambios de DB o de la API `ops-inbox/route.ts` (todo se calcula en cliente).

## Diseño

### Estructura del layout

Dentro de cada tab actual, el contenido pasa de lista plana a esta estructura vertical:

```
┌─ Tabs (sin cambio) ────────────────────────────┐
│  Pendientes 16 · Auto-enviados 3 · Spam 43 ... │
└────────────────────────────────────────────────┘

┌─ Search bar (sin cambio) ──────────────────────┐

┌─ Chips de categoría (NUEVO) ───────────────────┐
│  [Todas 16] [Cliente 8] [Proveedor 5]          │
│  [Factura 2] [Otros 1]                         │
└────────────────────────────────────────────────┘

┌─ Sección "PENDIENTES TUYOS" (sin cambio) ──────┐
│  human_requests que te escalaron               │
└────────────────────────────────────────────────┘

┌─ Zona 1: "Requieren tu acción" (NUEVO) ────────┐
│  Items con status: escalated + info_requested  │
│  Header con conteo. Fondo tenue de énfasis.    │
└────────────────────────────────────────────────┘

┌─ Zona 2: "Al día" (NUEVO) ─────────────────────┐
│  Todo lo demás dentro del tab activo           │
│  Header con conteo, colapsable si son >10      │
└────────────────────────────────────────────────┘
```

**Reglas de partición:**

- Zona 1 = items con `status in ('escalated', 'info_requested')`.
- Zona 2 = todo lo demás dentro del tab activo (pending sin escalar, auto_replied, etc.).
- En tabs donde una zona esté vacía, esa zona se oculta (sin headers huérfanos).
- En tab "Auto-enviados" y "Spam" prácticamente todo va a Zona 2. En "Reportados" no se aplica partición (todo se muestra sin zonas).

### Chips de categoría

- **Fuente:** columna `ops_inbox.category`, ya existente.
- **Auto-derivados** del contenido del tab activo. Si no hay proveedores hoy, no aparece el chip "Proveedor".
- **Orden fijo cuando aplican:** `Todas → Cliente → Proveedor → Factura → Urgente → Otros`. "Otros" agrupa categorías no reconocidas (case-insensitive, trim aplicado).
- **Single-select.** `Todas` es default. Click filtra ambas zonas.
- **Conteo dinámico:** `Cliente 8`. Refleja el resultado post-search cuando hay término activo.
- **Estado visual:** activo con fondo `#6C3BFF` + texto blanco. Inactivos con borde suave + texto neutro.
- **Auto-oculto:** si el tab activo tiene ≤3 items totales, los chips no se muestran.
- **URL:** el chip activo se refleja en `?tab=pending&cat=<slug>` donde `slug ∈ { cliente, proveedor, factura, urgente, otros }`. Ausencia de `cat` equivale a "Todas". Sobrevive refresh y permite compartir vista filtrada. No rompe deep-links existentes (`?tab=auto`, `?tab=spam`).
- **"Todas" siempre presente**, aunque haya cero items en el tab.

### Rediseño visual de la fila colapsada

```
┌────────────────────────────────────────────────────────┐
│ ● [Cliente] [Sofía] Cotización urgente 100 unidades    │
│               juan@constructora.mx · Hace 2h · Adj 2   │
│                                              [ESCALADO]│
└────────────────────────────────────────────────────────┘
```

**Elementos:**

1. **Dot unread (izquierda).** Círculo lleno `#6C3BFF` si unread, hueco gris si read. Más contraste que hoy.
2. **Chip de categoría (siempre visible).** Pill pequeño con color por categoría:
   - Cliente: azul `bg-blue-500/10 text-blue-700`
   - Proveedor: verde `bg-emerald-500/10 text-emerald-700`
   - Factura: naranja `bg-amber-500/10 text-amber-700`
   - Urgente: rojo `bg-red-500/10 text-red-700`
   - Otros: gris `bg-gray-500/10 text-gray-700`
3. **Chip de agente (condicional).** Solo si el portal tiene >1 agente activo. Pill neutro con nombre del meerkat (Sofía, Nia, Nox, etc.).
4. **Subject.** Peso 600 unread, 400 read. Color negro puro unread, `text-gray-500` read.
5. **From + tiempo relativo + adjuntos.** Línea secundaria `text-xs text-gray-400`. Formato: `juan@constructora.mx · Hace 2h · Adj 2` (adjuntos solo si hay).
6. **Badge de estado (esquina derecha, solo en Zona 1).** Pill sólido:
   - `ESCALADO` con fondo rojo tenue
   - `INFO SOLICITADA` con fondo naranja tenue
   - En Zona 2 no aparece badge.
7. **Banner "Cliente ya respondió"** (existente). Se conserva sobre la fila cuando `client_replied_at` está set.

**Densidad:** filas de ~64px (hoy ~52px). El aumento paga por la jerarquía visual.
**Hover:** fondo `bg-gray-50` sutil (hoy no hay).
**Click:** expande la card completa (comportamiento actual, sin cambios).

## Qué se preserva sin tocar

- Tabs superiores con conteos: Pendientes / Auto-enviados / Spam / Reportados / Todo.
- Deep-link support vía query params (`?tab=auto`, `?tab=spam`) — commit `5994d65`.
- Sección "PENDIENTES TUYOS" (human_requests) sobre la partición Zona 1 / Zona 2.
- Card expandida al click: summary, draft editable, adjuntos, acciones (approve/reject/edit).
- Botón Rescatar en Spam.
- Tab Reportados con detalles del reporte.
- Advertencia amarilla cuando `client_replied_at` está set.
- Draft editable en items pending.
- Correo de corrección al cliente en Reportar mal envío.
- RespondForm con FileDropzone.
- Rendering markdown en emails vía `mdToEmailHtml`.
- `src/app/portal/[token]/oficina/bandeja/page.tsx` (sin cambios).
- Sidebar y badge del sidebar (sin cambios).

## Arquitectura de componentes

`OpsInboxSection.tsx` ya está en ~1000 líneas. Se aprovecha el rediseño para extraer:

- **`<CategoryChips />`** en `src/app/portal/[token]/inbox/CategoryChips.tsx`. Props: `items`, `activeCategory`, `onSelect`. Deriva categorías y conteos internamente.
- **`<InboxZone />`** en `src/app/portal/[token]/inbox/InboxZone.tsx`. Props: `title`, `items`, `children`. Header con conteo, colapsable si `items.length > 10`.
- **`<InboxRow />`** en `src/app/portal/[token]/inbox/InboxRow.tsx`. Props: `item`, `showAgentChip`, `showStateBadge`, `expanded`, `onToggle`. Renderiza fila colapsada nueva y delega expansión al parent (que sigue en `OpsInboxSection`).

Reducción esperada de `OpsInboxSection.tsx`: ~1000 → ~600 líneas.

Cada componente tiene una responsabilidad clara:
- `CategoryChips`: derivación y presentación del filtro secundario.
- `InboxZone`: agrupación visual con header y conteo.
- `InboxRow`: rendering de la row colapsada (fuente única de verdad para la jerarquía visual).

## Estado y flujo de datos

- Sin cambios en la API `src/app/api/portal/[token]/ops-inbox/route.ts`. Devuelve la misma shape.
- Nuevo estado local en `OpsInboxSection`:
  - `activeCategory: string | null` (default `null` = "Todas")
  - Sincronizado a URL via `?cat=<slug>` con `useSearchParams` + `router.replace` (mismo patrón que `?tab=`).
- Partición Zona 1 / Zona 2 y filtro por categoría se computan en cliente con `useMemo` sobre los items ya traídos.
- Chip de agente se muestra si `new Set(items.map(i => i.agent_id)).size > 1`.

## Constraints técnicos

- Spanish, sin em-dashes. Usar `:` `,` `.`
- Sin emojis en UI. Iconos Lucide únicamente. En filas nuevas no se usan iconos propios, solo texto + colores.
- Sin "IA" en copy visible. Labels: "Requieren tu acción", "Al día", "Categorías".
- API sin cambios estructurales.
- Performance: `O(n)` sobre ≤100 items, sin riesgo.
- `./node_modules/.bin/tsc --noEmit` debe pasar limpio al final.
- Sin cambios de DB.

## Riesgos y mitigaciones

- **Categorías inconsistentes en `ops_inbox.category`.** Los agentes clasifican con texto libre. Puede haber `cliente`, `Cliente`, `clientes`. Mitigación: normalizar con `.toLowerCase().trim()` y aplicar tabla explícita de sinónimos:
  - `cliente | clientes | client → cliente`
  - `proveedor | proveedores | supplier | vendor → proveedor`
  - `factura | facturas | invoice | recibo → factura`
  - `urgente | urgent | urgencia | prioritario → urgente`
  - todo lo demás cae a "Otros".
- **Sofía legacy en chip de agente.** El chip mostrará "Sofía" en portales donde exista, aunque memory nota que Sofía no es parte del roster oficial de meerkats. Aceptable por ahora, se etiquetará como demo legacy en el futuro (fuera de scope de este spec).
- **Múltiples archivos nuevos.** Se recomienda commits incrementales: (1) extract subcomponentes preservando comportamiento actual, (2) agregar filtro chips, (3) agregar partición zonas, (4) rediseñar row visual, (5) URL sync.

## Métricas de éxito

Cualitativas (Nazre revisa el portal en vivo):
- Al entrar a la bandeja, identifica en <2 segundos qué requiere su acción.
- Puede distinguir sin expandir la categoría de un correo.
- Los correos leídos se ven claramente distintos de los no leídos.
- Con >1 agente activo, el chip de agente aparece y ayuda a filtrar mentalmente.

Cuantitativas (implícitas, sin telemetría nueva):
- `OpsInboxSection.tsx` reducido a ~600 líneas.
- 3 nuevos archivos: `CategoryChips.tsx`, `InboxZone.tsx`, `InboxRow.tsx`.
- 0 cambios en API, 0 cambios en DB.
- 0 regresiones en features shipped en sesión 50 (deep-links, editable draft, Reportar mal envío, Rescatar).

## Ver también

- [[bandeja-redesign-handoff]] — handoff original con las 7 hipótesis y 5 preguntas guía.
- [[decisions-centinelia-session50]] — features shipped en sesión 50 que este rediseño debe preservar.
- [[audit-portal-oficina-handoff]] — audit paralelo del portal + oficina, potencial overlap.
