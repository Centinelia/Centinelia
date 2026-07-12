'use client';

import { useState } from 'react';
import { Users, ShoppingBag, CalendarDays } from 'lucide-react';
import PortalLeadsSection        from '../../PortalLeadsSection';
import PortalOrdersSection       from '../../PortalOrdersSection';
import PortalAppointmentsSection from '../../PortalAppointmentsSection';

type Tab = 'leads' | 'pedidos' | 'citas';

interface TabConfig { id: Tab; label: string; icon: React.ElementType; count: number }

interface Props {
  token:       string;
  isPro:       boolean;
  leads:       any[];
  orders:      any[];
  appts:       any[];
  showLeads:   boolean;
  showOrders:  boolean;
  showAppts:   boolean;
  businessName: string;
}

export default function LeadsTabsSection({ token, isPro, leads, orders, appts, showLeads, showOrders, showAppts, businessName }: Props) {
  const tabs: TabConfig[] = [
    ...(showLeads  ? [{ id: 'leads'  as Tab, label: 'Leads',   icon: Users,        count: leads.length  }] : []),
    ...(showOrders ? [{ id: 'pedidos' as Tab, label: 'Pedidos', icon: ShoppingBag,  count: orders.length }] : []),
    ...(showAppts  ? [{ id: 'citas'   as Tab, label: 'Citas',   icon: CalendarDays, count: appts.length  }] : []),
  ];

  const [active, setActive] = useState<Tab>(tabs[0]?.id ?? 'leads');

  if (tabs.length === 0) return null;

  return (
    <div id="leads-citas-pedidos" className="rounded-xl overflow-hidden"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>

      {/* Pill tabs */}
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map(tab => {
            const Icon    = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={isActive
                  ? { background: 'rgba(108,59,255,0.15)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }
                  : { background: 'var(--c-bg)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
              >
                <Icon size={12} />
                {tab.label}
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                  style={isActive
                    ? { background: 'rgba(108,59,255,0.25)', color: '#9B6DFF' }
                    : { background: 'var(--c-border-2)', color: 'var(--c-text-3)' }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4" style={{ borderBottom: '1px solid var(--c-border)' }} />
      </div>

      {/* Content */}
      <div className="p-5">
        {active === 'leads' && (
          <PortalLeadsSection
            initialLeads={leads as any}
            token={token}
            isPro={isPro}
            filename={`leads-${businessName.replace(/\s+/g, '-').toLowerCase()}.csv`}
          />
        )}
        {active === 'pedidos' && (
          <PortalOrdersSection initialOrders={orders as any} token={token} isPro={isPro} />
        )}
        {active === 'citas' && (
          <PortalAppointmentsSection initialAppointments={appts as any} token={token} label="cita" isPro={isPro} />
        )}
      </div>
    </div>
  );
}
