# Portal Design System — Fase 2

**Fecha:** 2026-08-05
**Autor:** Nazre + Claude
**Estado:** Draft — pendiente review
**Depende de:** Fase 1 shipped en `main` @ `46c49613` (PortalShell + PortalSidebarV2 + PortalHeader ya en producción bajo `portal_v2_enabled` flag)

## Contexto

La Fase 1 del rediseño shipeó la nueva shell del portal (header dark 56px + sidebar light Shopify-tier) detrás del flag `organizations.portal_v2_enabled`. Cuando el flag está ON, el usuario ve la nueva navegación pero **el contenido de cada página sigue con estilos legacy V1** (componentes inline, CSS vars viejas, tipografía inconsistente).

Fase 2 construye el **design system del portal** — el catálogo de primitivas visuales/componentes que después usarán todas las páginas del portal para verse Shopify/Stripe-tier. Fase 3+ (siguiente ciclo) migra página por página al design system.

## Objetivo

Producir un catálogo completo de componentes reutilizables (~26 componentes), tokens semánticos claros (light-only), y layout rules que garanticen consistencia visual + fill-width en todas las páginas del portal.

**Metrica de éxito:** para cualquier página nueva o migrada del portal, todos sus building blocks visuales existen en `src/components/portal-ui/*`. Cero componentes inline duplicados.

## Decisiones de scope (acordadas en brainstorming)

| Decisión | Valor | Razón |
|---|---|---|
| Scope | Grande (26 componentes: 9 primitivas + 11 patterns + 6 overlays) | Cubre 99% del portal actual |
| Approach | Extract & unify | Preserva lógica probada de V1, la reagrupa con diseño renovado |
| Themes | Solo light (dark eliminado) | Simplifica tokens, testing, consistencia |
| Fill-width | Prohibido `max-w-*` en containers de página | Requerimiento directo — ninguna página deja huecos a la derecha |

## Arquitectura

### Ubicación

```
src/components/portal-ui/
├── primitives/         # átomos (Button, Badge, Chip, Input, Textarea, Label, Avatar, Divider, Icon)
├── patterns/           # moléculas (Card, KpiCard, StatChip, SectionHeader, FilterBar,
│                       #  Toolbar, DataTable, EmptyState, RankRow, ActivityEventCard, ProgressBar)
├── overlays/           # Dialog, Toast, Dropdown, Popover, Tabs, Sheet
├── tokens.ts           # Constantes JS para tokens no-CSS (color maps, size maps)
└── index.ts            # Re-exports
```

### Principios

1. **Extract don't rewrite:** los componentes recurrentes (KpiCard en `page.tsx:1210`, RankRow en `AgentRankingSection.tsx:46`, ActivityEventCard en `oficina/ActividadFeed.tsx:55`) se extraen desde su ubicación inline al design system CON el rediseño aplicado — un mismo commit "extract + polish". Sin escribir desde cero.
2. **CSS vars primero, arbitrary values solo cuando sea inevitable:** todos los tokens viven en `globals.css`. Los componentes usan `bg-[var(--surface-elevated)]`, `text-[var(--text-primary)]`, etc.
3. **Documentación con TS:** cada componente tiene JSDoc + props tipadas. No Storybook.
4. **Migration path:** Fase 2 construye el catálogo. Fase 3+ migra páginas UNA POR UNA (un plan chico por página), no big-bang.
5. **shadcn/Radix existentes:** Select, Popover, DatePicker se conservan y se envuelven con nuestros tokens si hace falta consistencia. EmptyState existente se **rediseña in-place** (no se duplica).

### Eliminación de dark theme

`src/app/globals.css` se limpia: se remueven los bloques `[data-theme='dark']` y el default dark. Solo queda un bloque light bajo `:root`. `ThemeToggle` deja de aparecer en el header V2 (borrar el prop `<ThemeToggle />` de las 5 llamadas a PortalShell). Componente `ThemeToggle.tsx` se marca `@deprecated` en su JSDoc, se borra si no queda ningún consumidor.

## Layout rules (aplica a todas las páginas)

Estas reglas son **globales** — el design system las asume y provee helpers para no romperlas.

