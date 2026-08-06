'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, BarChart2, FileText, Mic, UserCheck,
  ArrowLeft, Search, CreditCard, FolderOpen,
  ClipboardList, Gavel, Headphones, PieChart, Brain, Plug,
  ChevronDown, ChevronRight, Phone, LayoutTemplate, CalendarClock,
  Inbox, FileSignature, Receipt,
} from 'lucide-react';
import { uColor } from '@/lib/portal/utils';

interface NavItem {
  href:        string;
  fromPortal?: boolean;   // href is relative to /portal/${token}, not /portal/${token}/oficina
  moduleId:    string;
  label:       string;
  icon:        React.ElementType;
  badgeKey:    string;
  opsHint:     string;
  pulseId?:    string;
  vertical?:   string;
}

interface NavSection {
  group: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    group: 'ACTIVIDAD',
    items: [
      { href: '',          moduleId: 'of_actividad',  label: 'Hoy en la oficina', icon: Activity,  badgeKey: '',        opsHint: '',               pulseId: 'of-actividad'  },
      { href: '/bandeja',  moduleId: 'of_bandeja',    label: 'Bandeja',           icon: Inbox,     badgeKey: 'bandeja', opsHint: '',               pulseId: 'of-bandeja'    },
      { href: '/reportes', moduleId: 'of_reportes',   label: 'Reportes',          icon: BarChart2, badgeKey: 'reportes', opsHint: '1 tarea/reporte',pulseId: 'of-reportes'   },
    ],
  },
  {
    group: 'CONOCIMIENTO',
    items: [
      { href: '/aprendizajes',  moduleId: 'of_aprendizajes',  label: 'Cómo trabajamos', icon: Brain,  badgeKey: '', opsHint: '',                       pulseId: 'of-aprendizajes'  },
      { href: '/investigacion', moduleId: 'of_investigacion', label: 'Investigación',   icon: Search, badgeKey: '', opsHint: '0 aquí · 7–13 vía chat', pulseId: 'of-investigacion' },
    ],
  },
  {
    group: 'OPERACIÓN',
    items: [
      { href: '/documentos',           moduleId: 'of_documentos',           label: 'Documentos',          icon: FolderOpen,     badgeKey: '',               opsHint: '',                 pulseId: 'of-documentos'           },
      { href: '/facturas',             moduleId: 'of_facturas',             label: 'Facturas por emitir', icon: Receipt,        badgeKey: 'facturas',       opsHint: '',                 pulseId: 'of-facturas'             },
      { href: '/contratos',            moduleId: 'of_contratos',            label: 'Contratos',           icon: FileSignature,  badgeKey: '',               opsHint: '',                 pulseId: 'of-contratos'            },
      { href: '/plantillas',           moduleId: 'of_plantillas',           label: 'Plantillas',          icon: LayoutTemplate, badgeKey: '',               opsHint: '',                 pulseId: 'of-plantillas'           },
      { href: '/tareas',               moduleId: 'of_tareas_programadas',   label: 'Tareas',              icon: CalendarClock,  badgeKey: '',               opsHint: '',                 pulseId: 'of-tareas'               },
      { href: '/juntas',              moduleId: 'of_juntas',              label: 'Juntas',              icon: Mic,            badgeKey: 'juntas',         opsHint: '1–6 tareas/junta', pulseId: 'of-juntas'              },
      { href: '/reportes-ciudadanos', moduleId: 'of_reportes_ciudadanos', label: 'Reportes ciudadanos', icon: ClipboardList,  badgeKey: 'reportesCiudadanos', opsHint: '',             pulseId: 'of-reportes-ciudadanos', vertical: 'gobierno' },
      { href: '/cabildo',             moduleId: 'of_cabildo',             label: 'Cabildo',             icon: Gavel,          badgeKey: '',               opsHint: '',                 pulseId: 'of-cabildo',             vertical: 'gobierno' },
    ],
  },
  {
    group: 'PERSONAS',
    items: [
      { href: '/llamadas',   moduleId: 'llamadas',      label: 'Llamadas',   icon: Phone,     badgeKey: '', opsHint: '', pulseId: ''               },
      { href: '/onboarding', moduleId: 'of_onboarding', label: 'Onboarding', icon: UserCheck, badgeKey: '', opsHint: '', pulseId: 'of-onboarding'  },
      { href: '/encuestas',  moduleId: 'of_encuestas',  label: 'Calidad',    icon: PieChart,  badgeKey: '', opsHint: '', pulseId: 'of-encuestas'   },
    ],
  },
  {
    group: 'SISTEMA',
    items: [
      { href: '/helpdesk',      moduleId: 'of_helpdesk',      label: 'Mesa de ayuda', icon: Headphones, badgeKey: '', opsHint: '', pulseId: 'of-helpdesk'      },
      { href: '/integraciones', moduleId: 'integraciones',    label: 'Integraciones', icon: Plug,       badgeKey: '', opsHint: '', pulseId: 'of-integraciones' },
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

export default function OficinaSidebar({
  token, badges = {}, minutesRemain = 0, minutesIncluded = 0,
  aiOpsUsed = 0, aiOpsLimit = 0, hasStripe = false, vertical, modules,
}: Props) {
  const pathname  = usePathname();
  const base      = `/portal/${token}/oficina`;
  // Open the group that contains the currently active item by default
  const activeGroup = NAV_SECTIONS.find(s =>
    s.items
      .filter(i => !i.vertical || i.vertical === vertical)
      .filter(i => !modules || modules.includes(i.moduleId))
      .some(i => {
        if (i.fromPortal) return pathname.startsWith(`/portal/${token}${i.href}`);
        const href = `${base}${i.href}`;
        return i.href === '' ? pathname === base || pathname === `${base}/` : pathname.startsWith(href);
      })
  )?.group ?? NAV_SECTIONS[0]?.group ?? '';

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set([activeGroup]));

  const toggleGroup = (group: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });

  return (
    <aside
      className="hidden md:flex flex-col w-[260px] shrink-0"
      style={{
        borderRight: '1px solid var(--c-border)',
        background:  'var(--c-modal)',
        position:    'sticky',
        top:         53,
        height:      'calc(100vh - 53px)',
        overflowY:   'auto',
      }}
    >
      <nav className="flex flex-col py-2 px-2">
        <Link
          href={`/portal/${token}?tab=inicio`}
          className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
          style={{ color: 'var(--c-text-3)' }}
        >
          <ArrowLeft size={12} />
          Volver al portal
        </Link>

        {NAV_SECTIONS.map((section, si) => {
          const visibleItems = section.items
            .filter(item => !item.vertical || item.vertical === vertical)
            .filter(item => !modules || modules.includes(item.moduleId));

          if (visibleItems.length === 0) return null;

          const isOpen = openGroups.has(section.group);
          const hasActiveBadge = visibleItems.some(i => i.badgeKey && (badges[i.badgeKey] ?? 0) > 0);

          return (
            <div key={section.group} className={si > 0 ? 'mt-1' : ''}>
              <button
                onClick={() => toggleGroup(section.group)}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: 'var(--c-text-4)' }}
              >
                <span className="text-[10px] font-semibold tracking-widest uppercase">{section.group}</span>
                <div className="flex items-center gap-1">
                  {!isOpen && hasActiveBadge && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                  {isOpen
                    ? <ChevronDown size={10} />
                    : <ChevronRight size={10} />
                  }
                </div>
              </button>

              {isOpen && visibleItems.map(item => {
                const href     = item.fromPortal ? `/portal/${token}${item.href}` : `${base}${item.href}`;
                const isActive = item.fromPortal
                  ? pathname.startsWith(`/portal/${token}${item.href}`)
                  : item.href === ''
                    ? pathname === base || pathname === `${base}/`
                    : pathname.startsWith(href);
                const count = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
                const Icon  = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className="flex flex-col gap-0.5 px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5"
                    style={{
                      background: isActive ? 'rgba(108,59,255,0.12)' : 'transparent',
                      color:      isActive ? '#9B6DFF' : 'var(--c-text-2)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={14} style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }} />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 && (
                        <span
                          className="flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                          style={{ minWidth: 18, height: 18, padding: '0 4px', background: '#ef4444', color: '#fff', flexShrink: 0 }}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>


      {/* Bloque inferior fijo al fondo — widget usage + button en un solo wrapper mt-auto */}
      {((minutesIncluded > 0 || aiOpsLimit > 0) || hasStripe) && (
        <div className="mt-auto shrink-0">
          {(minutesIncluded > 0 || aiOpsLimit > 0) && (() => {
            const hasMinPlan = minutesIncluded > 0;
            const minPct    = hasMinPlan ? Math.min(Math.round((1 - minutesRemain / minutesIncluded) * 100), 100) : 0;
            const opsPct    = aiOpsLimit > 0 ? Math.min(Math.round((aiOpsUsed / aiOpsLimit) * 100), 100) : 0;
            const opsRemain = Math.max(0, aiOpsLimit - aiOpsUsed);
            return (
              <Link
                href={`/portal/${token}?tab=cuenta#minutos`}
                className="block px-3 py-3 hover:opacity-80 transition-opacity"
                style={{ borderTop: '1px solid var(--c-border)' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>Uso del mes</p>
                <div className="mb-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Minutos</span>
                    <span className="text-[11px] font-medium tabular-nums" style={{ color: hasMinPlan ? uColor(minPct) : '#9ca3af' }}>
                      {hasMinPlan ? `${minutesRemain} rest.` : 'Sin plan'}
                    </span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'var(--c-border)' }}>
                    <div style={{ width: `${minPct}%`, height: '100%', background: uColor(minPct), borderRadius: 9999 }} />
                  </div>
                </div>
                {aiOpsLimit > 0 && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Tareas</span>
                      <span className="text-[11px] font-medium tabular-nums" style={{ color: uColor(opsPct) }}>{opsRemain} rest.</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'var(--c-border)' }}>
                      <div style={{ width: `${opsPct}%`, height: '100%', background: uColor(opsPct), borderRadius: 9999 }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })()}

          {hasStripe && (
            <div className="px-2 py-3" style={{ borderTop: (minutesIncluded > 0 || aiOpsLimit > 0) ? 'none' : '1px solid var(--c-border)' }}>
              <a
                href={`/api/billing/portal-session?token=${token}`}
                className="flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 w-full"
                style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', textDecoration: 'none' }}
              >
                <CreditCard size={14} style={{ flexShrink: 0 }} />
                Plan y consumo
              </a>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
