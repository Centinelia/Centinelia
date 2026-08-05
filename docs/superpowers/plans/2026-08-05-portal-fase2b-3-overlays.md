# Portal Design System — Fase 2B-3: Interactive + Overlays

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended).

**Goal:** Construir los 9 componentes interactive + overlays del design system: `Input`, `Textarea`, `Label`, `Dialog`, `Toast`, `Dropdown`, `Popover` (wrap del existente), `Tabs`, `Sheet`.

**Architecture:** Overlays basados en `@radix-ui/react-*` (Dialog, DropdownMenu, Tabs) + `sonner` para Toast + Radix Popover ya instalado. Los form primitives (Input/Textarea/Label) son `'use client'` porque manejan focus/blur/change. Sheet reusa Dialog con slide transition.

**Tech Stack:** Next.js 16, React 19, Radix UI, sonner, Tailwind v4, tokens CSS.

## Global Constraints

- Nuevas deps: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs` — instalar en Task 0
- Dep existente reutilizada: `@radix-ui/react-popover` (Task 7 solo wrap con tokens)
- Dep existente reutilizada: `sonner` (Task 5 wrap con Toaster provider + shortcut helpers)
- CSS vars: `--surface-*`, `--text-*`, `--accent-*`, `--border-*`, `--shadow-*`, `--motion-*`, `--radius-*`
- Focus rings con `--shadow-focus` en todos los interactivos
- `motion-reduce:transition-none` obligatorio
- Sin emojis, sin em-dash, sin "IA" visible; acentos ES correctos
- Backdrops: `bg-black/40 backdrop-blur-sm`
- No modificar páginas del portal (esa es Fase 3+)

---

## File Structure

**Nuevos archivos:**

| Archivo | Ubicación |
|---|---|
| `Input.tsx` | `src/components/portal-ui/primitives/` |
| `Textarea.tsx` | `src/components/portal-ui/primitives/` |
| `Label.tsx` | `src/components/portal-ui/primitives/` |
| `Dialog.tsx` | `src/components/portal-ui/overlays/` |
| `Toast.tsx` (Toaster + helpers) | `src/components/portal-ui/overlays/` |
| `Dropdown.tsx` | `src/components/portal-ui/overlays/` |
| `Popover.tsx` (wrap del existente) | `src/components/portal-ui/overlays/` |
| `Tabs.tsx` | `src/components/portal-ui/overlays/` |
| `Sheet.tsx` | `src/components/portal-ui/overlays/` |

**Modified:** `src/components/portal-ui/index.ts` (Task 10).

---

## Task 0 — Install missing Radix dependencies

- [ ] **Step 1: Install**

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs
```

- [ ] **Step 2: Verify**

```bash
node -e "const p=require('./package.json').dependencies; ['@radix-ui/react-dialog','@radix-ui/react-dropdown-menu','@radix-ui/react-tabs'].forEach(x => console.log(x, p[x] || 'MISSING'))"
```

Esperado: 3 líneas con versiones.

- [ ] **Step 3: Commit lockfile changes**

```bash
git add package.json package-lock.json
git commit -m "deps: install Radix Dialog + DropdownMenu + Tabs for Fase 2B-3"
```

---

## Task 1 — `Label` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Label.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    required?: boolean;
    children: React.ReactNode;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
/**
 * Label — etiqueta semántica <label>. Soporta prop `required` que renderea
 * asterisco de danger color al final del label.
 *
 * Uso:
 *   <Label htmlFor="email" required>Correo</Label>
 *   <Input id="email" ... />
 */

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: React.ReactNode;
}

