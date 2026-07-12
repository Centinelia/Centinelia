'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Inbox, BarChart2, FileText, Mic, UserCheck, ArrowLeft, MessageSquare, Zap, Search, CreditCard, FolderOpen } from 'lucide-react';
import { uColor } from '@/lib/portal/utils';

interface Props {
  token:            string;
  badges?:          Record<string, number>;
  minutesRemain?:   number;
  minutesIncluded?: number;
  aiOpsUsed?:       number;
  aiOpsLimit?:      number;
  hasStripe?:       boolean;
}

const NAV_ITEMS = [
  { href: '',            label: 'Actividad',             icon: Activity,      badgeKey: '',          opsHint: ''              },
  { href: '/bandeja',    label: 'Bandeja de entrada',    icon: Inbox,         badgeKey: 'bandeja',   opsHint: '1 op/correo'   },
  { href: '/reportes',   label: 'Reportes automáticos',  icon: BarChart2,     badgeKey: '',          opsHint: '1 op/reporte'  },
  { href: '/contratos',  label: 'Contratos',             icon: FileText,      badgeKey: 'contratos', opsHint: '1 op/análisis' },
  { href: '/documentos', label: 'Documentos',            icon: FolderOpen,    badgeKey: '',          opsHint: ''              },
  { href: '/juntas',     label: 'Juntas',                icon: Mic,           badgeKey: 'juntas',    opsHint: '1–6 ops/junta' },
  { href: '/investigacion', label: 'Investigación',       icon: Search,        badgeKey: '',          opsHint: '0 ops aquí · 7–13 vía chat' },
  { href: '/onboarding', label: 'Onboarding',            icon: UserCheck,     badgeKey: '',          opsHint: ''              },
  { href: '/chat',       label: 'Consultar agente',      icon: MessageSquare, badgeKey: '',          opsHint: '3–13 ops/msg'  },
];

export default function OficinaSidebar({ token, badges = {}, minutesRemain = 0, minutesIncluded = 0, aiOpsUsed = 0, aiOpsLimit = 0, hasStripe = false }: Props) {
  const pathname = usePathname();
  const base     = `/portal/${token}/oficina`;

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
        {/* Back to main portal */}
        <Link
          href={`/portal/${token}?tab=inicio`}
          className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-xs transition-colors hover:bg-[var(--c-surface-2)]"
          style={{ color: 'var(--c-text-3)' }}
        >
          <ArrowLeft size={12} />
          Volver al portal
        </Link>

        <p className="px-3 pb-1 text-xs font-semibold tracking-widest uppercase"
          style={{ color: 'var(--c-text-4)' }}>
          Oficina
        </p>

        {NAV_ITEMS.map(item => {
          const href     = `${base}${item.href}`;
          const isActive = item.href === ''
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(href);
          const count    = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
          const Icon     = item.icon;

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
                    style={{
                      minWidth:   18,
                      height:     18,
                      padding:    '0 4px',
                      background: '#ef4444',
                      color:      '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
              {item.opsHint && (
                <div className="flex items-center gap-1 pl-[22px]">
                  <Zap size={9} style={{ color: '#9B6DFF', opacity: 0.7 }} />
                  <span className="text-[10px]" style={{ color: 'var(--c-text-3)', fontWeight: 500 }}>
                    {item.opsHint}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Usage widget */}
      {minutesIncluded > 0 && (() => {
        const minPct  = Math.min(Math.round((1 - minutesRemain / minutesIncluded) * 100), 100);
        const opsPct  = aiOpsLimit > 0 ? Math.min(Math.round((aiOpsUsed / aiOpsLimit) * 100), 100) : 0;
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
                  <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Ops IA</span>
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
        <div className="px-2 py-3 shrink-0" style={{ borderTop: minutesIncluded > 0 ? 'none' : '1px solid var(--c-border)', marginTop: minutesIncluded > 0 ? 0 : 'auto' }}>
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