1. **`<main>` fill-width**: en `PortalShell` ya es `flex-1 min-w-0`. Cada `page.tsx` respeta 100% del ancho — **prohibido `max-w-4xl mx-auto` u otros contenedores que dejen huecos a la derecha.**
2. **Padding lateral consistente**: `px-6` en desktop, `lg:px-8` en pantallas anchas, `px-4` en mobile. Aplica al wrapper directo del content dentro de `<main>`.
3. **Vertical spacing entre secciones**: `space-y-8` (32px) por defecto, `space-y-12` (48px) entre bloques mayores.
4. **Grids que llenan**: usa `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (o `-4`) con `gap-4`, nunca max-width en el grid.
5. **Cards en grid**: cada card `w-full h-full` — se estiran para llenar su celda. Alturas iguales dentro del row via `grid-auto-rows: 1fr` cuando aplique.

### Helper componentes de layout

- `<PageContainer>` — wrapper directo del content, aplica padding lateral consistente (`px-4 md:px-6 lg:px-8 py-6`)
- `<PageSection>` — spacing vertical (`space-y-8`) + opcional heading via `SectionHeader`
- `<GridStretch>` — grid preconfigurado con columnas responsive y auto-rows para alturas iguales

Un `page.tsx` típico se estructura así:

```tsx
export default async function Page(...) {
  return (
    <PageContainer>
      <PageSection heading={{ eyebrow: 'HOY', title: 'Buenas tardes, Pneuma Studio' }}>
        <GridStretch cols={{ base: 1, md: 2, xl: 4 }}>
          <KpiCard ... />
          <KpiCard ... />
          <KpiCard ... />
          <KpiCard ... />
        </GridStretch>
      </PageSection>

      <PageSection heading={{ eyebrow: 'TU EQUIPO HOY', title: 'Empleados activos' }}>
        <Card>
          <RankRow ... />
          <RankRow ... />
        </Card>
      </PageSection>
    </PageContainer>
  );
}
```

## Tokens (light-only)

Todos los tokens viven en `src/app/globals.css` bajo `:root`. Ningún hardcoded hex fuera de `globals.css` — los componentes usan `bg-[var(--surface-elevated)]`.

### Colores

**Superficies:**
```css
--surface-canvas:    #FAFAFB   /* bg de página */
--surface-elevated:  #FFFFFF   /* bg de cards */
--surface-sunken:    #F5F5F7   /* bg de secciones anidadas */
--surface-inverse:   #1A0A3B   /* bg dark (header) */
```

**Bordes:**
```css
--border-subtle:     rgba(26,10,59,0.08)
--border-default:    rgba(26,10,59,0.12)
--border-emphasized: rgba(26,10,59,0.20)
```

**Texto:**
```css
--text-primary:   #1A0A3B     /* headings, valores importantes */
--text-secondary: #3F3D56     /* body */
--text-tertiary:  #6B7280     /* labels, muted */
--text-inverse:   #FAFBFF     /* sobre dark */
--text-accent:    #6C3BFF     /* CTAs, links */
```

**Accent (brand):**
```css
--accent-default:    #6C3BFF
--accent-hover:      #5A2FDB
--accent-emphasized: #4A25B8
--accent-subtle:     #F3EFFF   /* bg tint (active states) */
```

**Semánticos (chips, badges, progress):**
```css
--success: #22C55E   --success-subtle: #DCFCE7
--warning: #F59E0B   --warning-subtle: #FEF3C7
--danger:  #EF4444   --danger-subtle:  #FEE2E2
--info:    #3B82F6   --info-subtle:    #DBEAFE
```

### Spacing (múltiplos de 4, escala 8-point)

```css
--space-1: 4px    --space-2: 8px     --space-3: 12px
--space-4: 16px   --space-6: 24px    --space-8: 32px
--space-12: 48px  --space-16: 64px   --space-24: 96px
```

### Typography

```css
--fs-xs:   11px   /* uppercase labels, section eyebrows */
--fs-sm:   13px   /* secondary body, sub-items */
--fs-base: 14px   /* body, nav items */
--fs-lg:   16px   /* emphasized body */
--fs-xl:   20px   /* h3, card titles */
--fs-2xl:  24px   /* h2, page section titles */
--fs-3xl:  32px   /* h1, KPI numbers */
--fs-4xl:  40px   /* hero numbers */

--font-heading: var(--font-sora)     /* h1-h4, KPI numbers */
--font-body:    var(--font-dm-sans)  /* body, labels, buttons */
--tracking-wide: 0.14em              /* uppercase labels */

