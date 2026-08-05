# Portal Design System — Fase 2B-1: Core Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir los 7 componentes core del design system del portal (`Icon`, `Button`, `Badge`, `Chip`, `Card`, `SectionHeader`, `EmptyState` rediseño in-place) para desbloquear la migración de páginas en Fase 3+. Consumen tokens semánticos ya en `globals.css` desde Fase 2A.

**Architecture:** Componentes atómicos server-safe (sin `'use client'` donde sea posible) en `src/components/portal-ui/primitives/` (Icon, Button, Badge, Chip) y `src/components/portal-ui/patterns/` (Card, SectionHeader, EmptyState). Todos exportan tipos + default. El `index.ts` centraliza re-exports. EmptyState mantiene su path viejo `src/components/ui/empty-state.tsx` como shim para preservar los ~15 imports existentes; la lógica real vive en `portal-ui/patterns/EmptyState.tsx`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4 (`@tailwindcss/postcss`), Lucide React icons, tokens CSS custom properties de `globals.css`.

## Global Constraints

- Consumir tokens semánticos ya en `globals.css`: `--surface-*`, `--text-*`, `--accent-*`, `--space-*`, `--fs-*`, `--radius-*`, `--shadow-*`, `--motion-*`
- CSS vars primero, arbitrary values solo cuando sea inevitable
- Todos los componentes con transiciones: `motion-reduce:transition-none` obligatorio
- Focus visible obligatorio en interactivos: `focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]` o equivalente
- No emojis, no em-dash (—), no "IA" visible en copy
- Acentos ES correctos en cualquier string visible
- Server-safe (`'use client'` solo si el componente usa hooks o event handlers interactivos que requieran client)
- Fill-width rule aplica en containers de página, no aplica a estas primitives (Button no lleva `w-full` por default)
- Preservar los ~15 imports existentes de `EmptyState` en `src/components/ui/empty-state.tsx` — mantener su default export + named export + prop shape
- No modificar páginas del portal en esta fase (esos son migraciones de Fase 3+)

---

## File Structure

**Nuevos archivos:**

| Archivo | Responsabilidad |
|---|---|
| `src/components/portal-ui/primitives/Icon.tsx` | Wrapper de Lucide con size tokens consistentes |
| `src/components/portal-ui/primitives/Button.tsx` | Botón con 4 variants + 3 sizes + loading + iconLeft/Right |
| `src/components/portal-ui/primitives/Badge.tsx` | Pill de status no interactivo, 5 variants + 2 sizes + dot opcional |
| `src/components/portal-ui/primitives/Chip.tsx` | Tag/filter interactivo, removable/selected opcional |
| `src/components/portal-ui/patterns/Card.tsx` | Container base + Card.Header / Card.Body / Card.Footer slots |
| `src/components/portal-ui/patterns/SectionHeader.tsx` | Eyebrow + title + description + right slot |
| `src/components/portal-ui/patterns/EmptyState.tsx` | Rediseño con nuevos tokens; export canónico del design system |

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `src/components/portal-ui/index.ts` | Agregar re-exports de los 7 componentes + tipos |
| `src/components/ui/empty-state.tsx` | Convertir en shim: re-export desde `@/components/portal-ui/patterns/EmptyState` (preserva ~15 imports viejos sin duplicar código) |

---

## Task 1 — `Icon` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Icon.tsx`

**Interfaces:**
- Consumes: `lucide-react` (ya en dependencies)
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export type IconSize = 14 | 16 | 18 | 20 | 24;

  export interface IconProps {
    icon: LucideIcon;
    size?: IconSize;
    strokeWidth?: number;
    className?: string;
    'aria-label'?: string;
    'aria-hidden'?: boolean;
  }

  export default function Icon(props: IconProps): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

