'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import OficinaSidebarV2 from './OficinaSidebarV2';

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
  hasInvoicing?: boolean;
}

/**
 * Mobile trigger + drawer para la sidebar V2 de Oficina.
 * Trigger visible en `< md`; drawer reutiliza OficinaSidebarV2 (dark) con
 * los estilos del <aside> neutralizados para que el drawer controle layout.
 */
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
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
          style={{ background: '#1A0A3B' }}
        >
          <RadixDialog.Title className="sr-only">Navegación de la oficina</RadixDialog.Title>
          <div
            className="flex h-12 items-center justify-between px-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
              Oficina
            </span>
            <RadixDialog.Close
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/75 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <X size={18} strokeWidth={1.75} aria-hidden />
            </RadixDialog.Close>
          </div>
          <div className="flex-1 min-h-0 flex flex-col [&>aside]:!static [&>aside]:!flex [&>aside]:!w-full [&>aside]:!h-full [&>aside]:!border-r-0 [&>aside]:!flex-1 [&>aside]:!min-h-0 [&>aside]:!z-auto">
            <OficinaSidebarV2 {...props} />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