--lh-tight:  1.2   /* headings */
--lh-normal: 1.5   /* body */
--lh-loose:  1.7   /* long-form text */
```

### Radius

```css
--radius-sm:   4px    /* chips */
--radius-md:   6px    /* buttons, inputs */
--radius-lg:   8px    /* small cards, filter bars */
--radius-xl:   12px   /* main cards, containers */
--radius-2xl:  16px   /* large containers */
--radius-full: 9999px /* pills, avatars */
```

### Shadows (Stripe-tier, muy sutiles)

```css
--shadow-xs:    0 1px 2px rgba(26,10,59,0.04)
--shadow-sm:    0 2px 4px rgba(26,10,59,0.06)
--shadow-md:    0 4px 8px rgba(26,10,59,0.08)
--shadow-lg:    0 12px 24px rgba(26,10,59,0.12)
--shadow-focus: 0 0 0 3px rgba(108,59,255,0.15)   /* focus ring */
```

### Motion

```css
--motion-fast:    150ms    /* micro-interactions */
--motion-default: 200ms    /* state changes */
--motion-slow:    300ms    /* accordions, drawers */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1)
--ease-spring:  cubic-bezier(0.16, 1, 0.3, 1)
```

**Regla obligatoria:** todos los componentes con transiciones incluyen `motion-reduce:transition-none` (respeta `prefers-reduced-motion`).

## Catálogo de componentes

### Primitives (9 componentes)

#### `Button`
Botón base para acciones. Variantes cubren la mayoría de casos de portal.

**Props:** `variant`, `size`, `iconLeft?`, `iconRight?`, `loading?`, `disabled?`, `asChild?` (Radix Slot pattern), `type` (button/submit).

**Variantes:**
- `primary`: bg `--accent-default`, text `--text-inverse`. Hover `--accent-hover`. Uso: CTA primaria.
- `secondary`: bg `--accent-subtle`, text `--accent-default`. Hover bg más denso. Uso: acciones secundarias importantes.
- `ghost`: transparent bg, text `--text-primary`, border transparent. Hover bg `--surface-sunken`. Uso: acciones terciarias, botones en toolbars.
- `danger`: bg `--danger`, text white. Uso: destructive actions con confirmación.

**Sizes:** `sm` (32px h), `md` (36px h, default), `lg` (44px h — touch-friendly).

Focus: siempre `--shadow-focus`. Loading: spinner + disable input.

#### `Badge`
Pill de status/categoría (no interactivo).

**Props:** `variant`, `size`, `dot?` (bool).

**Variantes:** neutral, info, success, warning, danger. Cada una usa `--<semantic>-subtle` como bg y `--<semantic>` como text.

**Sizes:** `sm` (18px h, `fs-xs`), `md` (22px h, `fs-sm`).

`dot=true` agrega un círculo de 6px al lado izquierdo del text.

#### `Chip`
Tag/filter interactivo, opcionalmente removible o toggleable.

**Props:** `label`, `removable?`, `selected?`, `onSelect?`, `onRemove?`.

Bg `--surface-sunken` idle, `--accent-subtle` + text `--text-accent` cuando `selected`. Removable agrega X icon.

#### `Input`
Text input con label/helper/error states.

**Props:** `label?`, `helper?`, `error?`, `iconLeft?`, `iconRight?`, `size` (md/lg), `type`, `placeholder`, todos los props HTML nativos.

Border `--border-default`, bg `--surface-elevated`. Focus: `--shadow-focus` + border `--accent-default`. Error: border `--danger` + text de error debajo con `--danger`.

#### `Textarea`
Multi-line. Mismos states que `Input`, agrega `rows` prop.

#### `Label`
`<label>` semántico. Props: `htmlFor`, `required?`. `fs-sm font-medium text-secondary`. Required agrega asterisco `--danger`.

#### `Avatar`
Circular avatar con fallback a inicial.

**Props:** `src?`, `initial` (fallback), `alt`, `size` (xs/sm/md/lg = 20/28/36/44px), `status?` (online/away/offline — dot en esquina inferior derecha con color semantic).

Rounded-full, `bg-surface-sunken` cuando no hay `src`, initial centered.

#### `Divider`
Separador visual.

**Props:** `orientation` (horizontal/vertical), `spacing?` (mt/mb tokens).

`border-t border-[var(--border-subtle)]` horizontal, análogo vertical.

#### `Icon`
Wrapper de Lucide icons con size tokens consistentes.

**Props:** `name` (Lucide icon name), `size` (14/16/18/20/24), `strokeWidth?` (default 1.75), `color?`.

Uso: `<Icon name="Home" size={18} />` — evita imports individuales de Lucide en cada componente.

### Patterns (11 componentes)

#### `Card`
Container base para todo lo demás.

**Props:** `padding?` (default `p-6`), `elevated?` (default true — usa `shadow-xs`), `border?` (default false — cards no llevan border si tienen shadow), `className`.

**Slots:** `Card.Header`, `Card.Body`, `Card.Footer` (opcionales — todos son sub-componentes).

Base: `bg-[var(--surface-elevated)] rounded-xl`. Padding customizable per prop.

#### `KpiCard`
Card con top-line color + ícono + número grande + label + sub-label opcional.

**Extrae de:** `src/app/portal/[token]/page.tsx:1210` (componente inline actual).

**Props:** `label`, `value`, `subLabel?`, `icon` (Lucide name), `accentColor?` (default `--accent-default` — se usa en top-line y icon bg tint), `trend?` (up/down/flat con porcentaje).

**Layout:**
```
┌─────────────────────┐
│ ▔▔▔▔ (2px accent)   │  ← top-line
│ ┌──┐  75            │  ← icon + valor grande fs-3xl font-heading
│ │📞│  Conversaciones│  ← label fs-sm text-tertiary
│ └──┘  prom. 2 min   │  ← sub-label fs-xs text-tertiary
└─────────────────────┘
```

`h-full` para stretch en grid.

#### `StatChip`
Chip pequeño con icon + label + valor. Para KPIs secundarios en toolbars/headers.

**Props:** `icon`, `label`, `value`, `color?`.

Layout horizontal: `[icon 14px] [label fs-sm] [value fs-sm font-semibold tabular-nums]`. Bg `--surface-sunken`, `rounded-md`, `px-3 py-1.5`.

#### `SectionHeader`
Encabezado de sección con eyebrow + title + description + slot derecho.

**Extrae de:** 40+ lugares inline en el portal.

**Props:** `eyebrow?` (uppercase small text), `title`, `description?`, `right?` (React.ReactNode — para acciones/filtros al lado derecho), `as?` (default `h2`).

Layout: eyebrow arriba en `fs-xs uppercase tracking-wide text-tertiary`, title en `fs-2xl font-heading text-primary`, description en `fs-base text-secondary`. Right slot alineado con title en flex row.

#### `FilterBar`
Grupo horizontal de `Chip` en container pill.

**Props:** `options` (array de `{value, label}`), `value` (string o string[]), `onChange`, `multi?` (bool), `size?`.

Container `bg-surface-sunken rounded-xl p-1`. Cada chip cuando activo: `bg-surface-elevated shadow-sm text-accent`.

#### `Toolbar`
Barra horizontal sticky con title/eyebrow a la izquierda + slot central (FilterBar típico) + actions a la derecha.

**Props:** `sticky?` (default false), `left`, `center?`, `right?`.

Layout: `flex items-center justify-between gap-4 py-3 border-b border-[var(--border-subtle)]`.

#### `DataTable`
Tabla con header/body/pagination, sortable, empty state built-in.

**Props:** `columns` (array de `{key, header, render?, sortable?, align?}`), `rows` (array de data), `sortBy?`, `onSort?`, `emptyState?` (props para EmptyState), `pagination?` ({page, pageSize, total, onPageChange}), `rowKey` (function o key).

Header sticky top-0 cuando dentro de container scrolleable. Rows hover `bg-surface-sunken`. Sortable columns con Chevron indicator. Empty state built-in cuando rows vacío. Fill-width por default.

#### `EmptyState`
Rediseño del componente existente en `src/components/ui/empty-state.tsx`.

**Props:** `icon` (Lucide name), `title`, `description?`, `action?` (props para Button), `size?` (sm/md/lg).

Layout centered: icon en circle `bg-accent-subtle` 64px, title `fs-lg font-semibold`, description `fs-sm text-secondary`, action `Button primary`. Overwrite del componente actual — mismo path, misma API.

#### `RankRow`
Row para listas rankeadas.

**Extrae de:** `src/app/portal/[token]/AgentRankingSection.tsx:46`.

**Props:** `rank?` (opcional — muestra #1, #2 con badge), `indicator` ({color, label?}), `avatar` (props para Avatar), `title`, `subtitle?`, `metrics` (array de `{label, value}`), `action?`.

Layout: `[rank badge] [dot indicator] [avatar] [title/subtitle] [metrics chips] [action]`, todo en `flex items-center gap-3` con `hover:bg-surface-sunken`.

#### `ActivityEventCard`
Card para eventos tipo feed.

**Extrae de:** `src/app/portal/[token]/oficina/ActividadFeed.tsx:55`.

**Props:** `type` (uno de 11: llamada, lead, cita, pedido, ticket, incidente, reporte, encuesta, delegación, correo, otro), `title`, `description?`, `timestamp` (ISO string, se renderiza como "hace 5 min"), `agent?` ({name, avatar}), `href?` (si presente, la card es clickeable).

Layout: `[icon box coloreado por type] [Badge del type] [title + description] [timestamp muted]`. Icon color y bg subtle mapeados por type en `tokens.ts` (`EVENT_TYPE_COLORS`).

#### `ProgressBar`
Barra de progreso con color por porcentaje.

**Props:** `value` (0-100), `size?` (xs=4px, sm=6px, md=8px), `color?` (override — default usa `uColor()` helper existente que va verde → amarillo → rojo según %), `label?` (para accesibilidad).

Container `rounded-full bg-neutral-200`, fill `rounded-full` con `transition: width 400ms` + `motion-reduce`. `role="progressbar"` con `aria-valuenow/min/max`.

### Overlays (6 componentes)

#### `Dialog`
Modal centered con backdrop.

**Base:** `@radix-ui/react-dialog` (agregar si no está instalado).

**Props:** `open`, `onOpenChange`, `size` (sm=400px/md=600px/lg=800px), `title`, `description?`, `children`, `footer?`.

Backdrop `bg-black/40 backdrop-blur-sm`. Content `bg-surface-elevated rounded-2xl shadow-lg` centered. Close X en top-right. `motion-reduce` respeted.

#### `Toast`
Notificación bottom-right.

**Base:** `sonner` (npm install si no está) — es la mejor opción para React 19.

**Variantes:** success, info, warning, danger. Icons de Lucide. Auto-dismiss 4s por default.

API: `toast.success('Mensaje')`, `toast.error('Mensaje')`. Provider en `PortalShell` mount level.

#### `Dropdown`
Menú contextual.

**Base:** `@radix-ui/react-dropdown-menu`.

Sub-componentes: `Dropdown.Trigger`, `Dropdown.Content`, `Dropdown.Item`, `Dropdown.Label`, `Dropdown.Separator`.

Content: `bg-surface-elevated rounded-lg shadow-md border-[var(--border-subtle)]`. Items hover `bg-surface-sunken`.

#### `Popover`
Ya existe en `src/components/ui/popover.tsx` (Radix wrapper). Fase 2: si el styling actual no matches los tokens nuevos, actualizarlo in-place. Mismo API.

#### `Tabs`
2 variantes: `pill` y `underline`.

**Base:** `@radix-ui/react-tabs`.

Sub-componentes: `Tabs`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Content`.

