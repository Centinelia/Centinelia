'use client';

import Image from 'next/image';

export interface PortalHeaderProps {
  businessName: string;
  logoUrl?: string | null;
  children?: React.ReactNode;
}

export default function PortalHeader({ businessName, logoUrl, children }: PortalHeaderProps) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#1A0A3B] px-4 text-white shadow-[0_1px_0_0_rgba(0,0,0,0.2)]"
    >
      {/* Logo (o placeholder) */}
      {logoUrl ? (
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white/[0.04] ring-1 ring-white/10">
          <Image
            src={logoUrl}
            alt=""
            width={32}
            height={32}
            className="max-h-full max-w-full object-contain"
            aria-hidden
          />
        </div>
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.08] ring-1 ring-white/10"
          aria-hidden
        >
          <span className="text-[13px] font-semibold text-white/80">
            {businessName.trim().charAt(0).toUpperCase() || 'C'}
          </span>
        </div>
      )}

      {/* Workspace identity: eyebrow + business name */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Tu oficina digital
        </span>
        <span
          className="truncate text-sm font-semibold leading-tight text-[#FAFBFF]"
          title={businessName}
        >
          {businessName}
        </span>
      </div>

      {/* Right slot: user controls injected by the parent page */}
      {children && (
        <div className="ml-auto flex items-center gap-2">
          {children}
        </div>
      )}
    </header>
  );
}
