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