**Variant `pill`:** List container `bg-surface-sunken rounded-lg p-1`, triggers active `bg-surface-elevated shadow-sm text-accent`.

**Variant `underline`:** List `border-b border-[var(--border-subtle)]`, triggers active `text-accent border-b-2 border-accent -mb-px`.

#### `Sheet`
Drawer lateral, principalmente para mobile.

**Base:** `@radix-ui/react-dialog` con transición slide.

**Props:** `side` (right/left/bottom, default right), `open`, `onOpenChange`, `size?`.

Bg `--surface-elevated`, shadow `--shadow-lg`, slide con `motion-reduce` respected.

## `tokens.ts`

Constantes JS/TS para lo que no cabe en CSS vars.

```ts
export const EVENT_TYPE_COLORS: Record<EventType, { color: string; bg: string }> = {
  llamada:    { color: 'var(--accent-default)',  bg: 'var(--accent-subtle)' },
  lead:       { color: 'var(--success)',         bg: 'var(--success-subtle)' },
  cita:       { color: 'var(--info)',            bg: 'var(--info-subtle)' },
  pedido:     { color: 'var(--warning)',         bg: 'var(--warning-subtle)' },
  ticket:     { color: 'var(--danger)',          bg: 'var(--danger-subtle)' },
  incidente:  { color: 'var(--danger)',          bg: 'var(--danger-subtle)' },
  reporte:    { color: 'var(--info)',            bg: 'var(--info-subtle)' },
  encuesta:   { color: 'var(--accent-default)',  bg: 'var(--accent-subtle)' },
  delegacion: { color: 'var(--accent-emphasized)', bg: 'var(--accent-subtle)' },
  correo:     { color: 'var(--text-secondary)',  bg: 'var(--surface-sunken)' },
  otro:       { color: 'var(--text-tertiary)',   bg: 'var(--surface-sunken)' },
};

export const AVATAR_SIZES = { xs: 20, sm: 28, md: 36, lg: 44 } as const;
export const ICON_SIZES  = { xs: 14, sm: 16, md: 18, lg: 20, xl: 24 } as const;
```

