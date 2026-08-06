'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import PortalSidebarV2Client from './PortalSidebarV2Client';
import type { PortalSidebarV2Props } from './PortalSidebarV2';

type Props = Omit<PortalSidebarV2Props, 'currentPath' | 'currentSearch'>;

/**
 * Mobile-only nav trigger + drawer. Renders a hamburger button in the header
 * (visible < lg) that opens a full-height sidebar in a Radix Dialog.
 * Auto-closes on route change so tapping a link navigates and closes the drawer.
 */
export default function PortalMobileNav(props: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir navegación"
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none lg:hidden" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={[
            'fixed left-0 top-0 z-50 h-full w-[min(88vw,320px)] flex flex-col bg-[#FAFAFB] shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
            'motion-reduce:animate-none lg:hidden',
          ].join(' ')}
        >
          <RadixDialog.Title className="sr-only">Navegación del portal</RadixDialog.Title>
          <div className="flex h-14 items-center justify-between border-b border-neutral-200/80 px-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Navegación
            </span>
            <RadixDialog.Close
              aria-label="Cerrar navegación"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF]"
            >
              <X size={18} strokeWidth={1.75} aria-hidden />
            </RadixDialog.Close>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Reuse the exact V2 sidebar. Its own sticky/height styles are
                neutralized by wrapper (drawer already provides them). */}
            <div className="[&>nav]:!static [&>nav]:!h-auto [&>nav]:!w-full [&>nav]:!border-r-0">
              <PortalSidebarV2Client {...props} />
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