Crear `src/components/portal-ui/primitives/Icon.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';

/**
 * Icon — wrapper de Lucide con size tokens consistentes y strokeWidth default 1.75.
 *
 * Uso:
 *   <Icon icon={Home} size={18} />
 *   <Icon icon={Home} size={24} aria-label="Inicio" />
 */

export type IconSize = 14 | 16 | 18 | 20 | 24;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
}

export default function Icon({
  icon: Component,
  size = 18,
  strokeWidth = 1.75,
  className,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden = !ariaLabel,
}: IconProps) {
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    />
  );
}
```

Notas:
- Default size 18px (matches sidebar V2 primary nav icon size)
- Default strokeWidth 1.75 (matches PortalSidebarV2 baseline)
- `aria-hidden` es true por default a menos que se pase `aria-label` (accesibilidad)
- Server-safe (sin `'use client'`)

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Icon.tsx
```

Esperado: ambos limpios.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/primitives/Icon.tsx
git commit -m "feat(portal-ui): Icon primitive with size tokens + strokeWidth default (2B-1)"
```

---

## Task 2 — `Button` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Button.tsx`

**Interfaces:**
- Consumes: React (para forwardRef + JSX), `lucide-react` (type LucideIcon), `Icon` primitive de Task 1
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
  export type ButtonSize = 'sm' | 'md' | 'lg';

  export interface ButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    iconLeft?: LucideIcon;
    iconRight?: LucideIcon;
    loading?: boolean;
    children: React.ReactNode;
  }

  export default function Button(props: ButtonProps): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

Crear `src/components/portal-ui/primitives/Button.tsx`:

```tsx
'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Icon from './Icon';

/**
 * Button — botón con 4 variants (primary/secondary/ghost/danger),
 * 3 sizes (sm/md/lg), iconLeft/Right, loading state.
 *
 * Uso:
 *   <Button variant="primary" onClick={...}>Guardar</Button>
 *   <Button variant="ghost" size="sm" iconLeft={Download}>Descargar</Button>
 *   <Button variant="primary" loading disabled>Enviando...</Button>
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-default)] text-[var(--text-inverse)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-emphasized)]',
  secondary:
    'bg-[var(--accent-subtle)] text-[var(--text-accent)] hover:bg-[color-mix(in_srgb,var(--accent-default)_16%,var(--surface-elevated))]',
  ghost:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]',
  danger:
    'bg-[var(--danger)] text-[var(--text-inverse)] hover:bg-[color-mix(in_srgb,var(--danger)_88%,black)]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
};

const ICON_SIZE: Record<ButtonSize, 14 | 16 | 18> = {
  sm: 14,
  md: 16,
  lg: 18,
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const iconSize = ICON_SIZE[size];

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-md font-medium leading-none',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Icon icon={Loader2} size={iconSize} className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        iconLeft && <Icon icon={iconLeft} size={iconSize} aria-hidden />
      )}
      {children}
      {!loading && iconRight && <Icon icon={iconRight} size={iconSize} aria-hidden />}
    </button>
  );
});

export default Button;
```

Notas:
- `'use client'` porque puede aceptar `onClick` (React 19 sigue prefiriendo cliente para handlers en primitives reusables)
- `forwardRef` — permite que consumers pasen refs (útil para Radix + form libs)
- `type='button'` default evita form submissions accidentales
- Loading: reemplaza iconLeft por spinner, disables botón, agrega `aria-busy`
- Iconos usan el `Icon` primitive de Task 1 (dependency intra-package)

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Button.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/primitives/Button.tsx
git commit -m "feat(portal-ui): Button primitive (4 variants, 3 sizes, loading, icons) (2B-1)"
```

---

## Task 3 — `Badge` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Badge.tsx`