## Testing strategy

- **Unit tests (vitest):** solo para lógica compleja — formatters, `uColor()` helper, sort logic de DataTable. Cero snapshot tests.
- **Visual QA:** Chrome DevTools MCP toma screenshots antes/después por página migrada en Fase 3.
- **NO Storybook.** Overkill para este scope; la migración de páginas hace la validación real.

## Constraints técnicos

- **Preserva Fase 1:** ningún componente V2 shell (PortalHeader, PortalSidebarV2, PortalShell) se modifica en esta fase salvo por eliminar `<ThemeToggle />` del header (dark theme se elimina).
- **Next.js 16 App Router, React 19, Tailwind v4 (@tailwindcss/postcss).**
- **Preserva dev bypass, IDOR, dropped columns** — reglas del proyecto.
- **No emojis, no em-dash (—), no "IA" visible en copy.** Acentos ES correctos.
- **Sin extensión de `tailwind.config`:** tokens viven en `globals.css` como CSS vars. Componentes usan `bg-[var(--surface-elevated)]` etc.
- **Fill-width rule:** ningún `max-w-*` en containers de página. Ningún hueco a la derecha.

## Métricas de éxito

- 26 componentes documentados en `src/components/portal-ui/` con TS types + JSDoc
- Migración limpia: 0 imports de componentes inline duplicados en páginas migradas
- Tokens 100% en CSS vars (search en components por hex hardcoded fuera de `globals.css` = 0)
- Todas las transiciones respetan `prefers-reduced-motion`
- Contraste AA verificado en todos los pares text/bg definidos

