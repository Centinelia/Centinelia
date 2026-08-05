# Portal Design System — Fase 2A: Tokens + Layout Helpers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar la base de Fase 2 del design system del portal: agregar tokens semánticos nuevos a `globals.css`, eliminar dark theme, crear tres layout helpers (`PageContainer`, `PageSection`, `GridStretch`), y neutralizar ThemeToggle en la shell V2. Sin tocar componentes (patterns/primitives — eso es Fase 2B).

**Architecture:** Todo el trabajo es aditivo (tokens nuevos + helpers nuevos) o sustractivo (dark CSS + toggle UI). Los tokens viejos `--c-*` se conservan como aliases mientras Fase 3+ migra páginas. Los helpers viven en `src/components/portal-ui/patterns/layout/` — primer poblado de la nueva biblioteca.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`@tailwindcss/postcss`), CSS custom properties. Sin extensión de `tailwind.config`. Sin librerías nuevas.

## Global Constraints

- Fill-width rule: prohibido `max-w-*` en containers de página del portal — ninguna página deja huecos a la derecha
- Todos los componentes con transiciones: `motion-reduce:transition-none` obligatorio
- No emojis, no em-dash (—), no "IA" visible en copy
- Acentos ES correctos en strings (`Navegación`, `Sección`, etc.)
- Next.js 16 App Router — si aparecen APIs desconocidas, leer `node_modules/next/dist/docs/` primero
- Preserve dev bypass en `src/proxy.ts` — este plan no debe tocarlo
- Preserve IDOR pattern — este plan no toca rutas de datos
- Preserve Fase 1 shell (PortalHeader, PortalSidebarV2, PortalShell): SOLO modificar los 5 sitios que pasan `<ThemeToggle />` como headerActions
- Los tokens viejos (`--c-*`) NO se borran en 2A — se conservan como aliases; Fase 3+ los migra al eliminar imports
- Tokens nuevos usan naming semántico: `--surface-*`, `--text-*`, `--accent-*`, `--space-*`, `--fs-*`, `--radius-*`, `--shadow-*`, `--motion-*`

---

## File Structure

**Nuevos archivos:**

| Archivo | Responsabilidad |
|---|---|
| `src/components/portal-ui/patterns/layout/PageContainer.tsx` | Wrapper de content con padding responsive fill-width |
| `src/components/portal-ui/patterns/layout/PageSection.tsx` | Bloque vertical con `space-y-8` + heading opcional slot |
| `src/components/portal-ui/patterns/layout/GridStretch.tsx` | Grid responsive con auto-rows-fr para alturas iguales |
| `src/components/portal-ui/index.ts` | Re-exports públicos de la biblioteca |

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `src/app/globals.css` | Agregar tokens nuevos bajo `:root`; eliminar bloque dark; mover valores light a `:root` |
| `src/components/ThemeToggle.tsx` | Retornar `null` (deprecated no-op — mantiene todos los imports funcionando) |
| `src/app/portal/[token]/page.tsx` | Eliminar `<ThemeToggle />` del `headerActions` del PortalShell V2 |
| `src/app/portal/[token]/llamadas/entrantes/page.tsx` | Eliminar `<ThemeToggle />` del `headerActions` del PortalShell V2 |
| `src/app/portal/[token]/llamadas/salientes/page.tsx` | Eliminar `<ThemeToggle />` del `headerActions` del PortalShell V2 |
| `src/app/portal/[token]/agentes/layout.tsx` | Eliminar `<ThemeToggle />` del `headerActions` del PortalShell V2 |
| `src/app/portal/[token]/usuarios/page.tsx` | Eliminar `<ThemeToggle />` del `headerActions` del PortalShell V2 |

**No se toca en 2A:**
- `src/app/portal/[token]/PortalHeader.tsx`, `PortalSidebarV2.tsx`, `PortalShell.tsx` — shell Fase 1 intacta
- `src/app/portal/[token]/PortalSidebar.tsx` — V1 sidebar sigue viva
- Los 13 otros lugares que usan `ThemeToggle` (V1 headers, admin, setup, configurar) — sus imports siguen funcionando porque el componente retorna `null` silenciosamente. Fase 3+ los remueve al migrar cada página.