export default function Label({
  required,
  className,
  children,
  ...rest
}: LabelProps) {
  return (
    <label
      className={[
        'inline-block text-[var(--fs-sm)] font-medium text-[var(--text-secondary)]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
      {required && (
        <span aria-hidden className="ml-0.5 text-[var(--danger)]">*</span>
      )}
    </label>
  );
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Label.tsx
git add src/components/portal-ui/primitives/Label.tsx
git commit -m "feat(portal-ui): Label primitive (semántico + required asterisk) (2B-3)"
```

---

## Task 2 — `Input` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Input.tsx`

**Interfaces:**
- Consumes: `Icon`, `Label`
- Produces:
  ```ts
  import type { LucideIcon } from 'lucide-react';

  export type InputSize = 'md' | 'lg';

  export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    label?: string;
    helper?: string;
    error?: string;
    iconLeft?: LucideIcon;
    iconRight?: LucideIcon;
    inputSize?: InputSize;
    required?: boolean;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import { forwardRef, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import Icon from './Icon';
import Label from './Label';

/**
 * Input — text input con label + helper + error states + iconos opcionales.
 * Sizes: md (36px) o lg (44px, touch-friendly).
 *
 * Uso:
 *   <Input label="Correo" type="email" required />
 *   <Input label="Buscar" iconLeft={Search} placeholder="..." />
 *   <Input label="Password" type="password" error="Muy corto" />
 */

export type InputSize = 'md' | 'lg';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helper?: string;
  error?: string;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  inputSize?: InputSize;
  required?: boolean;
}

const SIZE_CLASS: Record<InputSize, string> = {
  md: 'h-9 text-sm',
  lg: 'h-11 text-sm',
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    helper,
    error,
    iconLeft,
    iconRight,
    inputSize = 'md',
    required,
    className,
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedById = error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined;

  const borderClass = error
    ? 'border-[var(--danger)] focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
    : 'border-[var(--border-default)] focus-visible:border-[var(--accent-default)] focus-visible:shadow-[var(--shadow-focus)]';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-tertiary)]">
            <Icon icon={iconLeft} size={16} aria-hidden />
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          aria-required={required}
          className={[
            'w-full rounded-md bg-[var(--surface-elevated)] border px-3',
            'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
            'transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
            'focus-visible:outline-none',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            SIZE_CLASS[inputSize],
            borderClass,
            iconLeft ? 'pl-9' : '',
            iconRight ? 'pr-9' : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {iconRight && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--text-tertiary)]">
            <Icon icon={iconRight} size={16} aria-hidden />
          </span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-[var(--fs-xs)] text-[var(--danger)]">
          {error}
        </p>
      ) : helper ? (
        <p id={`${inputId}-helper`} className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Input.tsx
git add src/components/portal-ui/primitives/Input.tsx
git commit -m "feat(portal-ui): Input primitive (label + helper + error + icons + a11y) (2B-3)"
```

---

## Task 3 — `Textarea` primitive

**Files:**
- Create: `src/components/portal-ui/primitives/Textarea.tsx`

**Interfaces:**
- Consumes: `Label`
- Produces:
  ```ts
  export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    helper?: string;
    error?: string;
    required?: boolean;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import { forwardRef, useId } from 'react';
import Label from './Label';

/**
 * Textarea — multi-line input con label/helper/error.
 *
 * Uso:
 *   <Textarea label="Descripción" rows={4} />
 *   <Textarea label="Notas" helper="Máximo 500 caracteres" maxLength={500} />
 */

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    helper,
    error,
    required,
    className,
    id,
    rows = 4,
    disabled,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const tid = id ?? autoId;
  const describedById = error ? `${tid}-error` : helper ? `${tid}-helper` : undefined;

  const borderClass = error
    ? 'border-[var(--danger)] focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
    : 'border-[var(--border-default)] focus-visible:border-[var(--accent-default)] focus-visible:shadow-[var(--shadow-focus)]';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <Label htmlFor={tid} required={required}>
          {label}
        </Label>
      )}
      <textarea
        ref={ref}
        id={tid}
        rows={rows}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        aria-required={required}
        className={[
          'w-full rounded-md bg-[var(--surface-elevated)] border px-3 py-2 text-sm resize-y min-h-[80px]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
          'transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
          'focus-visible:outline-none',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          borderClass,
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {error ? (
        <p id={`${tid}-error`} role="alert" className="text-[var(--fs-xs)] text-[var(--danger)]">
          {error}
        </p>
      ) : helper ? (
        <p id={`${tid}-helper`} className="text-[var(--fs-xs)] text-[var(--text-tertiary)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

export default Textarea;
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/primitives/Textarea.tsx
git add src/components/portal-ui/primitives/Textarea.tsx
git commit -m "feat(portal-ui): Textarea primitive (label + helper + error) (2B-3)"
```

---

## Task 4 — `Dialog` overlay

**Files:**
- Create: `src/components/portal-ui/overlays/Dialog.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-dialog`, `Icon`, `X` from lucide
- Produces:
  ```ts
  export type DialogSize = 'sm' | 'md' | 'lg';

  export interface DialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    size?: DialogSize;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import Icon from '../primitives/Icon';

/**
 * Dialog — modal centered con backdrop blur, close X, y footer opcional.
 * Sizes: sm (400px), md (600px), lg (800px).
 *
 * Uso:
 *   <Dialog open={open} onOpenChange={setOpen} title="Confirmar">
 *     <p>¿Estás seguro?</p>
 *   </Dialog>
 */

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: DialogSize;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[600px]',
  lg: 'max-w-[800px]',
};

export default function Dialog({
  open,
  onOpenChange,
  size = 'md',
  title,
  description,
  children,
  footer,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none"
        />
        <RadixDialog.Content
          className={[
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-hidden',
            'flex flex-col rounded-2xl bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 motion-reduce:animate-none',
            SIZE_CLASS[size],
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-[var(--fs-xl)] font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-[var(--fs-sm)] text-[var(--text-secondary)]">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <Icon icon={X} size={18} aria-hidden />
            </RadixDialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 text-[var(--fs-base)] text-[var(--text-secondary)]">
            {children}
          </div>
          {footer && (
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)]">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/overlays/Dialog.tsx
git add src/components/portal-ui/overlays/Dialog.tsx
git commit -m "feat(portal-ui): Dialog overlay (Radix + tokens, 3 sizes, close X) (2B-3)"
```

---

## Task 5 — `Toast` overlay (Sonner wrap)

**Files:**
- Create: `src/components/portal-ui/overlays/Toast.tsx`

**Interfaces:**
- Consumes: `sonner`
- Produces:
  ```ts
  // Re-export helper for toast calls
  export { toast } from 'sonner';
  export { default as Toaster } from './Toast';  // <Toaster /> provider
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * Toaster — provider global de notificaciones. Montar en el layout root
 * (o en PortalShell) una sola vez.
 *
 * Uso de helper:
 *   import { toast } from '@/components/portal-ui';
 *   toast.success('Guardado');
 *   toast.error('Falló la operación');
 *   toast.info('Nuevo mensaje');
 *   toast.warning('Cuidado con eso');
 */

export { toast };

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      closeButton
      richColors
      toastOptions={{
        className: 'font-[var(--font-body)]',
        style: {
          background: 'var(--surface-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        },
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/overlays/Toast.tsx
git add src/components/portal-ui/overlays/Toast.tsx
git commit -m "feat(portal-ui): Toast overlay (sonner + tokens, bottom-right rich colors) (2B-3)"
```

---

## Task 6 — `Dropdown` overlay

**Files:**
- Create: `src/components/portal-ui/overlays/Dropdown.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-dropdown-menu`
- Produces: compound export `Dropdown.Root/.Trigger/.Content/.Item/.Label/.Separator`

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import * as RadixDropdown from '@radix-ui/react-dropdown-menu';

/**
 * Dropdown — menú contextual (Radix DropdownMenu).
 *
 * Uso:
 *   <Dropdown.Root>
 *     <Dropdown.Trigger asChild>
 *       <Button variant="ghost">Menú</Button>
 *     </Dropdown.Trigger>
 *     <Dropdown.Content>
 *       <Dropdown.Label>Acciones</Dropdown.Label>
 *       <Dropdown.Item onSelect={handleEdit}>Editar</Dropdown.Item>
 *       <Dropdown.Item onSelect={handleDelete}>Borrar</Dropdown.Item>
 *       <Dropdown.Separator />
 *       <Dropdown.Item disabled>Archivar</Dropdown.Item>
 *     </Dropdown.Content>
 *   </Dropdown.Root>
 */

const Root = RadixDropdown.Root;
const Trigger = RadixDropdown.Trigger;
const Portal = RadixDropdown.Portal;

const Content: React.FC<React.ComponentProps<typeof RadixDropdown.Content>> = ({
  className,
  sideOffset = 4,
  ...rest
}) => (
  <RadixDropdown.Portal>
    <RadixDropdown.Content
      sideOffset={sideOffset}
      className={[
        'z-50 min-w-[180px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-md)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  </RadixDropdown.Portal>
);

const Item: React.FC<React.ComponentProps<typeof RadixDropdown.Item>> = ({
  className,
  ...rest
}) => (
  <RadixDropdown.Item
    className={[
      'flex items-center gap-2 rounded-md px-3 py-2 text-[var(--fs-sm)] text-[var(--text-primary)]',
      'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
      'data-[highlighted]:bg-[var(--surface-sunken)] data-[highlighted]:outline-none',
      'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
      'cursor-pointer',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  />
);

const Label: React.FC<React.ComponentProps<typeof RadixDropdown.Label>> = ({
  className,
  ...rest
}) => (
  <RadixDropdown.Label
    className={[
      'px-3 py-1.5 text-[var(--fs-xs)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)]',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  />
);

const Separator: React.FC<React.ComponentProps<typeof RadixDropdown.Separator>> = ({
  className,
  ...rest
}) => (
  <RadixDropdown.Separator
    className={['my-1 h-px bg-[var(--border-subtle)]', className ?? '']
      .filter(Boolean)
      .join(' ')}
    {...rest}
  />
);

const Dropdown = { Root, Trigger, Portal, Content, Item, Label, Separator };
export default Dropdown;
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/overlays/Dropdown.tsx
git add src/components/portal-ui/overlays/Dropdown.tsx
git commit -m "feat(portal-ui): Dropdown overlay (Radix compound + tokens) (2B-3)"
```

---

## Task 7 — `Popover` overlay (wrap del existente)

**Files:**
- Create: `src/components/portal-ui/overlays/Popover.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-popover` (ya instalado ^1.1.23)

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import * as RadixPopover from '@radix-ui/react-popover';

/**
 * Popover — panel flotante contextual (Radix Popover).
 *
 * Uso:
 *   <Popover.Root>
 *     <Popover.Trigger asChild><Button>Info</Button></Popover.Trigger>
 *     <Popover.Content>
 *       Contenido del popover
 *     </Popover.Content>
 *   </Popover.Root>
 */

const Root = RadixPopover.Root;
const Trigger = RadixPopover.Trigger;
const Portal = RadixPopover.Portal;
const Close = RadixPopover.Close;
const Anchor = RadixPopover.Anchor;
const Arrow = RadixPopover.Arrow;

const Content: React.FC<React.ComponentProps<typeof RadixPopover.Content>> = ({
  className,
  sideOffset = 8,
  ...rest
}) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      sideOffset={sideOffset}
      className={[
        'z-50 max-w-[320px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-md)]',
        'text-[var(--fs-sm)] text-[var(--text-primary)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none',
        'focus-visible:outline-none',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  </RadixPopover.Portal>
);

const Popover = { Root, Trigger, Portal, Close, Anchor, Arrow, Content };
export default Popover;
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/overlays/Popover.tsx
git add src/components/portal-ui/overlays/Popover.tsx
git commit -m "feat(portal-ui): Popover overlay wrap (Radix + tokens) (2B-3)"
```

---

## Task 8 — `Tabs` overlay

**Files:**
- Create: `src/components/portal-ui/overlays/Tabs.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-tabs`
- Produces: 2 variants (`pill` y `underline`) via context prop en Root

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { createContext, useContext } from 'react';

/**
 * Tabs — dos variants: pill (rounded bg) o underline (border-b active).
 *
 * Uso:
 *   <Tabs.Root defaultValue="a" variant="pill">
 *     <Tabs.List>
 *       <Tabs.Trigger value="a">Uno</Tabs.Trigger>
 *       <Tabs.Trigger value="b">Dos</Tabs.Trigger>
 *     </Tabs.List>
 *     <Tabs.Content value="a">Contenido A</Tabs.Content>
 *     <Tabs.Content value="b">Contenido B</Tabs.Content>
 *   </Tabs.Root>
 */

export type TabsVariant = 'pill' | 'underline';

const VariantCtx = createContext<TabsVariant>('pill');

interface RootProps extends React.ComponentProps<typeof RadixTabs.Root> {
  variant?: TabsVariant;
}

const Root: React.FC<RootProps> = ({ variant = 'pill', className, children, ...rest }) => (
  <VariantCtx.Provider value={variant}>
    <RadixTabs.Root className={className} {...rest}>
      {children}
    </RadixTabs.Root>
  </VariantCtx.Provider>
);

const List: React.FC<React.ComponentProps<typeof RadixTabs.List>> = ({
  className,
  ...rest
}) => {
  const variant = useContext(VariantCtx);
  const base = variant === 'pill'
    ? 'inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] p-1'
    : 'inline-flex items-center gap-1 border-b border-[var(--border-subtle)]';
  return (
    <RadixTabs.List
      className={[base, className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    />
  );
};

const Trigger: React.FC<React.ComponentProps<typeof RadixTabs.Trigger>> = ({
  className,
  ...rest
}) => {
  const variant = useContext(VariantCtx);
  const base = variant === 'pill'
    ? 'inline-flex h-8 items-center rounded-md px-3 text-[var(--fs-sm)] font-medium text-[var(--text-secondary)] data-[state=active]:bg-[var(--surface-elevated)] data-[state=active]:text-[var(--text-accent)] data-[state=active]:shadow-[var(--shadow-xs)]'
    : 'inline-flex h-9 items-center border-b-2 border-transparent px-3 text-[var(--fs-sm)] font-medium text-[var(--text-secondary)] -mb-px data-[state=active]:border-[var(--accent-default)] data-[state=active]:text-[var(--text-accent)]';
  return (
    <RadixTabs.Trigger
      className={[
        base,
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
        'cursor-pointer',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
};

const Content: React.FC<React.ComponentProps<typeof RadixTabs.Content>> = ({
  className,
  ...rest
}) => (
  <RadixTabs.Content
    className={['pt-4 focus-visible:outline-none', className ?? ''].filter(Boolean).join(' ')}
    {...rest}
  />
);

const Tabs = { Root, List, Trigger, Content };
export default Tabs;
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/overlays/Tabs.tsx
git add src/components/portal-ui/overlays/Tabs.tsx
git commit -m "feat(portal-ui): Tabs overlay (Radix + pill/underline variants) (2B-3)"
```

---

## Task 9 — `Sheet` overlay

**Files:**
- Create: `src/components/portal-ui/overlays/Sheet.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-dialog` (same base as Dialog, con slide animation)
- Produces:
  ```ts
  export type SheetSide = 'right' | 'left' | 'bottom' | 'top';
  export type SheetSize = 'sm' | 'md' | 'lg';

  export interface SheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    side?: SheetSide;
    size?: SheetSize;
    title?: string;
    description?: string;
    children: React.ReactNode;
  }
  ```

- [ ] **Step 1: Crear el archivo**

```tsx
'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import Icon from '../primitives/Icon';

/**
 * Sheet — drawer lateral (right/left/bottom/top). Basado en Radix Dialog
 * con transición slide.
 *
 * Uso:
 *   <Sheet open={open} onOpenChange={setOpen} side="right" title="Filtros">
 *     <FilterBar ... />
 *   </Sheet>
 */

export type SheetSide = 'right' | 'left' | 'bottom' | 'top';
export type SheetSize = 'sm' | 'md' | 'lg';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: SheetSide;
  size?: SheetSize;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

const SIDE_POSITION: Record<SheetSide, string> = {
  right:  'fixed right-0 top-0 h-full border-l',
  left:   'fixed left-0 top-0 h-full border-r',
  bottom: 'fixed bottom-0 left-0 right-0 max-h-[85vh] border-t rounded-t-2xl',
  top:    'fixed top-0 left-0 right-0 max-h-[85vh] border-b rounded-b-2xl',
};

const SIDE_ANIMATION: Record<SheetSide, string> = {
  right:  'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  left:   'data-[state=open]:slide-in-from-left  data-[state=closed]:slide-out-to-left',
  bottom: 'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
  top:    'data-[state=open]:slide-in-from-top    data-[state=closed]:slide-out-to-top',
};

const HORIZONTAL_SIZE: Record<SheetSize, string> = {
  sm: 'w-[320px]',
  md: 'w-[480px]',
  lg: 'w-[640px]',
};

export default function Sheet({
  open,
  onOpenChange,
  side = 'right',
  size = 'md',
  title,
  description,
  children,
}: SheetProps) {
  const isHorizontal = side === 'right' || side === 'left';
  const sizeClass = isHorizontal ? HORIZONTAL_SIZE[size] : 'w-full';

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none" />
        <RadixDialog.Content
          className={[
            'z-50 flex flex-col bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] border-[var(--border-subtle)]',
            SIDE_POSITION[side],
            sizeClass,
            'data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none',
            SIDE_ANIMATION[side],
          ].join(' ')}
        >
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
              <div className="min-w-0 flex-1">
                {title && (
                  <RadixDialog.Title className="text-[var(--fs-xl)] font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                    {title}
                  </RadixDialog.Title>
                )}
                {description && (
                  <RadixDialog.Description className="mt-1 text-[var(--fs-sm)] text-[var(--text-secondary)]">
                    {description}
                  </RadixDialog.Description>
                )}
              </div>
              <RadixDialog.Close
                aria-label="Cerrar"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]"
              >
                <Icon icon={X} size={18} aria-hidden />
              </RadixDialog.Close>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/overlays/Sheet.tsx
git add src/components/portal-ui/overlays/Sheet.tsx
git commit -m "feat(portal-ui): Sheet overlay (drawer right/left/bottom/top con slide) (2B-3)"
```

---

## Task 10 — Update `index.ts` con Fase 2B-3

**Files:**
- Modify: `src/components/portal-ui/index.ts`

- [ ] **Step 1: Append al final del index**

Al final del archivo actual, DESPUÉS del bloque de tokens JS, agregar:

```ts
// ─── Primitives (Fase 2B-3) ────────────────────────────────────────────
export { default as Label }    from './primitives/Label';
export { default as Input }    from './primitives/Input';
export { default as Textarea } from './primitives/Textarea';

export type { LabelProps }              from './primitives/Label';
export type { InputProps, InputSize }   from './primitives/Input';
export type { TextareaProps }           from './primitives/Textarea';

// ─── Overlays (Fase 2B-3) ──────────────────────────────────────────────
export { default as Dialog }   from './overlays/Dialog';
export { default as Dropdown } from './overlays/Dropdown';
export { default as Popover }  from './overlays/Popover';
export { default as Tabs }     from './overlays/Tabs';
export { default as Sheet }    from './overlays/Sheet';

export type { DialogProps, DialogSize } from './overlays/Dialog';
export type { SheetProps, SheetSide, SheetSize } from './overlays/Sheet';
export type { TabsVariant } from './overlays/Tabs';

// Toast: helper + provider
export { default as Toaster, toast } from './overlays/Toast';
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
npx tsc --noEmit
npx eslint src/components/portal-ui/index.ts
git add src/components/portal-ui/index.ts
git commit -m "feat(portal-ui): index re-exports para Fase 2B-3 overlays"
```

---

## Self-review

- **Spec coverage:** 9 componentes (Input, Textarea, Label, Dialog, Toast, Dropdown, Popover, Tabs, Sheet) + Toaster + toast helper + install deps.
- **Placeholder scan:** sin TBDs. Todos los bloques de código completos.
- **Type consistency:** Radix compound patterns idénticos (Root/Content/Item/etc.).
- **Riesgos:**
  - Tailwind data-* animations (`data-[state=open]:animate-in`, etc.) requieren plugin `tailwindcss-animate` — verificar si está o si Tailwind v4 los ofrece nativamente. Si no funcionan, cambiar por transiciones CSS puras.
  - Sonner viene con estilos globales; verificar que no colisionan con tokens custom.