**Interfaces:**
- Consumes: nada externo
- Produces:
  ```ts
  export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  export type BadgeSize = 'sm' | 'md';

  export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    size?: BadgeSize;
    dot?: boolean;
    children: React.ReactNode;
  }

  export default function Badge(props: BadgeProps): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

Crear `src/components/portal-ui/primitives/Badge.tsx`:

```tsx
/**
 * Badge — pill de status/categoría no interactivo.
 * Variantes semánticas: neutral, info, success, warning, danger.
 *
 * Uso:
 *   <Badge variant="success">Activo</Badge>
 *   <Badge variant="warning" dot>Pendiente</Badge>
 */

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]',
  info:    'bg-[var(--info-subtle)]    text-[var(--info)]',
  success: 'bg-[var(--success-subtle)] text-[var(--success)]',
  warning: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
  danger:  'bg-[var(--danger-subtle)]  text-[var(--danger)]',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--text-tertiary)]',
  info:    'bg-[var(--info)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger:  'bg-[var(--danger)]',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-[18px] px-1.5 text-[11px] gap-1',
  md: 'h-[22px] px-2 text-[13px] gap-1.5',
};

export default function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center rounded-full font-medium leading-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {dot && (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[variant]}`} />
      )}
      {children}
    </span>
  );
}
```

Notas:
- Server-safe (span estático)
- Dot: círculo 6px del color del variant

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Badge.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/primitives/Badge.tsx
git commit -m "feat(portal-ui): Badge primitive (5 semantic variants, 2 sizes, dot) (2B-1)"
```

---

## Task 4 — `Chip` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Chip.tsx`

**Interfaces:**
- Consumes: `Icon` primitive (Task 1), `lucide-react` (`X` icon)
- Produces:
  ```ts
  export interface ChipProps {
    label: string;
    selected?: boolean;
    removable?: boolean;
    onSelect?: () => void;
    onRemove?: () => void;
    className?: string;
    disabled?: boolean;
  }

  export default function Chip(props: ChipProps): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

Crear `src/components/portal-ui/primitives/Chip.tsx`:

```tsx
'use client';

import { X } from 'lucide-react';
import Icon from './Icon';

/**
 * Chip — tag/filter interactivo, opcionalmente removible o toggleable.
 *
 * Uso:
 *   <Chip label="Todos" selected onSelect={() => setFilter('all')} />
 *   <Chip label="Ventas" removable onRemove={() => removeTag('ventas')} />
 */

export interface ChipProps {
  label: string;
  selected?: boolean;
  removable?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
}

const BASE =
  'inline-flex items-center gap-1.5 h-7 rounded-full text-[13px] font-medium leading-none px-3 ' +
  'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none ' +
  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

const IDLE = 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]';
const SELECTED = 'bg-[var(--accent-subtle)] text-[var(--text-accent)]';

export default function Chip({
  label,
  selected = false,
  removable = false,
  onSelect,
  onRemove,
  className,
  disabled = false,
}: ChipProps) {
  const stateClass = selected ? SELECTED : IDLE;

  const handleRemove = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={onSelect ? selected : undefined}
      className={[BASE, stateClass, className ?? ''].filter(Boolean).join(' ')}
    >
      <span>{label}</span>
      {removable && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          aria-label={`Quitar ${label}`}
          className="inline-flex items-center justify-center rounded-full p-0.5 -mr-1 hover:bg-[var(--surface-sunken)] motion-reduce:transition-none"
        >
          <Icon icon={X} size={14} aria-hidden />
        </button>
      )}
    </button>
  );
}
```

Notas:
- `'use client'` porque tiene handlers
- Cuando `onSelect` está definido, agrega `aria-pressed`
- Cuando `removable` true, se anida un botón X con `stopPropagation` para no disparar el `onSelect` del chip
- Estados: idle (bg-sunken) → selected (bg accent-subtle + text accent)

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Chip.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/primitives/Chip.tsx
git commit -m "feat(portal-ui): Chip primitive (selected/removable + a11y pressed state) (2B-1)"
```

---

## Task 5 — `Card` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/Card.tsx`