---

## Task 1 — Agregar tokens nuevos a `globals.css`

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: nada
- Produces: CSS variables nuevas bajo `:root` — consumibles por Tailwind arbitrary-value syntax (`bg-[var(--surface-elevated)]`) o CSS puro.

- [ ] **Step 1: Leer el archivo actual y encontrar el bloque `:root` inicial**

Abrir `src/app/globals.css`. El primer `:root` (líneas ~3-9) contiene `--accent`, `--accent-alt`, `--font-heading`, `--font-sans`. Ese bloque se conserva.

- [ ] **Step 2: Agregar el bloque de tokens semánticos**

Insertar DESPUÉS del primer `:root { ... --font-sans ... }` (aprox línea 9) y ANTES del segundo `:root` (bloque dark, línea 12), este bloque nuevo:

```css
/* ── Tokens semánticos (Fase 2 design system, light-only) ─────────────── */
:root {
  /* Superficies */
  --surface-canvas:    #FAFAFB;
  --surface-elevated:  #FFFFFF;
  --surface-sunken:    #F5F5F7;
  --surface-inverse:   #1A0A3B;

  /* Bordes */
  --border-subtle:     rgba(26,10,59,0.08);
  --border-default:    rgba(26,10,59,0.12);
  --border-emphasized: rgba(26,10,59,0.20);

  /* Texto */
  --text-primary:   #1A0A3B;
  --text-secondary: #3F3D56;
  --text-tertiary:  #6B7280;
  --text-inverse:   #FAFBFF;
  --text-accent:    #6C3BFF;

  /* Accent (brand) */
  --accent-default:    #6C3BFF;
  --accent-hover:      #5A2FDB;
  --accent-emphasized: #4A25B8;
  --accent-subtle:     #F3EFFF;

  /* Semánticos (chips/badges/progress) */
  --success:         #22C55E;
  --success-subtle:  #DCFCE7;
  --warning:         #F59E0B;
  --warning-subtle:  #FEF3C7;
  --danger:          #EF4444;
  --danger-subtle:   #FEE2E2;
  --info:            #3B82F6;
  --info-subtle:     #DBEAFE;

  /* Spacing (múltiplos de 4, escala 8-point) */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;

  /* Typography */
  --fs-xs:   11px;
  --fs-sm:   13px;
  --fs-base: 14px;
  --fs-lg:   16px;
  --fs-xl:   20px;
  --fs-2xl:  24px;
  --fs-3xl:  32px;
  --fs-4xl:  40px;

  --font-body: var(--font-dm-sans);
  /* --font-heading ya existe en el :root anterior; se reutiliza */

  --tracking-wide: 0.14em;

  --lh-tight:  1.2;
  --lh-normal: 1.5;
  --lh-loose:  1.7;

  /* Radius */
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-xl:   12px;
  --radius-2xl:  16px;
  --radius-full: 9999px;

  /* Shadows (Stripe-tier, sutiles) */
  --shadow-xs:    0 1px 2px  rgba(26,10,59,0.04);
  --shadow-sm:    0 2px 4px  rgba(26,10,59,0.06);
  --shadow-md:    0 4px 8px  rgba(26,10,59,0.08);
  --shadow-lg:    0 12px 24px rgba(26,10,59,0.12);
  --shadow-focus: 0 0 0 3px  rgba(108,59,255,0.15);

  /* Motion */
  --motion-fast:    150ms;
  --motion-default: 200ms;
  --motion-slow:    300ms;
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring:  cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] **Step 3: Verificar que el archivo compila**

Correr:
```bash
npm run dev
```

Esperado: dev server arranca sin errores. Si aparece un error de CSS syntax, revisar comas colgantes o duplicados.

Detener dev server (Ctrl+C).

- [ ] **Step 4: Verificar que Fase 1 shell sigue rendereando (safety check)**

Iniciar dev server otra vez, abrir `http://localhost:3000/portal/8892c013-b122-4f11-a9d4-e88a04aff732` en navegador (o Chrome DevTools MCP). Confirmar que el sidebar V2 sigue igual visualmente que antes.

