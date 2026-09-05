'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Bot,
  Briefcase,
  Phone,
  CircleUser,
  Users,
  Package,
  ChevronDown,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import Meerkat from '@/components/icons/Meerkat';
import {
  buildPortalNav,
  type BuildNavInput,
  type NavGroup,
} from '@/lib/portal/portal-v2-areas';
import { uColor } from '@/lib/portal/utils';
import { pulseAnchor } from '@/lib/portal/highlight-anchor';

// ─── Icon registry ─────────────────────────────────────────────────────────────

// LucideIcon-compatible custom icons son válidos: solo requieren aceptar
// `size`, `strokeWidth`, `className`, `style` como props de SVG.
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Bot,
  Briefcase,
  Phone,
  CircleUser,
  Users,
  Package,
  Meerkat: Meerkat as unknown as LucideIcon,
};

// ─── Public props ──────────────────────────────────────────────────────────────

export interface PortalStatus {
  minutesRemain?: number | null;
  minutesIncluded?: number | null;
  aiOpsUsed?: number | null;
  aiOpsLimit?: number | null;
  hasStripe?: boolean;
}

export interface PortalSidebarV2Props extends BuildNavInput {
  currentPath: string;
  currentSearch?: string; // e.g. "tab=negocio" — no leading '?'
  status?: PortalStatus;
}

// ─── Style constants ────────────────────────────────────────────────────────────

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFB]';

const TRANSITION = 'transition-colors duration-150 ease-out motion-reduce:transition-none';

// ─── Active-state helpers ───────────────────────────────────────────────────────

/**
 * Check whether a single href (possibly with query) is currently active.
 */
function isHrefActive(href: string, path: string, search: string): boolean {
  const [hrefPath, hrefQuery] = href.split('?');
  if (hrefQuery) {
    if (path !== hrefPath) return false;
    return search.split('&').some(kv => kv === hrefQuery);
  }
  // Path-prefix match for nested routes; exact for root-level
  return path === hrefPath || path.startsWith(hrefPath + '/');
}

/**
 * Determine if a group is active given the current URL.
 */
function isGroupActive(group: NavGroup, token: string, path: string, search: string): boolean {
  // Check direct href (exact / prefix)
  if (group.directHref) {
    // Exact match or starts-with for nested paths
    if (path === group.directHref || path.startsWith(group.directHref + '/')) return true;
  }

  // Check tab param
  if (group.tabParam) {
    // path must be /portal/[token] and tab must match
    const portalRoot = `/portal/${token}`;
    if (path === portalRoot) {
      if (search === `tab=${group.tabParam}`) return true;
      // Inicio is the default when no tab param
      if (group.tabParam === 'inicio' && (!search || search === '' || search === 'tab=inicio')) return true;
    }
  }

  // Check flat items
  if (group.items) {
    for (const item of group.items) {
      if (item.href && isHrefActive(item.href, path, search)) return true;
    }
  }

  // Check sub-group items
  if (group.subGroups) {
    for (const sg of group.subGroups) {
      for (const item of sg.items) {
        if (item.href && isHrefActive(item.href, path, search)) return true;
        // anchor items only match when parent is active via tabParam/directHref above
      }
    }
  }

  return false;
}

// ─── Sidebar component ─────────────────────────────────────────────────────────

