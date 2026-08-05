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
