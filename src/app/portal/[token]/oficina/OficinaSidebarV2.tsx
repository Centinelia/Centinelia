'use client';

/**
 * OficinaSidebarV2 — sidebar dark 'workspace mode' para /oficina.
 *
 * Diseño Stripe/Superhuman: fondo #1A0A3B, texto blanco, focus lila.
 * Se siente como una consola de operación distinta del portal principal
 * (que es light Shopify-tier).
 *
 * Se renderiza solo cuando organizations.portal_v2_enabled=true (ver
 * oficina/layout.tsx). El sidebar V1 (OficinaSidebar.tsx) permanece
 * intacto para orgs sin el flag.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, BarChart2, Mic, UserCheck,
  ArrowLeft, Search, CreditCard, FolderOpen,
  ClipboardList, Gavel, Headphones, PieChart, Brain,
  ChevronDown, ChevronRight, Phone, LayoutTemplate, CalendarClock,
  Inbox, FileSignature, Receipt, Megaphone, Users,
} from 'lucide-react';

interface NavItem {
  href:      string;
  moduleId:  string;
  label:     string;
  icon:      React.ElementType;
  badgeKey:  string;
  vertical?: string;
  // Permiso alternativo. Si el sub-user tiene moduleId O moduleIdOr, ve el link.
  // Usado por Campañas para admitir usuarios con solo `of_encuestas` (unificación
  // de Campañas + Encuestas bajo /oficina/campanas — 2026-08-09).
  moduleIdOr?: string;
}

interface NavSection { group: string; items: NavItem[]; }

const NAV_SECTIONS: NavSection[] = [
  {
    group: 'ACTIVIDAD',
    items: [
      { href: '',          moduleId: 'of_actividad', label: 'Hoy en la oficina', icon: Activity,  badgeKey: '' },
      { href: '/bandeja',  moduleId: 'of_bandeja',   label: 'Bandeja',           icon: Inbox,     badgeKey: 'bandeja' },
      { href: '/reportes', moduleId: 'of_reportes',  label: 'Reportes',          icon: BarChart2, badgeKey: 'reportes' },
    ],
  },
  {
    group: 'CONOCIMIENTO',
    items: [
      { href: '/aprendizajes',  moduleId: 'of_aprendizajes',  label: 'Aprendizajes',    icon: Brain,  badgeKey: '' },
      { href: '/investigacion', moduleId: 'of_investigacion', label: 'Investigación',   icon: Search, badgeKey: '' },
    ],
  },
  {
    group: 'OPERACIÓN',
    items: [
      { href: '/documentos',           moduleId: 'of_documentos',           label: 'Documentos',          icon: FolderOpen,     badgeKey: '' },
      { href: '/facturas',             moduleId: 'of_facturas',             label: 'Facturas',            icon: Receipt,        badgeKey: 'facturas' },
      { href: '/expedientes',          moduleId: 'of_expedientes',          label: 'Expedientes OC',      icon: FileSignature,  badgeKey: '' },
      { href: '/contratos',            moduleId: 'of_contratos',            label: 'Contratos',           icon: FileSignature,  badgeKey: '' },
      { href: '/plantillas',           moduleId: 'of_plantillas',           label: 'Plantillas',          icon: LayoutTemplate, badgeKey: '' },
      { href: '/tareas',               moduleId: 'of_tareas_programadas',   label: 'Tareas',              icon: CalendarClock,  badgeKey: '' },
      { href: '/juntas',               moduleId: 'of_juntas',               label: 'Juntas',              icon: Mic,            badgeKey: 'juntas' },
      { href: '/reportes-ciudadanos',  moduleId: 'of_reportes_ciudadanos',  label: 'Reportes ciudadanos', icon: ClipboardList,  badgeKey: 'reportesCiudadanos', vertical: 'gobierno' },
      { href: '/cabildo',              moduleId: 'of_cabildo',              label: 'Cabildo',             icon: Gavel,          badgeKey: '', vertical: 'gobierno' },
    ],
  },
  {
    group: 'PERSONAS',
    items: [
      { href: '/llamadas',   moduleId: 'llamadas',      label: 'Llamadas',   icon: Phone,     badgeKey: '' },
      // Contactos vive fuera de Campañas (2026-08-10) — es asset transversal.
      // Retrocompat: sub-users con `campanas` también entran.
      { href: '/contactos',  moduleId: 'of_contactos',  moduleIdOr: 'campanas',     label: 'Contactos', icon: Users,     badgeKey: '' },
      // Campañas unifica salientes + encuestas (+ correos futuro). Accesible
      // con permiso `campanas` O `of_encuestas` — la UI muestra solo las tabs
      // permitidas al sub-user (ver CampanasClient.visibleTabs).
      { href: '/campanas',   moduleId: 'campanas',      moduleIdOr: 'of_encuestas', label: 'Campañas', icon: Megaphone, badgeKey: '' },
      { href: '/onboarding', moduleId: 'of_onboarding', label: 'Onboarding', icon: UserCheck, badgeKey: '' },
    ],
  },
  {
    group: 'SISTEMA',
    items: [
      { href: '/helpdesk',      moduleId: 'of_helpdesk',   label: 'Mesa de ayuda', icon: Headphones, badgeKey: '' },
      // Integraciones se movió a la pestaña Organización (2026-08-07) —
      // los conectores son configuración one-time del owner, no trabajo del
      // empleado. Ver /portal/[token]?tab=negocio#integraciones.
    ],
  },
];

interface Props {
  token:            string;
  badges?:          Record<string, number>;
  minutesRemain?:   number;
  minutesIncluded?: number;
  aiOpsUsed?:       number;
  aiOpsLimit?:      number;
  hasStripe?:       boolean;
  vertical?:        string;
  modules?:         string[];
}

// Barra de uso — colores contra fondo dark
function uColorDark(pct: number): string {
  if (pct >= 90) return '#f87171';   // rojo claro sobre dark
  if (pct >= 70) return '#fbbf24';   // amarillo
  return '#a78bfa';                   // lila brand (activo)
}

export default function OficinaSidebarV2({
  token, badges = {}, minutesRemain = 0, minutesIncluded = 0,
  aiOpsUsed = 0, aiOpsLimit = 0, hasStripe = false, vertical, modules,
}: Props) {
  const pathname = usePathname();
  const base     = `/portal/${token}/oficina`;

  const activeGroup = NAV_SECTIONS.find(s =>
    s.items
      .filter(i => !i.vertical || i.vertical === vertical)
      .filter(i => !modules || modules.includes(i.moduleId) || (i.moduleIdOr && modules.includes(i.moduleIdOr)))
      .some(i => (i.href === ''
        ? pathname === base || pathname === `${base}/`
        : pathname.startsWith(`${base}${i.href}`)))
  )?.group ?? NAV_SECTIONS[0]?.group ?? '';

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set([activeGroup]));
  const toggleGroup = (group: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });

  return (
    <aside
      aria-label="Navegación de Oficina"
      className="hidden md:flex flex-col w-[260px] shrink-0 self-start"
      style={{
        background:  '#1A0A3B',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        position:    'sticky',
        top:         60,
        height:      'calc(100vh - 60px)',
        overflow:    'hidden',
        color:       '#fff',
      }}
    >
      <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto py-3 px-2.5">
        {/* Botón regresar al portal */}
        <Link
          href={`/portal/${token}?tab=inicio`}
          className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-[11px] font-medium uppercase tracking-widest transition-colors"
          style={{ color: 'rgba(255,255,255,0.55)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.9)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.55)'; }}
        >
          <ArrowLeft size={12} />
          Portal
        </Link>

        {NAV_SECTIONS.map((section, si) => {
          const visibleItems = section.items
            .filter(item => !item.vertical || item.vertical === vertical)
            .filter(item => !modules || modules.includes(item.moduleId) || (item.moduleIdOr && modules.includes(item.moduleIdOr)));
          if (visibleItems.length === 0) return null;

          const isOpen = openGroups.has(section.group);
          const hasActiveBadge = visibleItems.some(i => i.badgeKey && (badges[i.badgeKey] ?? 0) > 0);

          return (
            <div key={section.group} className={si > 0 ? 'mt-2' : ''}>
              <button
                onClick={() => toggleGroup(section.group)}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-md transition-colors"
                style={{ color: 'rgba(255,255,255,0.45)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase">{section.group}</span>
                <div className="flex items-center gap-1.5">
                  {!isOpen && hasActiveBadge && (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f87171' }} />
                  )}
                  {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </div>
              </button>

              {isOpen && visibleItems.map(item => {
                const href     = `${base}${item.href}`;
                const isActive = item.href === ''
                  ? pathname === base || pathname === `${base}/`
                  : pathname.startsWith(href);
                const count = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                const Icon  = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all mb-0.5 relative"
                    style={{
                      background: isActive ? 'rgba(108,59,255,0.18)' : 'transparent',
                      color:      isActive ? '#fff' : 'rgba(255,255,255,0.72)',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                        (e.currentTarget as HTMLElement).style.color      = '#fff';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color      = 'rgba(255,255,255,0.72)';
                      }
                    }}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{ background: '#9B6DFF' }}
                      />
                    )}
                    <Icon size={14} strokeWidth={1.75} style={{ opacity: isActive ? 1 : 0.75, flexShrink: 0 }} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && (
                      <span
                        className="flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                        style={{ minWidth: 18, height: 18, padding: '0 5px', background: '#ef4444', color: '#fff', flexShrink: 0 }}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bloque inferior — uso del mes + billing */}
      {((minutesIncluded > 0 || aiOpsLimit > 0) || hasStripe) && (
        <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {(minutesIncluded > 0 || aiOpsLimit > 0) && (() => {
            const hasMinPlan = minutesIncluded > 0;
            const minPct    = hasMinPlan ? Math.min(Math.round((1 - minutesRemain / minutesIncluded) * 100), 100) : 0;
            const opsPct    = aiOpsLimit > 0 ? Math.min(Math.round((aiOpsUsed / aiOpsLimit) * 100), 100) : 0;
            const opsRemain = Math.max(0, aiOpsLimit - aiOpsUsed);
            return (
              <Link
                href={`/portal/${token}?tab=cuenta#minutos`}
                className="block px-4 py-3 transition-colors"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Uso del mes
                </p>
                <div className="mb-2.5">
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>Minutos</span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: hasMinPlan ? uColorDark(minPct) : 'rgba(255,255,255,0.35)' }}>
                      {hasMinPlan ? `${minutesRemain} rest.` : 'Jornada sin minutos'}
                    </span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{ width: `${minPct}%`, height: '100%', background: uColorDark(minPct), borderRadius: 9999 }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>Tareas</span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: aiOpsLimit > 0 ? uColorDark(opsPct) : 'rgba(255,255,255,0.35)' }}>
                      {aiOpsLimit > 0 ? `${opsRemain} rest.` : 'Jornada sin tareas'}
                    </span>
                  </div>
                  {aiOpsLimit > 0 && (
                    <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${opsPct}%`, height: '100%', background: uColorDark(opsPct), borderRadius: 9999 }} />
                    </div>
                  )}
                </div>
              </Link>
            );
          })()}

          {hasStripe && (
            <div className="px-3 py-3" style={{ borderTop: (minutesIncluded > 0 || aiOpsLimit > 0) ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <a
                href={`/api/billing/portal-session?token=${token}`}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[13px] font-semibold transition-opacity hover:opacity-90 w-full"
                style={{ background: 'rgba(108,59,255,0.22)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(108,59,255,0.35)' }}
              >
                <CreditCard size={13} style={{ flexShrink: 0 }} />
                Plan y consumo
              </a>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