export default function PortalSidebarV2(props: PortalSidebarV2Props) {
  const { currentPath, currentSearch = '', status, ...input } = props;
  const { token, hasOpsAgent } = input;
  const router = useRouter();

  const groups = buildPortalNav(input);

  // Determine which groups should start open (those that are currently active)
  const initialOpen = groups
    .filter(g => isGroupActive(g, token, currentPath, currentSearch))
    .map(g => g.id);

  const [openIds, setOpenIds] = useState<string[]>(initialOpen);

  // Re-sync open state when URL changes
  useEffect(() => {
    const active = groups
      .filter(g => isGroupActive(g, token, currentPath, currentSearch))
      .map(g => g.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenIds(prev => {
      // Add newly active groups; don't collapse already-open ones
      const next = new Set(prev);
      for (const id of active) next.add(id);
      return Array.from(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, currentSearch]);

  // Scroll-to-anchor + pulse highlight (V1 pattern preserved)
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!pendingIds || pendingIds.length === 0) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > 100) { clearInterval(timer); setPendingIds(null); return; }
      const firstEl = document.getElementById(pendingIds[0]);
      if (!firstEl) return;
      clearInterval(timer);
      setPendingIds(null);
      const rect = firstEl.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
      for (const id of pendingIds) pulseAnchor(id);
    }, 50);
    return () => clearInterval(timer);
  }, [pendingIds]);

  function toggle(id: string) {
    setOpenIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  /**
   * Next.js Link tiene comportamiento inconsistente cuando el nuevo href
   * difiere solo en el hash o cambia searchParams+hash — a veces no dispara
   * router.push, o dispara pushState (que por spec HTML no dispara
   * hashchange). Además la ORDER de user onClick vs Link navigate no es
   * garantizada entre versiones.
   *
   * Fix: prevent default, hacer router.push explícito, luego forzar
   * hashchange manualmente. Con eso: sub-tab switch + scroll + pulse
   * funcionan consistentemente cross sub-tab.
   */
  function handleAnchorClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    anchor?: string,
  ) {
    // Respetar modifier clicks (cmd+click abre nueva pestaña, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (anchor) setPendingIds([anchor]);
    router.push(href, { scroll: false });
    // Dispatch en microtask + segundo dispatch en macrotask para cubrir
    // posibles delays de reconciliation antes de que suscriptores oigan.
    Promise.resolve().then(() => window.dispatchEvent(new Event('hashchange')));
    setTimeout(() => window.dispatchEvent(new Event('hashchange')), 30);
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-14 flex h-[calc(100vh-56px)] w-[260px] shrink-0 flex-col self-start border-r border-neutral-200/80 bg-[#FAFAFB]"
    >
      {/* CTA protagonista: Oficina — el producto, no un item más del nav */}
      {hasOpsAgent && (
        <div className="px-3 pt-4 pb-2">
          <Link
            href={`/portal/${token}/oficina`}
            className={[
              'group relative flex items-center gap-3 rounded-xl px-3 py-1.5',
              'text-white overflow-hidden',
              TRANSITION,
              FOCUS_RING,
            ].join(' ')}
            style={{
              background: 'linear-gradient(135deg, #1A0A3B 0%, #2A1470 50%, #6C3BFF 100%)',
              boxShadow:  '0 6px 20px rgba(108,59,255,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            {/* Logo icon oficial de Centinelia (C + suricata). Padding reducido
                del card para que el logo grande no lo haga crecer. */}
            <img
              src="/logo-icon.png"
              alt=""
              width={72}
              height={72}
              style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0 }}
              draggable={false}
            />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(196,181,253,0.9)' }}>
                Entra a
              </span>
              <span className="text-[15px] font-extrabold leading-tight tracking-tight">
                LA OFICINA
              </span>
              <span className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Tu consola de trabajo
              </span>
            </div>
            <span
              aria-hidden
              className="text-lg transition-transform group-hover:translate-x-0.5"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              →
            </span>
          </Link>
        </div>
      )}

      <ul className={`min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 ${hasOpsAgent ? 'pt-1 pb-4' : 'py-4'}`}>
        {groups.map(group => {
          const Icon = ICON_MAP[group.iconName] ?? LayoutDashboard;
          const active = isGroupActive(group, token, currentPath, currentSearch);
          const open = openIds.includes(group.id);

          // Compute the group header href
          const hasChildren =
            (group.items && group.items.length > 0) ||
            (group.subGroups && group.subGroups.length > 0);

          const headerHref: string = group.directHref
            ? group.directHref
            : group.tabParam
            ? `/portal/${token}?tab=${group.tabParam}`
            : `/portal/${token}`;

          return (
            <li key={group.id} className="flex flex-col">
              {/* Group header row */}
              <div className="relative flex items-center">
                {/* Active border-l */}
                {active && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-[#6C3BFF]"
                  />
                )}

                {/* Group label link */}
                <Link
                  href={headerHref}
                  aria-current={active && !hasChildren ? 'page' : undefined}
                  onClick={() => {
                    if (hasChildren && !open) toggle(group.id);
                  }}
                  className={[
                    'flex h-11 flex-1 items-center gap-3 rounded-md px-3',
                    TRANSITION,
                    FOCUS_RING,
                    active
                      ? 'bg-[#F3EFFF] font-semibold text-[#6C3BFF]'
                      : 'font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
                  ].join(' ')}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden
                    className={active ? 'text-[#6C3BFF]' : 'text-neutral-500'}
                    {...(group.iconName === 'Meerkat' ? { active } as any : {})}
                  />
                  <span className="flex-1 truncate text-[14px] leading-none">
                    {group.label}
                  </span>
                </Link>

                {/* Chevron toggle button (only when there are children) */}
                {hasChildren && (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? `Colapsar ${group.label}` : `Expandir ${group.label}`}
                    onClick={() => toggle(group.id)}
                    className={[
                      'flex h-11 w-10 shrink-0 items-center justify-center rounded-md',
                      TRANSITION,
                      FOCUS_RING,
                      active ? 'text-[#6C3BFF]' : 'text-neutral-400 hover:text-neutral-600',
                    ].join(' ')}
                  >
                    <ChevronDown
                      size={14}
                      strokeWidth={2}
                      aria-hidden
                      className={[
                        'transition-transform duration-200 motion-reduce:transition-none',
                        open ? 'rotate-180' : '',
                      ].join(' ')}
                    />
                  </button>
                )}
              </div>

              {/* Children — only when open */}
              {open && hasChildren && (
                <div className="mt-0.5 pb-1">
                  {/* Flat anchor items */}
                  {group.items && group.items.length > 0 && (
                    <ul className="space-y-0.5">
                      {group.items.map(item => {
                        const itemHref = item.href
                          ? item.href
                          : item.anchor && group.tabParam
                          ? `/portal/${token}?tab=${group.tabParam}#${item.anchor}`
                          : item.anchor
                          ? `#${item.anchor}`
                          : headerHref;

                        const itemActive = item.href
                          ? isHrefActive(item.href, currentPath, currentSearch)
                          : false; // anchor items don't have precise active tracking

                        return (
                          <li key={item.anchor ?? item.href ?? item.label}>
                            <Link
                              href={itemHref}
                              scroll={false}
                              onClick={e => handleAnchorClick(e, itemHref, item.anchor)}
                              aria-current={itemActive ? 'page' : undefined}
                              className={[
                                'flex h-9 items-center rounded-md pl-11 pr-3 text-[13px] leading-none',
                                TRANSITION,
                                FOCUS_RING,
                                itemActive
                                  ? 'bg-[#F3EFFF] font-medium text-[#6C3BFF]'
                                  : 'font-normal text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                              ].join(' ')}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Sub-grouped items (Oficina, Llamadas) */}
                  {group.subGroups && group.subGroups.length > 0 && (
                    <div>
                      {group.subGroups.map(sg => (
                        <div key={sg.label}>
                          {/* Section label */}
                          <p className="pl-11 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                            {sg.label}
                          </p>
                          <ul className="space-y-0.5">
                            {sg.items.map(item => {
                              const itemHref = item.href
                                ? item.href
                                : item.anchor && group.directHref
                                ? `${group.directHref}#${item.anchor}`
                                : item.anchor
                                ? `#${item.anchor}`
                                : group.directHref ?? headerHref;

                              const itemActive = item.href
                                ? isHrefActive(item.href, currentPath, currentSearch)
                                : false;

                              return (
                                <li key={item.anchor ?? item.href ?? item.label}>
                                  <Link
                                    href={itemHref}
                                    scroll={false}
                                    onClick={e => handleAnchorClick(e, itemHref, item.anchor)}
                                    aria-current={itemActive ? 'page' : undefined}
                                    className={[
                                      'flex h-9 items-center rounded-md pl-11 pr-3 text-[13px] leading-none',
                                      TRANSITION,
                                      FOCUS_RING,
                                      itemActive
                                        ? 'bg-[#F3EFFF] font-medium text-[#6C3BFF]'
                                        : 'font-normal text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                                    ].join(' ')}
                                  >
                                    {item.label}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Uso del mes: Minutos + Tareas con progress bars (V1 pattern con V2 tokens) */}
      {status && (typeof status.minutesRemain === 'number' || typeof status.aiOpsUsed === 'number') &&
        (() => {
          const minIncluded = typeof status.minutesIncluded === 'number' ? status.minutesIncluded : 0;
          const minRemain   = typeof status.minutesRemain === 'number' ? status.minutesRemain : 0;
          const minPct      = minIncluded > 0 ? Math.min(Math.round((1 - minRemain / minIncluded) * 100), 100) : 0;
          const opsUsed     = typeof status.aiOpsUsed  === 'number' ? status.aiOpsUsed  : 0;
          const opsLimit    = typeof status.aiOpsLimit === 'number' ? status.aiOpsLimit : 0;
          const opsPct      = opsLimit > 0 ? Math.min(Math.round((opsUsed / opsLimit) * 100), 100) : 0;
          const opsRemain   = Math.max(0, opsLimit - opsUsed);
          const hasMinPlan  = minIncluded > 0;
          return (
            <Link
              href={`/portal/${token}?tab=cuenta#uso-del-mes`}
              className={[
                'block border-t border-neutral-200/80 px-4 py-3',
                'hover:bg-neutral-100/60',
                TRANSITION,
                FOCUS_RING,
              ].join(' ')}
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                Uso del mes
              </p>
              {/* Minutos */}
              <div className="mb-2">
                <div className="mb-1 flex justify-between">
                  <span className="text-[11px] text-neutral-600">Minutos</span>
                  <span
                    className="text-[11px] font-medium tabular-nums"
                    style={{ color: hasMinPlan ? uColor(minPct) : '#9ca3af' }}
                  >
                    {hasMinPlan ? `${minRemain} restantes` : 'Jornada sin minutos'}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full motion-reduce:transition-none"
                    style={{
                      width: `${minPct}%`,
                      background: uColor(minPct),
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
              </div>
              {/* Tareas */}
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-[11px] text-neutral-600">Tareas</span>
                  <span
                    className="text-[11px] font-medium tabular-nums"
                    style={{ color: opsLimit > 0 ? uColor(opsPct) : '#9ca3af' }}
                  >
                    {opsLimit > 0 ? `${opsRemain} restantes` : 'Jornada sin tareas'}
                  </span>
                </div>
                {opsLimit > 0 && (
                  <div className="h-1 overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className="h-full rounded-full motion-reduce:transition-none"
                      style={{
                        width: `${opsPct}%`,
                        background: uColor(opsPct),
                        transition: 'width 0.4s',
                      }}
                    />
                  </div>
                )}
              </div>
            </Link>
          );
        })()}

      {/* Plan y consumo (Stripe portal) — solo si hasStripe */}
      {status?.hasStripe && (
        <div className="border-t border-neutral-200/80 px-3 py-3">
          <a
            href={`/api/billing/portal-session?token=${token}`}
            className={[
              'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold',
              'bg-[#F3EFFF] text-[#6C3BFF] hover:bg-[#EAE2FF]',
              TRANSITION,
              FOCUS_RING,
            ].join(' ')}
          >
            <CreditCard size={14} aria-hidden />
            Plan y consumo
          </a>
        </div>
      )}
    </nav>
  );
}
