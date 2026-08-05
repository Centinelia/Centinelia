# Portal Design System — Fase 2B-2: Extractions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Construir los 10 componentes "extractions" del design system del portal (patterns que ya existen inline en múltiples páginas) — `Avatar`, `Divider`, `StatChip`, `ProgressBar`, `FilterBar`, `Toolbar`, `KpiCard`, `RankRow`, `ActivityEventCard`, `DataTable` — más `tokens.ts` con mapas semánticos (`EVENT_TYPE_COLORS`, `AVATAR_SIZES`, `ICON_SIZES`).

**Architecture:** Los 10 componentes se construyen desde CERO en `src/components/portal-ui/` usando los primitives (Icon, Button, Badge, Card) ya en el design system. La lógica visual se toma como referencia de las ubicaciones inline actuales pero se REESCRIBE con los nuevos tokens (Fase 2A) — NO se hace un extract literal. Las páginas actuales quedan intactas; la migración pasa a Fase 3 (per página).

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Lucide React icons, tokens CSS custom properties.

## Global Constraints

- Consumir componentes ya shipeados: `Icon`, `Button`, `Badge`, `Chip`, `Card`, `SectionHeader`, `EmptyState`
- CSS vars primero: `--surface-*`, `--text-*`, `--accent-*`, `--space-*`, `--fs-*`, `--radius-*`, `--shadow-*`, `--motion-*`, `--success/warning/danger/info` + `-subtle`
- Transiciones con `motion-reduce:transition-none` obligatorio
- Focus visible con `--shadow-focus`
- Server-safe donde sea posible; `'use client'` solo si hay hooks o handlers interactivos
- No emojis, no em-dash, no "IA" visible; acentos ES correctos
- No modificar páginas del portal (migración es Fase 3+)
- Los componentes NO se extraen literalmente de los archivos existentes — se reescriben desde spec

---

## File Structure

**Nuevos archivos:**

| Archivo | Ubicación |
|---|---|
| `Avatar.tsx` | `src/components/portal-ui/primitives/` |
| `Divider.tsx` | `src/components/portal-ui/primitives/` |
| `StatChip.tsx` | `src/components/portal-ui/patterns/` |
| `ProgressBar.tsx` | `src/components/portal-ui/patterns/` |
| `FilterBar.tsx` | `src/components/portal-ui/patterns/` |
| `Toolbar.tsx` | `src/components/portal-ui/patterns/` |
| `KpiCard.tsx` | `src/components/portal-ui/patterns/` |
| `RankRow.tsx` | `src/components/portal-ui/patterns/` |
| `ActivityEventCard.tsx` | `src/components/portal-ui/patterns/` |
| `DataTable.tsx` | `src/components/portal-ui/patterns/` |
| `tokens.ts` | `src/components/portal-ui/` |

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `src/components/portal-ui/index.ts` | Agregar re-exports de los 10 componentes + tipos + `tokens.ts` |

---

## Task 1 — `Avatar` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Avatar.tsx`

**Interfaces:**
- Consumes: nada (usa `next/image` opcional; string fallback)
- Produces:
  ```ts
  export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
  export type AvatarStatus = 'online' | 'away' | 'offline';

  export interface AvatarProps {
    src?: string | null;
    initial: string;
    alt?: string;
    size?: AvatarSize;
    status?: AvatarStatus;
    className?: string;
  }

  export default function Avatar(props: AvatarProps): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
import Image from 'next/image';

/**
 * Avatar — círculo con foto o inicial fallback. Sizes xs/sm/md/lg
 * (20/28/36/44 px). Status opcional muestra dot semantic en esquina.
 *
 * Uso:
 *   <Avatar src={user.photo} initial={user.name[0]} alt={user.name} />
 *   <Avatar initial="N" size="lg" status="online" />
 */

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'away' | 'offline';

export interface AvatarProps {
  src?: string | null;
  initial: string;
  alt?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

const SIZE_PX: Record<AvatarSize, number> = { xs: 20, sm: 28, md: 36, lg: 44 };
const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-11 w-11 text-sm',
};
const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-[var(--success)]',
  away:   'bg-[var(--warning)]',
  offline:'bg-[var(--text-tertiary)]',
};

export default function Avatar({
  src,
  initial,
  alt,
  size = 'md',
  status,
  className,
}: AvatarProps) {
  const px = SIZE_PX[size];
  const containerClass = SIZE_CLASS[size];
  const initialUpper = (initial ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={[
        'relative inline-flex items-center justify-center overflow-visible rounded-full',
        'bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-semibold',
        containerClass,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {src ? (
        <Image
          src={src}
          alt={alt ?? ''}
          width={px}
          height={px}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span aria-hidden>{initialUpper}</span>
      )}
      {status && (
        <span
          aria-label={status}
          className={[
            'absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--surface-elevated)]',
            'h-2 w-2',
            STATUS_COLOR[status],
          ].join(' ')}
        />
      )}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Avatar.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/primitives/Avatar.tsx
git commit -m "feat(portal-ui): Avatar primitive (4 sizes, status dot, initial fallback) (2B-2)"
```

