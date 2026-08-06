'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import OficinaSidebar from './OficinaSidebar';

interface Props {
  token: string;
  badges?: Record<string, number>;
  minutesRemain?: number;
  minutesIncluded?: number;
  aiOpsUsed?: number;
  aiOpsLimit?: number;
  hasStripe?: boolean;
  vertical?: string;
  modules?: string[];
}

export default function OficinaMobileNav(props: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir navegación de oficina"
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF]"
          style={{ color: 'var(--c-text-2)' }}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none md:hidden" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={[
            'fixed left-0 top-0 z-50 h-full w-[min(88vw,320px)] flex flex-col shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
            'motion-reduce:animate-none md:hidden',
          ].join(' ')}
          style={{ background: 'var(--c-modal)' }}
        >
          <RadixDialog.Title className="sr-only">Navegación de la oficina</RadixDialog.Title>
          <div className="flex h-12 items-center justify-between px-4 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--c-text-3)' }}>
              Oficina
            </span>
            <RadixDialog.Close
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF]"
              style={{ color: 'var(--c-text-2)' }}
            >
              <X size={18} strokeWidth={1.75} aria-hidden />
            </RadixDialog.Close>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto [&>aside]:!static [&>aside]:!flex [&>aside]:!w-full [&>aside]:!h-auto [&>aside]:!border-r-0 [&>aside]:!z-auto">
            <OficinaSidebar {...props} />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