**Interfaces:**
- Consumes: nada externo
- Produces:
  ```ts
  export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    padding?: 'none' | 'sm' | 'md' | 'lg';
    elevated?: boolean;
    border?: boolean;
  }

  interface CardComponent {
    (props: CardProps): JSX.Element;
    Header: React.FC<React.HTMLAttributes<HTMLDivElement>>;
    Body:   React.FC<React.HTMLAttributes<HTMLDivElement>>;
    Footer: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  }

  const Card: CardComponent;
  export default Card;
  ```

- [ ] **Step 1: Crear el archivo**

Crear `src/components/portal-ui/patterns/Card.tsx`:

```tsx
/**
 * Card — container base del design system. Slots Header/Body/Footer opcionales.
 *
 * Uso simple:
 *   <Card>content</Card>
 *
 * Uso con slots:
 *   <Card padding="none">
 *     <Card.Header>...</Card.Header>
 *     <Card.Body>...</Card.Body>
 *     <Card.Footer>...</Card.Footer>
 *   </Card>
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  elevated?: boolean;
  border?: boolean;
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: 'p-0',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
};

function CardRoot({
  padding = 'md',
  elevated = true,
  border = false,
  className,
  children,
  ...rest
}: CardProps) {
  const base = 'bg-[var(--surface-elevated)] rounded-xl';
  const shadow = elevated ? 'shadow-[var(--shadow-xs)]' : '';
  const borderClass = border ? 'border border-[var(--border-subtle)]' : '';

  return (
    <div
      className={[base, PADDING[padding], shadow, borderClass, className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div
    className={[
      'flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </div>
);

const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div className={['p-6', className ?? ''].filter(Boolean).join(' ')} {...rest}>
    {children}
  </div>
);

const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => (
  <div
    className={[
      'flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)]',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </div>
);

interface CardComponent {
  (props: CardProps): React.JSX.Element;
  Header: typeof CardHeader;
  Body:   typeof CardBody;
  Footer: typeof CardFooter;
}

const Card = CardRoot as CardComponent;
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
```

Notas:
- `padding` default `md` (24px) para uso simple sin slots
- Cuando se usan slots, `padding='none'` en el root porque Header/Body/Footer traen su propio padding interno
- `elevated=true` (shadow sutil) es lo típico; `border=true` sólo cuando no hay shadow
- Server-safe

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/Card.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/Card.tsx
git commit -m "feat(portal-ui): Card container + Header/Body/Footer slots (2B-1)"
```

---

## Task 6 — `SectionHeader` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/SectionHeader.tsx`

**Interfaces:**
- Consumes: nada externo
- Produces:
  ```ts
  export type HeadingLevel = 'h1' | 'h2' | 'h3';

  export interface SectionHeaderProps {
    eyebrow?: string;
    title: string;
    description?: string;
    right?: React.ReactNode;
    as?: HeadingLevel;
    className?: string;
  }

  export default function SectionHeader(props: SectionHeaderProps): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

Crear `src/components/portal-ui/patterns/SectionHeader.tsx`:

```tsx
/**
 * SectionHeader — encabezado de sección con eyebrow + title + description
 * + slot derecho para actions/filtros.
 *
 * Uso:
 *   <SectionHeader
 *     eyebrow="HOY"
 *     title="Buenas tardes, Pneuma Studio"
 *     description="Tu oficina está activa y atendiendo."
 *     right={<Button>Nuevo</Button>}
 *   />
 */

export type HeadingLevel = 'h1' | 'h2' | 'h3';

export interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
  as?: HeadingLevel;
  className?: string;
}

const TITLE_CLASS: Record<HeadingLevel, string> = {
  h1: 'text-[var(--fs-3xl)] font-[var(--font-heading)] font-semibold leading-tight',
  h2: 'text-[var(--fs-2xl)] font-[var(--font-heading)] font-semibold leading-tight',
  h3: 'text-[var(--fs-xl)]  font-[var(--font-heading)] font-semibold leading-tight',
};