## Fases sugeridas de implementación

Este spec cubre Fase 2 (design system). No es un solo plan — se descompone en 2 mini-planes secuenciales:

**Fase 2A — Tokens + Layout helpers (1 plan):**
- Refactor de `globals.css` (nuevos tokens, elimina dark)
- `PageContainer`, `PageSection`, `GridStretch`
- Eliminar `ThemeToggle` del PortalShell
- Verificar que Fase 1 sigue verde con nuevos tokens

**Fase 2B — Componentes (1 plan grande o varios pequeños):**
- Primitives (9)
- Patterns (11) — con extract & unify desde locations actuales
- Overlays (6)
- `tokens.ts` con maps

Fase 3 = migración de páginas al design system, un plan chico por página.

## Anexo — extractions concretas para Fase 2B

Referencias exactas de dónde extraer cada componente:

| Componente | Ubicación actual inline | Notas de extract |
|---|---|---|
| KpiCard | `src/app/portal/[token]/page.tsx:1210` | Extraer y borrar del page.tsx. Preservar prop API actual (color, icon, label, value, sub). |
| RankRow | `src/app/portal/[token]/AgentRankingSection.tsx:46-64` | Reemplazar función interna con import de portal-ui. |
| ActivityEventCard | `src/app/portal/[token]/oficina/ActividadFeed.tsx:55-80` | 10 tipos ya definidos allí; agregar 'otro' fallback. |
| SectionHeader | 40+ lugares inline | Grep por `text-xs font-semibold uppercase tracking-widest` para encontrar candidatos. |
| FilterBar | `src/app/portal/[token]/page.tsx:567-577` | Convertir el patrón de pills a componente. |
| ProgressBar | Sidebar chip (`PortalSidebarV2.tsx`) + varios spots | Componente único, sidebar la consume. |
| EmptyState | `src/components/ui/empty-state.tsx` | Rediseño in-place — mismo path, mismo API (no breakage). |

## Preguntas abiertas

- ¿Instalar `sonner` para toasts o rodar solución custom? *Recomendación: sonner (mantenido, popular, sin bugs conocidos).*
- ¿Migrar EmptyState in-place o crear nuevo path? *Recomendación: in-place — evita duplicación y breakage.*
- ¿`Icon` wrapper vale la pena vs. importar Lucide directo? *Recomendación: sí — centraliza defaults (strokeWidth 1.75, size scale) y facilita audit de icons.*
