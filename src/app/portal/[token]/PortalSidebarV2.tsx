'use client';

import Link from 'next/link';
import {
  Home,
  Inbox,
  Clock,
  Users,
  Settings,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import {
  buildPortalAreas,
  type Area,
  type BuildAreasInput,
} from '@/lib/portal/portal-v2-areas';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Inbox,
  Clock,
  Users,
  Settings,
};

export interface PortalStatus {
  plan?: string | null;
  minutesRemain?: number | null;
  minutesIncluded?: number | null;
}

export interface PortalSidebarV2Props extends BuildAreasInput {
  currentPath: string;
  status?: PortalStatus;
}

function isAreaActive(area: Area, currentPath: string): boolean {
  // Areas with sub-items match only via their sub-items to avoid href collisions.
  // Areas without sub-items (like Escritorio) match on exact bare path.
  if (area.subItems.length > 0) {
    return area.subItems.some(s => currentPath.startsWith(s.href.split('?')[0]));
  }
  const areaBase = area.href.split('?')[0];
  return currentPath === areaBase;
}

function isSubActive(subHref: string, currentPath: string): boolean {
  return currentPath.startsWith(subHref.split('?')[0]);
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFB]';

export default function PortalSidebarV2(props: PortalSidebarV2Props) {
  const { currentPath, status, ...input } = props;
  const areas = buildPortalAreas(input);

  return (
    <nav
      aria-label="Navegación principal"
      className="flex h-full w-[260px] shrink-0 flex-col border-r border-neutral-200/80 bg-[#FAFAFB]"
    >
      {/* Lista de áreas */}
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {areas.map(area => {
          const Icon = ICON_MAP[area.iconName] ?? Home;
          const active = isAreaActive(area, currentPath);
          const showSubs = active && area.subItems.length > 0;

          return (
            <li key={area.id} className="flex flex-col">
              <Link
                href={area.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group relative flex h-11 items-center gap-3 rounded-md px-3',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  active
                    ? 'bg-[#F3EFFF] text-[#6C3BFF] font-semibold'
                    : 'text-neutral-700 font-medium hover:bg-neutral-100 hover:text-neutral-900',
                  FOCUS_RING,
                ].join(' ')}
              >
                {/* Border-l indicator (signature Shopify) -- solo cuando activo */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-[#6C3BFF]"
                  />
                )}

                <Icon
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden
                  className={
                    active
                      ? 'text-[#6C3BFF]'
                      : 'text-neutral-500 group-hover:text-neutral-700'
                  }
                />
                <span className="flex-1 truncate text-[14px] leading-none">
                  {area.label}
                </span>
                {area.subItems.length > 0 && (
                  <ChevronRight
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className={[
                      'shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                      active
                        ? 'rotate-90 text-[#6C3BFF]'
                        : 'text-neutral-400 group-hover:text-neutral-600',
                    ].join(' ')}
                  />
                )}
              </Link>

              {showSubs && (
                <ul className="mt-1 space-y-0.5 pb-1">
                  {area.subItems.map(sub => {
                    const subActive = isSubActive(sub.href, currentPath);
                    return (
                      <li key={sub.href}>
                        <Link
                          href={sub.href}
                          aria-current={subActive ? 'page' : undefined}
                          className={[
                            'flex h-9 items-center rounded-md pl-11 pr-3 text-[13px] leading-none',
                            'transition-colors duration-150 ease-out motion-reduce:transition-none',
                            subActive
                              ? 'bg-[#F3EFFF] font-medium text-[#6C3BFF]'
                              : 'font-normal text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                            FOCUS_RING,
                          ].join(' ')}
                        >
                          {sub.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Status chip (Stripe-style status pinned al fondo) */}
      {status && (status.plan || typeof status.minutesRemain === 'number') && (
        <div className="border-t border-neutral-200/80 px-4 py-3">
          <div className="flex flex-col gap-1">
            {status.plan && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {status.plan}
              </span>
            )}
            {typeof status.minutesRemain === 'number' &&
              typeof status.minutesIncluded === 'number' && (
                <span className="text-[13px] font-semibold tabular-nums text-[#1A0A3B]">
                  {status.minutesRemain} / {status.minutesIncluded} min
                </span>
              )}
          </div>
        </div>
      )}
    </nav>
  );
}