export default function SectionHeader({
  eyebrow,
  title,
  description,
  right,
  as = 'h2',
  className,
}: SectionHeaderProps) {
  const HeadingTag = as;

  return (
    <header
      className={[
        'flex items-start justify-between gap-4',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow && (
          <p className="text-[var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)]">
            {eyebrow}
          </p>
        )}
        <HeadingTag className={`${TITLE_CLASS[as]} text-[var(--text-primary)]`}>
          {title}
        </HeadingTag>
        {description && (
          <p className="text-[var(--fs-base)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
```

Notas:
- Server-safe
- `as` default `h2` (encabezados de sección típicos)
- El right-slot puede alojar botones/filtros/actions
- `min-w-0 flex-1` en el bloque de textos permite que el título trunque si es largo sin empujar el right-slot

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/SectionHeader.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/SectionHeader.tsx
git commit -m "feat(portal-ui): SectionHeader pattern (eyebrow + title + description + right slot) (2B-1)"
```

---

## Task 7 — `EmptyState` rediseño + shim en path viejo

**Files:**
- Create: `src/components/portal-ui/patterns/EmptyState.tsx`
- Modify: `src/components/ui/empty-state.tsx` (convertir en shim re-export)

**Interfaces:**
- Consumes: `Icon` primitive (Task 1), `lucide-react` types
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export type EmptyStateSize = 'sm' | 'md' | 'lg';

  export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
    size?: EmptyStateSize;
  }

  export function EmptyState(props: EmptyStateProps): JSX.Element;
  const EmptyState_default: typeof EmptyState;
  export default EmptyState_default;
  ```

Preservar named export (`EmptyState`) + default export para no romper los ~15 imports existentes que hacen `import { EmptyState } from '@/components/ui/empty-state'` o `import EmptyState from '@/components/ui/empty-state'`.

- [ ] **Step 1: Crear el nuevo componente en portal-ui/patterns/**

Crear `src/components/portal-ui/patterns/EmptyState.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import Icon from '../primitives/Icon';

/**
 * EmptyState — pantalla vacía con icon + title + description + action.
 * Centered dentro de su container, no aplica fill-width.
 *
 * Uso:
 *   <EmptyState
 *     icon={Inbox}
 *     title="Sin mensajes"
 *     description="Cuando lleguen nuevos correos aparecerán aquí."
 *     action={<Button>Refrescar</Button>}
 *   />
 */

export type EmptyStateSize = 'sm' | 'md' | 'lg';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: EmptyStateSize;
}

const SIZE_TOKENS: Record<
  EmptyStateSize,
  {
    container: string;
    iconWrap: string;
    iconSize: 18 | 20 | 24;
    title: string;
    description: string;
    gap: string;
  }
> = {
  sm: {
    container: 'py-6 px-4 max-w-xs',
    iconWrap: 'h-10 w-10',
    iconSize: 18,
    title: 'text-[var(--fs-sm)]',
    description: 'text-[var(--fs-xs)]',
    gap: 'gap-1.5',
  },
  md: {
    container: 'py-10 px-6 max-w-md',
    iconWrap: 'h-12 w-12',
    iconSize: 20,
    title: 'text-[var(--fs-lg)]',
    description: 'text-[var(--fs-sm)]',
    gap: 'gap-2',
  },
  lg: {
    container: 'py-16 px-8 max-w-lg',
    iconWrap: 'h-16 w-16',
    iconSize: 24,
    title: 'text-[var(--fs-xl)]',
    description: 'text-[var(--fs-sm)]',
    gap: 'gap-2.5',
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const tokens = SIZE_TOKENS[size];

  return (
    <div
      className={[
        'mx-auto flex flex-col items-center justify-center text-center',
        tokens.container,
        tokens.gap,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <div
          className={[
            'mb-2 flex items-center justify-center rounded-full',
            'bg-[var(--accent-subtle)] text-[var(--text-accent)]',
            tokens.iconWrap,
          ].join(' ')}
        >
          <Icon icon={icon} size={tokens.iconSize} aria-hidden />
        </div>
      )}
      <p className={`font-semibold text-[var(--text-primary)] ${tokens.title}`}>
        {title}
      </p>
      {description && (
        <p className={`leading-relaxed text-[var(--text-secondary)] ${tokens.description}`}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
```

Notas del rediseño vs. versión vieja:
- Icon container: `bg-[var(--accent-subtle)]` (era `var(--c-hover)` gris) + `text-[var(--text-accent)]` (era `var(--c-text-3)` neutro) — más visible, más on-brand
- Título: `font-semibold` (era `font-medium`) + `text-[var(--fs-lg)]` en md (era `text-base`) — más presencia
- Description: `text-[var(--text-secondary)]` (era `var(--c-text-3)` — más apagado)
- Preserva `max-w-*` porque es visualmente centered dentro de su container (excepción justificada a fill-width rule)
- Preserva la API pública: `icon` como LucideIcon prop (no `Icon` primitive) para retrocompat con imports existentes

- [ ] **Step 2: Convertir el archivo viejo en shim**

Reemplazar el contenido completo de `src/components/ui/empty-state.tsx` con:

```tsx
/**
 * DEPRECATED shim — la lógica real vive en `@/components/portal-ui/patterns/EmptyState`.
 *
 * Este archivo se mantiene sólo para preservar los imports existentes
 * (`@/components/ui/empty-state`) mientras Fase 3+ migra cada consumidor
 * al path canónico del design system.
 */

export { EmptyState, default } from '@/components/portal-ui/patterns/EmptyState';
export type { EmptyStateProps, EmptyStateSize } from '@/components/portal-ui/patterns/EmptyState';
```

- [ ] **Step 3: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/EmptyState.tsx src/components/ui/empty-state.tsx
```

Esperado: sin errores. Los ~15 archivos que importan de `@/components/ui/empty-state` siguen resolviendo (via re-export).

- [ ] **Step 4: Grep de consumidores para validación**

```bash
grep -r "from '@/components/ui/empty-state'" src/ | wc -l
```

Anotar el conteo en el reporte. No debe cambiar respecto al pre-cambio.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-ui/patterns/EmptyState.tsx src/components/ui/empty-state.tsx
git commit -m "feat(portal-ui): redesign EmptyState with new tokens + preserve legacy path as shim (2B-1)"
```

---

## Task 8 — Re-exports en `index.ts`

**Files:**
- Modify: `src/components/portal-ui/index.ts`

**Interfaces:**
- Consumes: los 7 componentes y sus tipos creados en Tasks 1-7
- Produces: superficie pública unificada del design system

- [ ] **Step 1: Leer el index actual**

Ver `src/components/portal-ui/index.ts`. Actualmente exporta sólo los 3 layout helpers (`PageContainer`, `PageSection`, `GridStretch`) de Fase 2A.

- [ ] **Step 2: Extender con los 7 nuevos componentes**

REEMPLAZAR el contenido completo del archivo con:

```ts
/**
 * Portal Design System — public entrypoint.
 *
 * Consumidores importan desde aquí:
 *   import { PageContainer, Button, Card, SectionHeader } from '@/components/portal-ui';
 */

// ─── Layout (Fase 2A) ──────────────────────────────────────────────────
export { default as PageContainer } from './patterns/layout/PageContainer';
export { default as PageSection }   from './patterns/layout/PageSection';
export { default as GridStretch }   from './patterns/layout/GridStretch';

export type { PageContainerProps } from './patterns/layout/PageContainer';
export type { PageSectionProps }   from './patterns/layout/PageSection';
export type { GridStretchProps }   from './patterns/layout/GridStretch';

// ─── Primitives (Fase 2B-1) ────────────────────────────────────────────
export { default as Icon }   from './primitives/Icon';
export { default as Button } from './primitives/Button';
export { default as Badge }  from './primitives/Badge';
export { default as Chip }   from './primitives/Chip';

export type { IconProps, IconSize }             from './primitives/Icon';
export type { ButtonProps, ButtonVariant, ButtonSize } from './primitives/Button';
export type { BadgeProps, BadgeVariant, BadgeSize }    from './primitives/Badge';
export type { ChipProps }                       from './primitives/Chip';

// ─── Patterns (Fase 2B-1) ──────────────────────────────────────────────
export { default as Card }          from './patterns/Card';
export { default as SectionHeader } from './patterns/SectionHeader';
export { default as EmptyState }    from './patterns/EmptyState';
export { EmptyState as EmptyStateNamed } from './patterns/EmptyState';

export type { CardProps }                        from './patterns/Card';
export type { SectionHeaderProps, HeadingLevel } from './patterns/SectionHeader';
export type { EmptyStateProps, EmptyStateSize }  from './patterns/EmptyState';
```

Notas:
- `EmptyStateNamed` alias exportado para consumers que prefieren named import via el nuevo path (opcional; sin él el default export ya cubre la mayoría)

- [ ] **Step 3: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/index.ts
```

- [ ] **Step 4: Smoke test — importar todo en un archivo temporal**

Crear temporalmente `src/app/_test-2b1.tsx` con:

```tsx
import {
  PageContainer, PageSection, GridStretch,
  Icon, Button, Badge, Chip,
  Card, SectionHeader, EmptyState,
} from '@/components/portal-ui';
import { Home, Inbox } from 'lucide-react';

export function Test2b1() {
  return (
    <PageContainer>
      <PageSection heading={<SectionHeader eyebrow="TEST" title="Smoke" />}>
        <GridStretch cols={{ base: 1, md: 2 }}>
          <Card>
            <Icon icon={Home} size={18} />
            <Button variant="primary">Test</Button>
            <Badge variant="success" dot>Activo</Badge>
            <Chip label="filtro" selected onSelect={() => {}} />
          </Card>
          <Card padding="none">
            <Card.Header>Head</Card.Header>
            <Card.Body>
              <EmptyState icon={Inbox} title="Sin datos" description="Nada aún." />
            </Card.Body>
            <Card.Footer>Foot</Card.Footer>
          </Card>
        </GridStretch>
      </PageSection>
    </PageContainer>
  );
}
```

Correr:

```bash
npx tsc --noEmit
```

Debe pasar sin errores de tipo. Después BORRAR el archivo:

```bash
rm src/app/_test-2b1.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/portal-ui/index.ts
git commit -m "feat(portal-ui): index re-exports for Fase 2B-1 core primitives"
```

---

## Task 9 — Visual smoke test (opcional pero recomendado)

**Files:** ninguno modificado — validación manual con Chrome DevTools MCP.

- [ ] **Step 1: Crear una página de sandbox temporal para inspección visual**

Este step es OPCIONAL. Si vas a migrar páginas en Fase 3 pronto, puedes saltarlo y validar visualmente cuando migres la primera página real.

Si quieres inspeccionar visualmente los componentes ahora, crear temporalmente `src/app/(sandbox)/portal-ui-sandbox/page.tsx`:

```tsx
import {
  PageContainer, PageSection, GridStretch,
  Icon, Button, Badge, Chip, Card, SectionHeader, EmptyState,
} from '@/components/portal-ui';
import { Home, Inbox, Download, Plus, Trash2 } from 'lucide-react';

export default function Sandbox() {
  return (
    <PageContainer>
      <PageSection heading={<SectionHeader eyebrow="DESIGN SYSTEM" title="Fase 2B-1 sandbox" description="Verificación visual de los 7 primitives core." />}>
        <GridStretch cols={{ base: 1, md: 2 }}>
          <Card>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Buttons</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" iconLeft={Plus}>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost" iconLeft={Download}>Ghost</Button>
                <Button variant="danger" iconLeft={Trash2}>Danger</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <Button loading>Loading</Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Badges + Chips</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Neutral</Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="success" dot>Activo</Badge>
                <Badge variant="warning" dot>Pendiente</Badge>
                <Badge variant="danger">Error</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip label="Todos" selected onSelect={() => {}} />
                <Chip label="Hoy" onSelect={() => {}} />
                <Chip label="Ventas" removable onRemove={() => {}} />
              </div>
            </div>
          </Card>

          <Card padding="none">
            <Card.Header>
              <div>
                <h3 className="text-sm font-semibold">Card con slots</h3>
                <p className="text-xs text-[var(--text-tertiary)]">Header + Body + Footer</p>
              </div>
              <Icon icon={Home} size={18} />
            </Card.Header>
            <Card.Body>
              <p className="text-sm text-[var(--text-secondary)]">Body content del card.</p>
            </Card.Body>
            <Card.Footer>
              <Button variant="ghost" size="sm">Cancelar</Button>
              <Button variant="primary" size="sm">Guardar</Button>
            </Card.Footer>
          </Card>

          <Card>
            <EmptyState
              icon={Inbox}
              title="Bandeja vacía"
              description="Cuando lleguen mensajes aparecerán aquí."
              action={<Button variant="primary" iconLeft={Plus}>Nuevo mensaje</Button>}
            />
          </Card>
        </GridStretch>
      </PageSection>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Arrancar dev + inspeccionar**

```bash
npm run dev
```

Abrir `http://localhost:3000/portal-ui-sandbox`. Verificar:
- Buttons se ven con los 4 variants correctos y hover states responden
- Badges tienen los colores semánticos (verde/amarillo/rojo/azul)
- Chips: activo lila, otros gris; removable tiene X funcional
- Card sin slots (padding md) y con slots (Header/Body/Footer con borders divisorios)
- EmptyState: icon en círculo lila, title semibold, description muted, botón primary

- [ ] **Step 3: Chrome DevTools MCP screenshot (si disponible)**

Tomar screenshot y guardar en workspace de SDD si aplica.

- [ ] **Step 4: Borrar sandbox**

```bash
rm -rf src/app/\(sandbox\)/
```

Este step NO va a un commit — el sandbox es de un solo uso.

- [ ] **Step 5: Corridas finales**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: ambos verdes.

---

## Self-review realizado

**Spec coverage:** los 7 componentes core del catálogo (Fase 2B según spec: primitives Icon/Button/Badge/Chip + patterns Card/SectionHeader/EmptyState) están cubiertos por Tasks 1-7. Index re-exports en Task 8. Smoke visual en Task 9 opcional.

**Placeholder scan:** sin TBDs, "later", "similar to" etc. Todos los steps con código a escribir tienen el bloque completo.

**Type consistency:**
- `Icon` con `IconProps` (Task 1) → consumido en Button (Task 2), Chip (Task 4), EmptyState (Task 7).
- `ButtonProps` con `ButtonVariant | ButtonSize` → nunca referenciado por otros componentes de este plan (Button es hoja).
- `EmptyStateProps` shape idéntico entre nuevo componente (Task 7) y shim (Task 7 Step 2) — el shim solo re-exporta.
- Todas las clases de tokens (`var(--surface-elevated)`, `var(--text-accent)`, etc.) coinciden con los nombres definidos en Fase 2A (`globals.css`).

**Riesgo residual identificado:**
- EmptyState nuevo cambia visualmente (icon bg pasa de gris a lila accent). Los ~15 lugares que ya lo usan verán ese cambio automáticamente. Es intencional (rediseño), pero si algún consumer contaba con el look neutral viejo debe ajustarse en Fase 3+. Anotado en Task 7 Step 1.
- `color-mix()` CSS function usado en Button hover (secondary, danger). Requiere navegadores modernos — soportado en Chrome 111+, Safari 16.4+, Firefox 113+. Aceptable para portal SaaS interno.
