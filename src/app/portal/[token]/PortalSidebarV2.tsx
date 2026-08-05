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
  minutesRemain?: number | null;
  minutesIncluded?: number | null;
}

export interface PortalSidebarV2Props extends BuildAreasInput {
  currentPath: string;
  currentSearch?: string;   // e.g. "tab=negocio" or "" — no leading '?'
  status?: PortalStatus;
}

function isSubActive(subHref: string, currentPath: string, currentSearch: string): boolean {
  const [subPath, subQuery] = subHref.split('?');
  if (subQuery) {
    // Sub-item points to a query-parameterized view (e.g. /portal/[t]?tab=negocio).
    // Match only when path matches EXACTLY and the query token appears in current search.
    if (currentPath !== subPath) return false;
    // subQuery is like "tab=negocio"; currentSearch could be "tab=negocio" or "tab=negocio&x=1"
    return currentSearch.split('&').some(kv => kv === subQuery);
  }
  return currentPath.startsWith(subPath);
}

function isAreaActive(area: Area, currentPath: string, currentSearch: string): boolean {
  // Areas with sub-items match only via their sub-items to avoid href collisions.
  // Areas without sub-items (like Escritorio) match on exact bare path.
  if (area.subItems.length > 0) {
    return area.subItems.some(s => isSubActive(s.href, currentPath, currentSearch));
  }
  const areaBase = area.href.split('?')[0];
  return currentPath === areaBase;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFB]';

export default function PortalSidebarV2(props: PortalSidebarV2Props) {
  const { currentPath, currentSearch = '', status, ...input } = props;
  const areas = buildPortalAreas(input);

  return (
    <nav
      aria-label="Navegación principal"
      className="flex w-[260px] shrink-0 flex-col self-stretch border-r border-neutral-200/80 bg-[#FAFAFB] pb-20"
    >
      {/* Lista de áreas */}
      <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {areas.map(area => {
          const Icon = ICON_MAP[area.iconName] ?? Home;
          const active = isAreaActive(area, currentPath, currentSearch);
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
                    const subActive = isSubActive(sub.href, currentPath, currentSearch);
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

      {/* Chip inferior: minutos disponibles del mes */}
      {status &&
        typeof status.minutesRemain === 'number' &&
        typeof status.minutesIncluded === 'number' && (
          <div className="border-t border-neutral-200/80 px-4 py-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Minutos disponibles
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-[#1A0A3B]">
                {status.minutesRemain} / {status.minutesIncluded} min
              </span>
            </div>
          </div>
        )}
    </nav>
  );
}