---

## Task 2 — `Divider` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Divider.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface DividerProps {
    orientation?: 'horizontal' | 'vertical';
    spacing?: 'sm' | 'md' | 'lg';
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
/**
 * Divider — separador horizontal o vertical con spacing opcional.
 *
 * Uso:
 *   <Divider />
 *   <Divider orientation="vertical" spacing="md" />
 */

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
}

const H_SPACING: Record<NonNullable<DividerProps['spacing']>, string> = {
  sm: 'my-2',
  md: 'my-4',
  lg: 'my-6',
};
const V_SPACING: Record<NonNullable<DividerProps['spacing']>, string> = {
  sm: 'mx-2',
  md: 'mx-4',
  lg: 'mx-6',
};

export default function Divider({
  orientation = 'horizontal',
  spacing,
  className,
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={[
          'inline-block h-full w-px bg-[var(--border-subtle)]',
          spacing ? V_SPACING[spacing] : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }

  return (
    <hr
      className={[
        'w-full border-0 border-t border-[var(--border-subtle)]',
        spacing ? H_SPACING[spacing] : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Divider.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/primitives/Divider.tsx
git commit -m "feat(portal-ui): Divider primitive (horizontal/vertical + spacing) (2B-2)"
```

---

## Task 3 — `StatChip` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/StatChip.tsx`

**Interfaces:**
- Consumes: `Icon` primitive
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export interface StatChipProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
import type { LucideIcon } from 'lucide-react';
import Icon from '../primitives/Icon';

/**
 * StatChip — chip pequeño con icono + label + valor. Para KPIs secundarios
 * en toolbars/headers. Valor con tabular-nums para evitar jitter.
 *
 * Uso:
 *   <StatChip icon={Phone} label="Llamadas hoy" value={42} />
 *   <StatChip icon={Clock} label="Prom" value="2:15" tone="accent" />
 */

export type StatChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface StatChipProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: StatChipTone;
  className?: string;
}

const TONE_CLASSES: Record<StatChipTone, string> = {
  neutral: 'text-[var(--text-secondary)]',
  accent:  'text-[var(--text-accent)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger:  'text-[var(--danger)]',
};

export default function StatChip({
  icon,
  label,
  value,
  tone = 'neutral',
  className,
}: StatChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 h-8 rounded-md px-3',
        'bg-[var(--surface-sunken)] text-[var(--fs-sm)]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon icon={icon} size={14} aria-hidden className={TONE_CLASSES[tone]} />
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className={`font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{value}</span>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/StatChip.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/StatChip.tsx
git commit -m "feat(portal-ui): StatChip pattern (icon + label + tabular value + tone) (2B-2)"
```

---

## Task 4 — `ProgressBar` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/ProgressBar.tsx`

**Interfaces:**
- Consumes: `uColor` de `@/lib/portal/utils` (helper existente que devuelve color por %)
- Produces:
  ```ts
  export interface ProgressBarProps {
    value: number;         // 0-100
    size?: 'xs' | 'sm' | 'md';
    color?: string;        // override manual, si no usa uColor(value)
    label?: string;        // aria-label
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
import { uColor } from '@/lib/portal/utils';

/**
 * ProgressBar — barra de progreso con color automático por porcentaje
 * (verde → amarillo → rojo via uColor helper) o color manual.
 *
 * Uso:
 *   <ProgressBar value={87} label="Minutos consumidos" />
 *   <ProgressBar value={40} size="xs" color="var(--accent-default)" />
 */

export type ProgressBarSize = 'xs' | 'sm' | 'md';

export interface ProgressBarProps {
  value: number;
  size?: ProgressBarSize;
  color?: string;
  label?: string;
  className?: string;
}

const HEIGHT: Record<ProgressBarSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
};

export default function ProgressBar({
  value,
  size = 'xs',
  color,
  label,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillColor = color ?? uColor(clamped);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={[
        'overflow-hidden rounded-full bg-[var(--surface-sunken)]',
        HEIGHT[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="h-full rounded-full motion-reduce:transition-none"
        style={{
          width: `${clamped}%`,
          background: fillColor,
          transition: 'width var(--motion-slow) var(--ease-default)',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/ProgressBar.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/ProgressBar.tsx
git commit -m "feat(portal-ui): ProgressBar pattern (auto-color via uColor + motion-reduce) (2B-2)"
```

---

## Task 5 — `FilterBar` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/FilterBar.tsx`

**Interfaces:**
- Consumes: `Chip` primitive
- Produces:
  ```ts
  export interface FilterOption {
    value: string;
    label: string;
  }

  export interface FilterBarProps {
    options: FilterOption[];
    value: string | string[];
    onChange: (value: string | string[]) => void;
    multi?: boolean;
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import Chip from '../primitives/Chip';

/**
 * FilterBar — grupo horizontal de Chips (single o multi select).
 *
 * Uso:
 *   <FilterBar
 *     options={[{value:'todos', label:'Todos'}, {value:'hoy', label:'Hoy'}]}
 *     value={filter}
 *     onChange={setFilter}
 *   />
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterBarProps {
  options: FilterOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
  className?: string;
}

export default function FilterBar({
  options,
  value,
  onChange,
  multi = false,
  className,
}: FilterBarProps) {
  const isSelected = (v: string): boolean => {
    if (multi) return Array.isArray(value) && value.includes(v);
    return !Array.isArray(value) && value === v;
  };

  const handleSelect = (v: string) => {
    if (!multi) {
      onChange(v);
      return;
    }
    const current = Array.isArray(value) ? value : [];
    if (current.includes(v)) {
      onChange(current.filter(x => x !== v));
    } else {
      onChange([...current, v]);
    }
  };

  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      className={[
        'inline-flex flex-wrap items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map(opt => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={isSelected(opt.value)}
          onSelect={() => handleSelect(opt.value)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/FilterBar.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/FilterBar.tsx
git commit -m "feat(portal-ui): FilterBar pattern (single/multi select, radio/group role) (2B-2)"
```

---

## Task 6 — `Toolbar` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/Toolbar.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface ToolbarProps {
    left?: React.ReactNode;
    center?: React.ReactNode;
    right?: React.ReactNode;
    sticky?: boolean;
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
/**
 * Toolbar — barra horizontal con 3 slots (izquierda / centro / derecha).
 * Puede ser sticky al top del content container.
 *
 * Uso:
 *   <Toolbar
 *     left={<SectionHeader title="Llamadas" />}
 *     center={<FilterBar ... />}
 *     right={<Button>Nueva</Button>}
 *   />
 */

export interface ToolbarProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}

export default function Toolbar({
  left,
  center,
  right,
  sticky = false,
  className,
}: ToolbarProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4 py-3',
        'border-b border-[var(--border-subtle)] bg-[var(--surface-canvas)]',
        sticky ? 'sticky top-14 z-10' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0 flex-1">{left}</div>
      {center && <div className="shrink-0">{center}</div>}
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
```

Nota: `sticky top-14` asume que el header V2 mide 56px (14 * 4).

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/Toolbar.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/Toolbar.tsx
git commit -m "feat(portal-ui): Toolbar pattern (3-slot horizontal + optional sticky) (2B-2)"
```

---

## Task 7 — `KpiCard` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/KpiCard.tsx`

**Interfaces:**
- Consumes: `Icon`, `Card`
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export type KpiTrend = 'up' | 'down' | 'flat';

  export interface KpiCardProps {
    label: string;
    value: string | number;
    subLabel?: string;
    icon: LucideIcon;
    accentColor?: string;   // CSS color; default var(--accent-default)
    trend?: { direction: KpiTrend; value: string };
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Icon from '../primitives/Icon';
import Card from './Card';

/**
 * KpiCard — Card con top-line color + ícono + número grande + label + sub.
 * Auto-stretch en grid (h-full).
 *
 * Uso:
 *   <KpiCard icon={Phone} label="Conversaciones" value={75} subLabel="prom. 2 min" />
 *   <KpiCard icon={Sparkles} label="Tareas" value={582} accentColor="var(--success)"
 *            trend={{direction:'up', value:'+12%'}} />
 */

export type KpiTrend = 'up' | 'down' | 'flat';

export interface KpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: LucideIcon;
  accentColor?: string;
  trend?: { direction: KpiTrend; value: string };
  className?: string;
}

const TREND_ICON: Record<KpiTrend, LucideIcon> = {
  up:   TrendingUp,
  down: TrendingDown,
  flat: Minus,
};
const TREND_COLOR: Record<KpiTrend, string> = {
  up:   'var(--success)',
  down: 'var(--danger)',
  flat: 'var(--text-tertiary)',
};

export default function KpiCard({
  label,
  value,
  subLabel,
  icon,
  accentColor,
  trend,
  className,
}: KpiCardProps) {
  const color = accentColor ?? 'var(--accent-default)';

  return (
    <Card
      padding="none"
      className={['relative h-full overflow-hidden', className ?? ''].filter(Boolean).join(' ')}
    >
      {/* Top-line color */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: color }}
      />
      <div className="flex items-start gap-4 p-6 pt-7">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          <Icon icon={icon} size={20} strokeWidth={2} className="" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[var(--fs-3xl)] font-semibold tabular-nums leading-none text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {value}
            </span>
            {trend && (
              <span
                className="inline-flex items-center gap-0.5 text-[var(--fs-xs)] font-semibold tabular-nums"
                style={{ color: TREND_COLOR[trend.direction] }}
              >
                <Icon icon={TREND_ICON[trend.direction]} size={14} aria-hidden />
                {trend.value}
              </span>
            )}
          </div>
          <p className="text-[var(--fs-sm)] font-medium text-[var(--text-secondary)]">
            {label}
          </p>
          {subLabel && (
            <p className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">{subLabel}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/KpiCard.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/KpiCard.tsx
git commit -m "feat(portal-ui): KpiCard pattern (top-line + icon + value + label + trend) (2B-2)"
```

---

## Task 8 — `RankRow` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/RankRow.tsx`

**Interfaces:**
- Consumes: `Avatar` (Task 1), `Icon`
- Produces:
  ```ts
  export interface RankRowMetric {
    label: string;
    value: string | number;
  }

  export interface RankRowIndicator {
    color: string;   // CSS color; typically semantic var
    label?: string;
  }

  export interface RankRowProps {
    rank?: number;
    indicator?: RankRowIndicator;
    avatar: {
      src?: string | null;
      initial: string;
      alt?: string;
    };
    title: string;
    subtitle?: string;
    metrics?: RankRowMetric[];
    action?: React.ReactNode;
    className?: string;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
import Avatar from '../primitives/Avatar';

/**
 * RankRow — row para listas rankeadas: [rank] [indicator dot] [avatar] [title/subtitle] [metrics] [action].
 *
 * Uso:
 *   <RankRow
 *     rank={1}
 *     indicator={{color:'var(--success)', label:'activo'}}
 *     avatar={{src:'/nox.png', initial:'N'}}
 *     title="Nox" subtitle="Director"
 *     metrics={[{label:'llamadas', value:12}]}
 *     action={<Button size="sm" variant="ghost">Ver</Button>}
 *   />
 */

export interface RankRowMetric {
  label: string;
  value: string | number;
}

export interface RankRowIndicator {
  color: string;
  label?: string;
}

export interface RankRowProps {
  rank?: number;
  indicator?: RankRowIndicator;
  avatar: {
    src?: string | null;
    initial: string;
    alt?: string;
  };
  title: string;
  subtitle?: string;
  metrics?: RankRowMetric[];
  action?: React.ReactNode;
  className?: string;
}

export default function RankRow({
  rank,
  indicator,
  avatar,
  title,
  subtitle,
  metrics,
  action,
  className,
}: RankRowProps) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2',
        'hover:bg-[var(--surface-sunken)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {typeof rank === 'number' && (
        <span className="w-5 shrink-0 text-center text-[var(--fs-xs)] font-semibold tabular-nums text-[var(--text-tertiary)]">
          #{rank}
        </span>
      )}
      {indicator && (
        <span
          aria-label={indicator.label}
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: indicator.color }}
        />
      )}
      <Avatar
        src={avatar.src ?? null}
        initial={avatar.initial}
        alt={avatar.alt}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[var(--fs-sm)] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[var(--fs-xs)] text-[var(--text-tertiary)]">
            {subtitle}
          </p>
        )}
      </div>
      {metrics && metrics.length > 0 && (
        <div className="hidden md:flex shrink-0 items-center gap-4">
          {metrics.map(m => (
            <span key={m.label} className="text-right leading-tight">
              <span className="block text-[var(--fs-sm)] font-semibold tabular-nums text-[var(--text-primary)]">
                {m.value}
              </span>
              <span className="block text-[var(--fs-xs)] text-[var(--text-tertiary)]">
                {m.label}
              </span>
            </span>
          ))}
        </div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/RankRow.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/RankRow.tsx
git commit -m "feat(portal-ui): RankRow pattern (rank + indicator + avatar + metrics + action) (2B-2)"
```

---

## Task 9 — `ActivityEventCard` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/ActivityEventCard.tsx`

**Interfaces:**
- Consumes: `Icon`, `Badge`, `tokens.ts` (Task 11 — se referencia por nombre `EVENT_TYPE_COLORS` + tipos; en esta task solo se declaran los tipos inline)
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export type EventType =
    | 'llamada' | 'lead' | 'cita' | 'pedido' | 'ticket'
    | 'incidente' | 'reporte' | 'encuesta' | 'delegacion'
    | 'correo' | 'otro';

  export interface ActivityEventCardProps {
    type: EventType;
    icon: LucideIcon;
    typeLabel: string;
    title: string;
    description?: string;
    timestamp: string;         // ISO
    agentName?: string;
    href?: string;
    className?: string;
  }
  ```

Notas: `EVENT_TYPE_COLORS` map se define en Task 11. Este componente consume ese map cuando esté disponible; hasta entonces usa un fallback interno.

- [ ] **Step 1: Crear el archivo**

```tsx
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import Icon from '../primitives/Icon';
import Badge, { type BadgeVariant } from '../primitives/Badge';

/**
 * ActivityEventCard — card de evento tipo feed. Icon box coloreado por type +
 * Badge del type + title + description + timestamp muted.
 *
 * Si href se pasa, la card entera es clickeable (via Link wrap).
 *
 * Uso:
 *   <ActivityEventCard
 *     type="llamada"
 *     icon={Phone}
 *     typeLabel="Llamada"
 *     title="Miguel Morales"
 *     description="Solicitó factura por correo"
 *     timestamp="2026-08-05T15:23:00Z"
 *     href="/portal/[t]/llamadas/xyz"
 *   />
 */

export type EventType =
  | 'llamada' | 'lead' | 'cita' | 'pedido' | 'ticket'
  | 'incidente' | 'reporte' | 'encuesta' | 'delegacion'
  | 'correo' | 'otro';

export interface ActivityEventCardProps {
  type: EventType;
  icon: LucideIcon;
  typeLabel: string;
  title: string;
  description?: string;
  timestamp: string;
  agentName?: string;
  href?: string;
  className?: string;
}

// Fallback map — se sobrescribe con import de tokens.ts (Task 11) cuando toque
const EVENT_TONE: Record<EventType, { color: string; bg: string; badge: BadgeVariant }> = {
  llamada:    { color: 'var(--accent-default)',    bg: 'var(--accent-subtle)',   badge: 'info' },
  lead:       { color: 'var(--success)',           bg: 'var(--success-subtle)',  badge: 'success' },
  cita:       { color: 'var(--info)',              bg: 'var(--info-subtle)',     badge: 'info' },
  pedido:     { color: 'var(--warning)',           bg: 'var(--warning-subtle)',  badge: 'warning' },
  ticket:     { color: 'var(--danger)',            bg: 'var(--danger-subtle)',   badge: 'danger' },
  incidente:  { color: 'var(--danger)',            bg: 'var(--danger-subtle)',   badge: 'danger' },
  reporte:    { color: 'var(--info)',              bg: 'var(--info-subtle)',     badge: 'info' },
  encuesta:   { color: 'var(--accent-default)',    bg: 'var(--accent-subtle)',   badge: 'info' },
  delegacion: { color: 'var(--accent-emphasized)', bg: 'var(--accent-subtle)',   badge: 'info' },
  correo:     { color: 'var(--text-secondary)',    bg: 'var(--surface-sunken)',  badge: 'neutral' },
  otro:       { color: 'var(--text-tertiary)',     bg: 'var(--surface-sunken)',  badge: 'neutral' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export default function ActivityEventCard({
  type,
  icon,
  typeLabel,
  title,
  description,
  timestamp,
  agentName,
  href,
  className,
}: ActivityEventCardProps) {
  const tone = EVENT_TONE[type];

  const inner = (
    <div
      className={[
        'flex items-start gap-3 rounded-lg p-3',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        href ? 'hover:bg-[var(--surface-sunken)]' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: tone.bg, color: tone.color }}
      >
        <Icon icon={icon} size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant={tone.badge} size="sm">{typeLabel}</Badge>
          {agentName && (
            <span className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">
              {agentName}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[var(--fs-xs)] text-[var(--text-tertiary)]">
            {formatRelative(timestamp)}
          </span>
        </div>
        <p className="mt-1 text-[var(--fs-sm)] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-[var(--fs-sm)] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
        {inner}
      </Link>
    );
  }
  return inner;
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/ActivityEventCard.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/ActivityEventCard.tsx
git commit -m "feat(portal-ui): ActivityEventCard pattern (11 event types + optional href) (2B-2)"
```

---

## Task 10 — `DataTable` pattern

**Files:**
- Create: `src/components/portal-ui/patterns/DataTable.tsx`

**Interfaces:**
- Consumes: `Icon`, `EmptyState`
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export interface DataTableColumn<T> {
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    sortable?: boolean;
    align?: 'left' | 'center' | 'right';
    width?: string;
  }

  export type SortDirection = 'asc' | 'desc';

  export interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    sortBy?: { key: string; direction: SortDirection };
    onSort?: (key: string, direction: SortDirection) => void;
    emptyState?: {
      icon: LucideIcon;
      title: string;
      description?: string;
    };
    className?: string;
  }

  export default function DataTable<T>(props: DataTableProps<T>): JSX.Element;
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Icon from '../primitives/Icon';
import EmptyState from './EmptyState';

/**
 * DataTable — tabla genérica sortable con empty state built-in.
 * Fill-width por default (respeta layout rule).
 *
 * Uso:
 *   <DataTable
 *     columns={[
 *       { key:'name', header:'Nombre', sortable:true },
 *       { key:'value', header:'Valor', align:'right', render: r => <b>{r.value}</b> },
 *     ]}
 *     rows={data}
 *     rowKey={r => r.id}
 *     sortBy={sort}
 *     onSort={setSort}
 *     emptyState={{ icon: Inbox, title: 'Sin datos' }}
 *   />
 */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sortBy?: { key: string; direction: SortDirection };
  onSort?: (key: string, direction: SortDirection) => void;
  emptyState?: {
    icon: LucideIcon;
    title: string;
    description?: string;
  };
  className?: string;
}

const ALIGN: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left:   'text-left',
  center: 'text-center',
  right:  'text-right',
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortBy,
  onSort,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return (
      <div className={['py-8', className ?? ''].filter(Boolean).join(' ')}>
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
        />
      </div>
    );
  }

  const handleHeaderClick = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSort) return;
    if (sortBy?.key === col.key) {
      onSort(col.key, sortBy.direction === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(col.key, 'asc');
    }
  };

  return (
    <div className={['w-full overflow-x-auto', className ?? ''].filter(Boolean).join(' ')}>
      <table className="w-full border-collapse text-[var(--fs-sm)]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            {columns.map(col => {
              const align = col.align ?? 'left';
              const isSorted = sortBy?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={isSorted ? (sortBy.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  style={{ width: col.width }}
                  className={[
                    'px-3 py-2 text-[var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)]',
                    ALIGN[align],
                  ].join(' ')}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(col)}
                      className="inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] hover:text-[var(--text-secondary)]"
                    >
                      <span>{col.header}</span>
                      {isSorted && (
                        <Icon
                          icon={sortBy.direction === 'asc' ? ChevronUp : ChevronDown}
                          size={14}
                          aria-hidden
                        />
                      )}
                    </button>
                  ) : (
                    <span>{col.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              className="border-b border-[var(--border-subtle)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none hover:bg-[var(--surface-sunken)]"
            >
              {columns.map(col => {
                const align = col.align ?? 'left';
                const value = col.render ? col.render(row) : ((row as unknown as Record<string, React.ReactNode>)[col.key] ?? null);
                return (
                  <td
                    key={col.key}
                    className={['px-3 py-3 text-[var(--text-secondary)]', ALIGN[align]].join(' ')}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/patterns/DataTable.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/patterns/DataTable.tsx
git commit -m "feat(portal-ui): DataTable pattern (sortable + empty state + fill-width) (2B-2)"
```

---

## Task 11 — `tokens.ts` (JS constants)

**Files:**
- Create: `src/components/portal-ui/tokens.ts`

**Interfaces:**
- Produces:
  ```ts
  export const EVENT_TYPE_COLORS: Record<EventType, { color: string; bg: string; badge: BadgeVariant }>;
  export const AVATAR_SIZES: Record<AvatarSize, number>;
  export const ICON_SIZES: Record<'xs'|'sm'|'md'|'lg'|'xl', number>;
  ```

- [ ] **Step 1: Crear el archivo**

```ts
import type { EventType } from './patterns/ActivityEventCard';
import type { AvatarSize } from './primitives/Avatar';
import type { BadgeVariant } from './primitives/Badge';

/**
 * tokens.ts — mapas semánticos para componentes del design system.
 * Complementa los tokens CSS de globals.css con lookups JS.
 */

export const EVENT_TYPE_COLORS: Record<EventType, { color: string; bg: string; badge: BadgeVariant }> = {
  llamada:    { color: 'var(--accent-default)',    bg: 'var(--accent-subtle)',   badge: 'info' },
  lead:       { color: 'var(--success)',           bg: 'var(--success-subtle)',  badge: 'success' },
  cita:       { color: 'var(--info)',              bg: 'var(--info-subtle)',     badge: 'info' },
  pedido:     { color: 'var(--warning)',           bg: 'var(--warning-subtle)',  badge: 'warning' },
  ticket:     { color: 'var(--danger)',            bg: 'var(--danger-subtle)',   badge: 'danger' },
  incidente:  { color: 'var(--danger)',            bg: 'var(--danger-subtle)',   badge: 'danger' },
  reporte:    { color: 'var(--info)',              bg: 'var(--info-subtle)',     badge: 'info' },
  encuesta:   { color: 'var(--accent-default)',    bg: 'var(--accent-subtle)',   badge: 'info' },
  delegacion: { color: 'var(--accent-emphasized)', bg: 'var(--accent-subtle)',   badge: 'info' },
  correo:     { color: 'var(--text-secondary)',    bg: 'var(--surface-sunken)',  badge: 'neutral' },
  otro:       { color: 'var(--text-tertiary)',     bg: 'var(--surface-sunken)',  badge: 'neutral' },
};

export const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 44,
};

export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
} as const;

export type IconSizeKey = keyof typeof ICON_SIZES;
```

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/tokens.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/components/portal-ui/tokens.ts
git commit -m "feat(portal-ui): tokens.ts (EVENT_TYPE_COLORS, AVATAR_SIZES, ICON_SIZES) (2B-2)"
```

---

## Task 12 — Actualizar `index.ts` con re-exports

**Files:**
- Modify: `src/components/portal-ui/index.ts`

- [ ] **Step 1: Leer el index actual**

Ya exporta: layout helpers (2A), Icon/Button/Badge/Chip primitives, Card/SectionHeader/EmptyState patterns (2B-1).

- [ ] **Step 2: Extender**

REEMPLAZAR el contenido completo con:

```ts
/**
 * Portal Design System — public entrypoint.
 *
 * Consumidores:
 *   import { KpiCard, DataTable, FilterBar } from '@/components/portal-ui';
 */

// ─── Layout (Fase 2A) ──────────────────────────────────────────────────
export { default as PageContainer } from './patterns/layout/PageContainer';
export { default as PageSection }   from './patterns/layout/PageSection';
export { default as GridStretch }   from './patterns/layout/GridStretch';

export type { PageContainerProps } from './patterns/layout/PageContainer';
export type { PageSectionProps }   from './patterns/layout/PageSection';
export type { GridStretchProps }   from './patterns/layout/GridStretch';

// ─── Primitives ────────────────────────────────────────────────────────
export { default as Icon }    from './primitives/Icon';
export { default as Button }  from './primitives/Button';
export { default as Badge }   from './primitives/Badge';
export { default as Chip }    from './primitives/Chip';
export { default as Avatar }  from './primitives/Avatar';
export { default as Divider } from './primitives/Divider';

export type { IconProps, IconSize }                     from './primitives/Icon';
export type { ButtonProps, ButtonVariant, ButtonSize }  from './primitives/Button';
export type { BadgeProps, BadgeVariant, BadgeSize }     from './primitives/Badge';
export type { ChipProps }                               from './primitives/Chip';
export type { AvatarProps, AvatarSize, AvatarStatus }   from './primitives/Avatar';
export type { DividerProps }                            from './primitives/Divider';

// ─── Patterns ──────────────────────────────────────────────────────────
export { default as Card }              from './patterns/Card';
export { default as SectionHeader }     from './patterns/SectionHeader';
export { default as EmptyState }        from './patterns/EmptyState';
export { default as StatChip }          from './patterns/StatChip';
export { default as ProgressBar }       from './patterns/ProgressBar';
export { default as FilterBar }         from './patterns/FilterBar';
export { default as Toolbar }           from './patterns/Toolbar';
export { default as KpiCard }           from './patterns/KpiCard';
export { default as RankRow }           from './patterns/RankRow';
export { default as ActivityEventCard } from './patterns/ActivityEventCard';
export { default as DataTable }         from './patterns/DataTable';

export type { CardProps }                              from './patterns/Card';
export type { SectionHeaderProps, HeadingLevel }       from './patterns/SectionHeader';
export type { EmptyStateProps, EmptyStateSize }        from './patterns/EmptyState';
export type { StatChipProps, StatChipTone }            from './patterns/StatChip';
export type { ProgressBarProps, ProgressBarSize }      from './patterns/ProgressBar';
export type { FilterOption, FilterBarProps }           from './patterns/FilterBar';
export type { ToolbarProps }                           from './patterns/Toolbar';
export type { KpiCardProps, KpiTrend }                 from './patterns/KpiCard';
export type { RankRowProps, RankRowMetric, RankRowIndicator } from './patterns/RankRow';
export type { ActivityEventCardProps, EventType }      from './patterns/ActivityEventCard';
export type { DataTableProps, DataTableColumn, SortDirection } from './patterns/DataTable';

// ─── Tokens JS ─────────────────────────────────────────────────────────
export { EVENT_TYPE_COLORS, AVATAR_SIZES, ICON_SIZES } from './tokens';
export type { IconSizeKey } from './tokens';
```

- [ ] **Step 3: Typecheck + lint**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/index.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/components/portal-ui/index.ts
git commit -m "feat(portal-ui): index re-exports para Fase 2B-2 extractions"
```

---

## Self-review

- **Spec coverage:** 10 componentes de Fase 2B extractions (KpiCard, StatChip, RankRow, ActivityEventCard, ProgressBar, FilterBar, Toolbar, DataTable, Avatar, Divider) + tokens.ts + index. Cubierto.
- **Placeholder scan:** sin TBDs. Bloques de código completos en cada task.
- **Type consistency:** `EventType`/`AvatarSize`/`BadgeVariant` referenciados desde tokens.ts vía import de los archivos donde se declaran. `LucideIcon` type se usa consistentemente. `uColor` helper existe en `@/lib/portal/utils` (verificado en sesión anterior).
- **Riesgos:**
  - Task 9 declara `EVENT_TONE` inline, luego Task 11 crea `EVENT_TYPE_COLORS` con misma info. Duplicación aceptada porque Task 9 no depende de Task 11 (evita bloqueo). Post-migración se puede consolidar.
  - `next/image` requiere hostnames en `next.config.ts` — ya configurado para Supabase Storage en Fase 1.
