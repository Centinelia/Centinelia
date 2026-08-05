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
