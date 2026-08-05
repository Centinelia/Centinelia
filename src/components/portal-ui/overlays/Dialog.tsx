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