Los tokens nuevos son ADITIVOS — no cambian nada renderizado hasta que un componente los consuma.

Detener dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(portal): add semantic design tokens to globals.css (Fase 2A)

Agrega tokens semánticos nuevos bajo :root (--surface-*, --text-*,
--accent-*, --space-*, --fs-*, --radius-*, --shadow-*, --motion-*)
sin modificar los --c-* existentes. Aditivo: no cambia rendering
hasta que componentes los consuman (Fase 2B+)."
```

---

## Task 2 — Eliminar dark theme de `globals.css`

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: los tokens `--c-*` viejos siguen existiendo (bajo `:root` tras esta task), pero ahora con valores light por default.
- Produces: nada nuevo — solo remoción.

- [ ] **Step 1: Localizar el bloque dark (`:root` de línea 12)**

En `src/app/globals.css` está actualmente:

```css
/* ── Dark theme (default) ───────────────────────────────────────────────── */
:root {
  --c-bg:           #120726;
  --c-surface:      rgba(255,255,255,0.035);
  ...
  --c-modal:        #1D0B3E;
}
```

- [ ] **Step 2: Localizar el bloque light (`[data-theme="light"]` de línea 33)**

```css
/* ── Light theme ────────────────────────────────────────────────────────── */
[data-theme="light"] {
  --c-bg:           #F2EEFF;
  --c-surface:      #ffffff;
  ...
  --c-modal:        #ffffff;
}
```

- [ ] **Step 3: Reemplazar los dos bloques por uno solo (light values bajo `:root`)**

Eliminar los dos bloques completos (dark + light) y sustituirlos por:

```css
/* ── Tokens legacy (--c-*) — light only, se conservan por compatibilidad ── */
/* Serán migrados a tokens semánticos en Fase 3+ conforme cada página se migra */
:root {
  --c-bg:           #F2EEFF;
  --c-surface:      #ffffff;
  --c-surface-2:    rgba(108,59,255,0.045);
  --c-border:       rgba(108,59,255,0.13);
  --c-border-2:     rgba(108,59,255,0.22);
  --c-text:         #1A0A3B;
  --c-text-2:       rgba(26,10,59,0.72);
  --c-text-3:       rgba(26,10,59,0.60);
  --c-text-4:       rgba(26,10,59,0.44);
  --c-input-bg:     rgba(108,59,255,0.05);
  --c-input-border: rgba(108,59,255,0.18);
  --c-divider:      rgba(108,59,255,0.08);
  --c-hover:        rgba(108,59,255,0.04);
  --c-code-bg:      rgba(108,59,255,0.06);
  --c-modal:        #ffffff;
}
```

- [ ] **Step 4: Buscar y eliminar cualquier otra referencia a dark**

Buscar en `globals.css`:
```
[data-theme
```

Si aparece en otras selectores (ej. media queries `@media (prefers-color-scheme: dark)`), eliminarlos también. Todo dark queda fuera.

- [ ] **Step 5: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: ambos pasan sin errores nuevos.

- [ ] **Step 6: Verificar visual en dev**

```bash
npm run dev
```

Abrir portal y navegar por 2-3 páginas (`/`, `/agentes`, `/usuarios`). Confirmar que:
- Todas se ven en light theme (no importa si el usuario tenía `data-theme='dark'` guardado en localStorage — ahora dark no existe)
- No hay texto blanco sobre fondo blanco (indicaría que un componente tenía estilos dark-only sin fallback)

Si aparece algún componente ilegible, anotar cual y crear un fix rápido (probablemente hardcoded `color: white` que ya no funciona sobre bg light). Anotar en el commit message si aparece.

Detener dev server.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css
git commit -m "refactor(portal): eliminate dark theme, keep --c-* as light-only aliases (Fase 2A)

- Removed dark :root block + [data-theme='light'] selector
- Moved light values into :root as sole defaults
- Legacy --c-* vars conserved (still used by V1 across ~13 files);
  Fase 3+ will migrate them to --surface-*/--text-* per-page
- data-theme='dark' set in localStorage now has no visual effect"
```

---

## Task 3 — Neutralizar `ThemeToggle` + limpiar V2 headers

**Files:**
- Modify: `src/components/ThemeToggle.tsx`
- Modify: `src/app/portal/[token]/page.tsx`
- Modify: `src/app/portal/[token]/llamadas/entrantes/page.tsx`
- Modify: `src/app/portal/[token]/llamadas/salientes/page.tsx`
- Modify: `src/app/portal/[token]/agentes/layout.tsx`
- Modify: `src/app/portal/[token]/usuarios/page.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<ThemeToggle />` renderiza `null` en todas partes (no rompe imports); ausente del `headerActions` de V2

- [ ] **Step 1: Leer `src/components/ThemeToggle.tsx` completo**

Verificar la estructura actual (probablemente un botón que toggle `data-theme` en `<html>` y guarda en localStorage).

- [ ] **Step 2: Reemplazar el body del componente por `return null`**

Sustituir la implementación completa por:

```tsx
'use client';

// @deprecated — Portal Fase 2A eliminó dark theme. Este componente ahora
// es un no-op (retorna null) para no romper los ~13 imports existentes
// en V1 headers, admin, setup, configurar, requests. Fase 3+ los remueve
// al migrar cada página al design system.

interface ThemeToggleProps {
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ThemeToggle(_props: ThemeToggleProps = {}) {
  return null;
}
```

Preservar el default export para no romper imports; aceptar `className` (y cualquier otro prop actual — verificar en Step 1) para que las llamadas existentes con `className="..."` no fallen en TypeScript.

Si el componente tenía otros props (ej. `size`), agregarlos a `ThemeToggleProps` como opcionales para preservar TS compat.

- [ ] **Step 3: Eliminar `<ThemeToggle />` del headerActions V2 en las 5 páginas**

Para cada uno de estos archivos, buscar el bloque `headerActions=` dentro del `<PortalShell>` (el que se renderiza cuando `v2Enabled` es true) y ELIMINAR la línea que dice `<ThemeToggle className="..." />`.

Archivos:
1. `src/app/portal/[token]/page.tsx`
2. `src/app/portal/[token]/llamadas/entrantes/page.tsx`
3. `src/app/portal/[token]/llamadas/salientes/page.tsx`
4. `src/app/portal/[token]/agentes/layout.tsx`
5. `src/app/portal/[token]/usuarios/page.tsx`

Ejemplo del cambio en cada archivo (buscar el patrón exacto):

BUSCAR:
```tsx
            headerActions={
              <>
                <NotificationBell token={token} />
                <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
                <PortalLogout />
              </>
            }
```

REEMPLAZAR CON:
```tsx
            headerActions={
              <>
                <NotificationBell token={token} />
                <PortalLogout />
              </>
            }
```

Nota: en `page.tsx` y `usuarios/page.tsx` también aparece `<AccountSerialBadge ... />` — conservarlo.

**IMPORTANTE:** solo eliminar del bloque `headerActions` (dentro del rendering V2). NO tocar el V1 header (donde también aparece `<ThemeToggle />` cerca de `<BusinessSwitcher>` y `<PortalLogout>`). El V1 header conserva el componente aunque ahora renderice null — Fase 3+ lo remueve al migrar V1.

- [ ] **Step 4: Buscar el import de `ThemeToggle` en cada archivo**

Si después de eliminar la línea del headerActions, el archivo YA NO USA `ThemeToggle` en ningún otro sitio, remover el import también. Grep en cada archivo:

```
grep -n "ThemeToggle" <archivo>
```

Si queda alguna referencia (el V1 header también lo usa en algunos archivos), preservar el import.

- [ ] **Step 5: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: ambos pasan.

- [ ] **Step 6: Verificar visual — V2 con flag ON**

```bash
npm run dev
```

Con `portal_v2_enabled = true` en la org de prueba, abrir portal. Verificar que:
- El header dark V2 muestra logo/negocio + campana + botón salir (sin el toggle de theme)
- Todo lo demás intacto
- No hay error en console

Detener dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/ThemeToggle.tsx src/app/portal/[token]/page.tsx src/app/portal/[token]/llamadas/entrantes/page.tsx src/app/portal/[token]/llamadas/salientes/page.tsx src/app/portal/[token]/agentes/layout.tsx src/app/portal/[token]/usuarios/page.tsx
git commit -m "refactor(portal): neutralize ThemeToggle + remove from V2 headers (Fase 2A)

- ThemeToggle now returns null (deprecated no-op) — preserves ~13
  existing imports across V1/admin/setup/configurar/requests
- Removed <ThemeToggle /> from headerActions of 5 V2 pages
- V1 headers keep the import (renders null); Fase 3+ removes as
  each V1 page migrates to the design system"
```

---

## Task 4 — Layout helpers: `PageContainer`, `PageSection`, `GridStretch`, `index`

**Files:**
- Create: `src/components/portal-ui/patterns/layout/PageContainer.tsx`
- Create: `src/components/portal-ui/patterns/layout/PageSection.tsx`
- Create: `src/components/portal-ui/patterns/layout/GridStretch.tsx`
- Create: `src/components/portal-ui/index.ts`

**Interfaces:**
- Consumes: React (para tipos + JSX), nada más
- Produces:
  ```ts
  // PageContainer
  interface PageContainerProps { children: React.ReactNode; className?: string; }
  export default function PageContainer(props): JSX.Element

  // PageSection
  interface PageSectionProps { children: React.ReactNode; heading?: React.ReactNode; className?: string; }
  export default function PageSection(props): JSX.Element

  // GridStretch
  interface GridStretchProps {
    children: React.ReactNode;
    cols?: { base?: 1 | 2 | 3 | 4; md?: 1 | 2 | 3 | 4; xl?: 1 | 2 | 3 | 4 };
    gap?: 2 | 3 | 4 | 6 | 8;  // maps to gap-2/3/4/6/8 tokens (space-2..space-8)
    className?: string;
  }
  export default function GridStretch(props): JSX.Element

  // index re-exports:
  export { default as PageContainer } from './patterns/layout/PageContainer';
  export { default as PageSection }   from './patterns/layout/PageSection';
  export { default as GridStretch }   from './patterns/layout/GridStretch';
  ```

- [ ] **Step 1: Crear `PageContainer.tsx`**

Crear el archivo con:

```tsx
/**
 * PageContainer — wrapper directo del content de una página del portal.
 * Aplica padding lateral responsive fill-width (nunca max-w-*).
 *
 * Uso típico:
 *   <PageContainer>
 *     <PageSection ...>...</PageSection>
 *     <PageSection ...>...</PageSection>
 *   </PageContainer>
 */

import type { ReactNode } from 'react';

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`w-full px-4 py-6 md:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
```

Notas:
- `w-full` explícito para asegurar fill-width
- Sin `max-w-*` — regla de spec
- Padding responsive: 16px base, 24px md, 32px lg
- Vertical padding fijo `py-6` (24px)

- [ ] **Step 2: Crear `PageSection.tsx`**

```tsx
/**
 * PageSection — bloque vertical dentro de una página del portal.
 * Provee spacing vertical entre hijos (space-y-8) y un slot opcional
 * para el heading de la sección.
 *
 * El heading se renderea antes de los children con margin-bottom.
 * Cuando se migre SectionHeader (Fase 2B), reemplazará el ReactNode aquí.
 *
 * Uso:
 *   <PageSection heading={<h2 className="text-xl font-semibold">Título</h2>}>
 *     <Card>...</Card>
 *     <Card>...</Card>
 *   </PageSection>
 */

import type { ReactNode } from 'react';

export interface PageSectionProps {
  children: ReactNode;
  heading?: ReactNode;
  className?: string;
}

export default function PageSection({ children, heading, className = '' }: PageSectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      {heading}
      <div className="space-y-8">
        {children}
      </div>
    </section>
  );
}
```

Notas:
- `space-y-4` entre heading y content
- `space-y-8` entre children (32px = `--space-8`)
- Usa `<section>` semántico

- [ ] **Step 3: Crear `GridStretch.tsx`**

```tsx
/**
 * GridStretch — grid responsive con alturas iguales (auto-rows-fr).
 * Configuración de columnas por breakpoint y gap desde escala tokens.
 *
 * Uso:
 *   <GridStretch cols={{ base: 1, md: 2, xl: 4 }} gap={4}>
 *     <KpiCard ... />
 *     <KpiCard ... />
 *   </GridStretch>
 */

import type { ReactNode } from 'react';

type ColCount = 1 | 2 | 3 | 4;
type GapSize = 2 | 3 | 4 | 6 | 8;

export interface GridStretchProps {
  children: ReactNode;
  cols?: { base?: ColCount; md?: ColCount; xl?: ColCount };
  gap?: GapSize;
  className?: string;
}

const BASE_COLS: Record<ColCount, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const MD_COLS: Record<ColCount, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

const XL_COLS: Record<ColCount, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
};

const GAP: Record<GapSize, string> = {
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

export default function GridStretch({
  children,
  cols = { base: 1, md: 2, xl: 3 },
  gap = 4,
  className = '',
}: GridStretchProps) {
  const baseClass = BASE_COLS[cols.base ?? 1];
  const mdClass = cols.md ? MD_COLS[cols.md] : '';
  const xlClass = cols.xl ? XL_COLS[cols.xl] : '';
  const gapClass = GAP[gap];

  return (
    <div className={`grid auto-rows-fr ${baseClass} ${mdClass} ${xlClass} ${gapClass} ${className}`}>
      {children}
    </div>
  );
}
```

Notas:
- `auto-rows-fr` = todas las rows del grid tienen el mismo alto
- Tailwind necesita las clases completas literalmente en el source para el JIT — de ahí los mapas explícitos (no `grid-cols-${n}` dinámico)
- Cols default: 1/2/3 (base/md/xl) para grids típicos de KPIs

- [ ] **Step 4: Crear `src/components/portal-ui/index.ts`**

```ts
/**
 * Portal Design System — public entrypoint.
 *
 * Consumidores importan desde aquí:
 *   import { PageContainer, PageSection, GridStretch } from '@/components/portal-ui';
 */

export { default as PageContainer } from './patterns/layout/PageContainer';
export { default as PageSection }   from './patterns/layout/PageSection';
export { default as GridStretch }   from './patterns/layout/GridStretch';

export type { PageContainerProps } from './patterns/layout/PageContainer';
export type { PageSectionProps }   from './patterns/layout/PageSection';
export type { GridStretchProps }   from './patterns/layout/GridStretch';
```

- [ ] **Step 5: Typecheck + lint**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sin errores.

- [ ] **Step 6: Smoke test — importar en un archivo temporal**

Crear temporalmente `src/app/_test-layout.tsx` con:

```tsx
import { PageContainer, PageSection, GridStretch } from '@/components/portal-ui';

export function TestUsage() {
  return (
    <PageContainer>
      <PageSection heading={<h2>Test</h2>}>
        <GridStretch cols={{ base: 1, md: 2 }} gap={4}>
          <div>a</div>
          <div>b</div>
        </GridStretch>
      </PageSection>
    </PageContainer>
  );
}
```

Correr `npx tsc --noEmit`. Debe pasar sin errores de tipo. Después BORRAR el archivo:

```bash
rm src/app/_test-layout.tsx
```

- [ ] **Step 7: Commit**

```bash
git add src/components/portal-ui/
git commit -m "feat(portal-ui): PageContainer, PageSection, GridStretch layout helpers (Fase 2A)

Primeros helpers del design system, en src/components/portal-ui/.
Enforce las layout rules del spec:
- Fill-width (nunca max-w-*)
- Padding responsive (px-4 md:px-6 lg:px-8)
- Vertical spacing consistente (space-y-8)
- Grid con auto-rows-fr para alturas iguales

Los componentes están listos para Fase 3+ (migración de páginas)
pero no se aplican todavía a ninguna página existente."
```

---

## Task 5 — Visual regression + smoke test

**Files:** ninguno modificado — validación manual con Chrome DevTools MCP.

**Interfaces:** ninguna.

- [ ] **Step 1: Arrancar dev server**

```bash
npm run dev
```

Esperar hasta que aparezca `Ready in ...`.

- [ ] **Step 2: Verificar V1 (flag OFF) en un browser tab**

Abrir `http://localhost:3000/portal/8892c013-b122-4f11-a9d4-e88a04aff732` con `portal_v2_enabled = false` en la org.

Checklist V1:
- [ ] Sidebar V1 (con secciones ACTIVIDAD/CONOCIMIENTO/etc.) renderea igual que antes
- [ ] Header V1 con BusinessSwitcher/AccountSerialBadge/NotificationBell/**ThemeToggle NO visible** (retorna null)/PortalLogout
- [ ] Colores del portal se ven en light (era el default, pero ahora es la única opción — no debe haber cambio visible)
- [ ] Consola sin errores nuevos

- [ ] **Step 3: Cambiar flag a ON via SQL**

```sql
UPDATE organizations SET portal_v2_enabled = true WHERE portal_email = '<tu-email-de-prueba>';
```

Refrescar página.

- [ ] **Step 4: Verificar V2 (flag ON)**

Checklist V2:
- [ ] Header dark V2 muestra logo/negocio a la izquierda + AccountSerialBadge/NotificationBell/PortalLogout a la derecha (**sin ThemeToggle**)
- [ ] Sidebar V2 light Shopify-tier renderea idéntico a antes de Fase 2A
- [ ] Chip "Uso del mes" con Minutos + Tareas + Plan y consumo visible al fondo
- [ ] Todo el contenido de la página se ve igual que antes de Fase 2A (los tokens nuevos existen pero ningún componente los consume aún)
- [ ] Consola sin errores nuevos

- [ ] **Step 5: Revertir flag para dejar dev limpio**

```sql
UPDATE organizations SET portal_v2_enabled = false WHERE portal_email = '<tu-email-de-prueba>';
```

- [ ] **Step 6: Corridas finales**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: ambos pasan.

- [ ] **Step 7: Commit si hubo ajustes menores durante QA**

```bash
git status
# si hay ajustes:
git add -p
git commit -m "polish(portal): fase 2A visual QA adjustments"
```

Si no hubo ajustes, este step no genera commit. OK.

---

## Self-review realizado

**Spec coverage:** Fase 2A del spec cubre 4 puntos:
1. Refactor de `globals.css` con nuevos tokens semánticos → Tasks 1 + 2 ✅
2. Layout helpers en `src/components/portal-ui/patterns/layout/` → Task 4 ✅
3. Remover ThemeToggle del PortalShell V2 → Task 3 ✅
4. Verificar Fase 1 shell sigue verde con nuevos tokens → Task 5 ✅

**Ajuste explícito al spec:** el spec dice "PageContainer aplica padding responsive `px-4 md:px-6 lg:px-8 py-6`" — coincidido en Task 4 Step 1. El spec menciona `SectionHeader` como parte de PageSection heading, pero `SectionHeader` es Fase 2B — el plan usa `ReactNode` como slot para no bloquear (Task 4 Step 2 lo documenta).

**Placeholder scan:** sin TBDs, TODOs o "implement later". Las QA checkbox del Task 5 tienen criterios concretos.

**Type consistency:** las interfaces `PageContainerProps`, `PageSectionProps`, `GridStretchProps` se definen en Task 4 y re-exportan desde `index.ts` en el mismo paso. Función `ThemeToggle` retorna `null` en Task 3 — sus consumidores (V1 headers) siguen importándolo sin errores TS gracias al default export preservado.

**Riesgo residual identificado:** al eliminar dark theme (Task 2), cualquier componente inline que hardcodeara `color: white` sobre `--c-bg` (que ahora es light `#F2EEFF`) queda ilegible. Task 2 Step 6 obliga a hacer QA visual y anotar en commit si aparece. Fix rápido va como polish commit en Task 5 Step 7.
