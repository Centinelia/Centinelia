'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Inbox, BarChart2, FileText, Mic, UserCheck, ArrowLeft, MessageSquare } from 'lucide-react';

interface Props {
  token:   string;
  badges?: Record<string, number>;
}

const NAV_ITEMS = [
  { href: '',            label: 'Actividad',             icon: Activity,      badgeKey: ''          },
  { href: '/bandeja',    label: 'Bandeja de entrada',    icon: Inbox,         badgeKey: 'bandeja'   },
  { href: '/reportes',   label: 'Reportes automáticos',  icon: BarChart2,     badgeKey: ''          },
  { href: '/contratos',  label: 'Contratos',             icon: FileText,      badgeKey: 'contratos' },
  { href: '/juntas',     label: 'Juntas',                icon: Mic,           badgeKey: 'juntas'    },
  { href: '/onboarding', label: 'Onboarding',            icon: UserCheck,     badgeKey: ''          },
  { href: '/chat',       label: 'Consultar agente',      icon: MessageSquare, badgeKey: ''          },
];

export default function OficinaSidebar({ token, badges = {} }: Props) {
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
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5"
              style={{
                background: isActive ? 'rgba(108,59,255,0.12)' : 'transparent',
                color:      isActive ? '#9B6DFF' : 'var(--c-text-2)',
              }}
            >
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
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
