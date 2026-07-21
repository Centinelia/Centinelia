'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, Inbox, BarChart2, FileText, Mic, UserCheck,
  ArrowLeft, Search, CreditCard, FolderOpen,
  ClipboardList, Gavel, Headphones, PieChart, Brain, Plug,
} from 'lucide-react';
import { uColor } from '@/lib/portal/utils';

interface NavItem {
  href:      string;
  moduleId:  string;
  label:     string;
  icon:      React.ElementType;
  badgeKey:  string;
  opsHint:   string;
  pulseId:   string;
  vertical?: string;
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
      { href: '/bandeja',  moduleId: 'of_bandeja',    label: 'Bandeja',           icon: Inbox,     badgeKey: 'bandeja', opsHint: '1 tarea/correo', pulseId: 'of-bandeja'    },
      { href: '/reportes', moduleId: 'of_reportes',   label: 'Reportes',          icon: BarChart2, badgeKey: '',        opsHint: '1 tarea/reporte',pulseId: 'of-reportes'   },
    ],
  },
  {
    group: 'CONOCIMIENTO',
    items: [
      { href: '/aprendizajes',  moduleId: 'of_aprendizajes',  label: 'Cómo trabajamos', icon: Brain,     badgeKey: '',          opsHint: '',                        pulseId: 'of-aprendizajes'  },
      { href: '/investigacion', moduleId: 'of_investigacion', label: 'Investigación',   icon: Search,    badgeKey: '',          opsHint: '0 aquí · 7–13 vía chat',  pulseId: 'of-investigacion' },
      { href: '/documentos',   moduleId: 'of_documentos',    label: 'Documentos',      icon: FolderOpen,badgeKey: '',          opsHint: '',                        pulseId: 'of-documentos'    },
      { href: '/contratos',    moduleId: 'of_contratos',     label: 'Contratos',       icon: FileText,  badgeKey: 'contratos', opsHint: '1 tarea/análisis',        pulseId: 'of-contratos'     },
    ],
  },
  {
    group: 'OPERACIÓN',
    items: [
      { href: '/juntas',               moduleId: 'of_juntas',               label: 'Juntas',               icon: Mic,         badgeKey: 'juntas',            opsHint: '1–6 tareas/junta', pulseId: 'of-juntas'               },
      { href: '/onboarding',           moduleId: 'of_onboarding',           label: 'Onboarding',           icon: UserCheck,   badgeKey: '',                  opsHint: '',                 pulseId: 'of-onboarding'           },
      { href: '/helpdesk',             moduleId: 'of_helpdesk',             label: 'Mesa de ayuda',        icon: Headphones,  badgeKey: '',                  opsHint: '',                 pulseId: 'of-helpdesk'             },
      { href: '/reportes-ciudadanos',  moduleId: 'of_reportes_ciudadanos',  label: 'Reportes ciudadanos',  icon: ClipboardList, badgeKey: 'reportesCiudadanos', opsHint: '',             pulseId: 'of-reportes-ciudadanos', vertical: 'gobierno' },
      { href: '/cabildo',              moduleId: 'of_cabildo',              label: 'Cabildo',              icon: Gavel,       badgeKey: '',                  opsHint: '',                 pulseId: 'of-cabildo',             vertical: 'gobierno' },
    ],
  },
  {
    group: 'PERSONAS',
    items: [
      { href: '/encuestas', moduleId: 'of_encuestas', label: 'Encuestas', icon: PieChart, badgeKey: '', opsHint: '', pulseId: 'of-encuestas' },
    ],
  },
  {
    group: 'SISTEMA',
    items: [
      { href: '/integraciones', moduleId: 'of_integraciones', label: 'Integraciones', icon: Plug, badgeKey: '', opsHint: '', pulseId: 'of-integraciones' },
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
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > 100) { clearInterval(timer); setPendingId(null); return; }
      const el = document.getElementById(pendingId);
      if (!el) return;
      clearInterval(timer);
      setPendingId(null);
      const rect = el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
      el.style.transition = 'box-shadow 0.15s';
      el.style.boxShadow  = '0 0 0 3px rgba(108,59,255,0.7), inset 0 0 0 9999px rgba(108,59,255,0.15)';
      setTimeout(() => {
        el.style.transition = 'box-shadow 1.5s ease-out';
        el.style.boxShadow  = '';
        setTimeout(() => { el.style.transition = ''; }, 1500);
      }, 600);
    }, 50);
    return () => clearInterval(timer);
  }, [pendingId]);

  return (
    <aside
      className="hidden md:flex flex-col w-52 shrink-0"
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

          return (
            <div key={section.group} className={si > 0 ? 'mt-3' : ''}>
              <p
                className="px-3 pb-1 text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: 'var(--c-text-4)' }}
              >
                {section.group}
              </p>

              {visibleItems.map(item => {
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
                    onClick={() => setPendingId(item.pulseId)}
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

      {/* Usage widget */}
      {minutesIncluded > 0 && (() => {
        const minPct    = Math.min(Math.round((1 - minutesRemain / minutesIncluded) * 100), 100);
        const opsPct    = aiOpsLimit > 0 ? Math.min(Math.round((aiOpsUsed / aiOpsLimit) * 100), 100) : 0;
        const opsRemain = Math.max(0, aiOpsLimit - aiOpsUsed);
        return (
          <Link
            href={`/portal/${token}?tab=cuenta#minutos`}
            className="block px-3 py-3 mt-auto shrink-0 hover:opacity-80 transition-opacity"
            style={{ borderTop: '1px solid var(--c-border)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>Uso del mes</p>
            <div className="mb-2">
              <div className="flex justify-between mb-1">
                <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Minutos</span>
                <span className="text-[11px] font-medium tabular-nums" style={{ color: uColor(minPct) }}>{minutesRemain} rest.</span>
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
        <div
          className="px-2 py-3 shrink-0"
          style={{ borderTop: minutesIncluded > 0 ? 'none' : '1px solid var(--c-border)', marginTop: minutesIncluded > 0 ? 0 : 'auto' }}
        >
          <a
            href={`/api/billing/portal-session?token=${token}`}
            className="flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 w-full"
            style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', textDecoration: 'none' }}
          >
            <CreditCard size={14} style={{ flexShrink: 0 }} />
            Suscripción
          </a>
        </div>
      )}
    </aside>
  );
}
