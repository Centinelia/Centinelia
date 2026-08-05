'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { PhoneCall, PhoneOutgoing, Megaphone, PhoneMissed } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, SectionHeader } from '@/components/portal-ui';
import type { VoiceCall } from '@/types/agent';
import type { LlamadasFiltro } from './page';
import CallsSearch      from '../../CallsSearch';
import DownloadCallsCSV from '../../DownloadCallsCSV';
import OutboundSection  from '../../OutboundSection';
// LeadsTabsSection removed (all-time, no period filter) — data reflected in /inicio KPIs
// OutboundToggles moved to /configurar > Horarios y automatizaciones

interface OutboundAgent { id: string; agent_name: string | null; business_name: string }

interface Props {
  token:             string;
  filtro:            LlamadasFiltro;
  isPro:             boolean;
  businessName:      string;
  agentName?:        string;
  calls:             VoiceCall[];
  leads:             any[];
  orders:            any[];
  appts:             any[];
  showLeads:         boolean;
  showOrders:        boolean;
  showAppts:         boolean;
  showOutbound:      boolean;
  initOutbound:      boolean;
  initMissedCall:    boolean;
  contactOutbound:   any[];
  outboundCampaigns: any[];
  outboundAgents:    OutboundAgent[];
  callerNames:       Record<string, string>;
  agentNameById?:    Record<string, string>;
}

type PillDef = {
  id:       LlamadasFiltro;
  label:    string;
  icon:     React.ElementType;
  visible:  boolean;
  color:    string; // active bg color
};

export default function LlamadasTabs({
  token, filtro,
  isPro, businessName, agentName,
  calls, leads, orders, appts,
  showLeads, showOrders, showAppts,
  showOutbound, initOutbound, initMissedCall,
  contactOutbound, outboundCampaigns, outboundAgents,
  callerNames, agentNameById,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const setFiltro = (f: LlamadasFiltro) => {
    router.push(`${pathname}?filtro=${f}`);
  };

  const pills: PillDef[] = ([
    { id: 'entrantes' as LlamadasFiltro, label: 'Entrantes', icon: PhoneCall,     visible: true,           color: '#6C3BFF' },
    { id: 'salientes' as LlamadasFiltro, label: 'Salientes', icon: PhoneOutgoing, visible: showOutbound,   color: '#a855f7' },
    { id: 'campanas'  as LlamadasFiltro, label: 'Campañas',  icon: Megaphone,     visible: showOutbound,   color: '#a855f7' },
    { id: 'recovery'  as LlamadasFiltro, label: 'Recovery',  icon: PhoneMissed,   visible: initMissedCall, color: '#f59e0b' },
  ] as PillDef[]).filter(p => p.visible);

  const pulseText = useMemo(() => {
    if (!calls.length || !agentName) return null;
    const recent  = calls[0];
    const minsAgo = Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 60000);
    if (minsAgo > 120) return null;
    if (minsAgo < 2)   return `${agentName} está atendiendo una llamada`;
    if (minsAgo < 60)  return `${agentName} atendió su última llamada hace ${minsAgo} min`;
    return `${agentName} atendió su última llamada hace ${Math.floor(minsAgo / 60)}h`;
  }, [calls, agentName]);

  return (
    <div className="flex flex-col gap-5">

      {/* Top-level pill filter */}
      {pills.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {pills.map(pill => {
            const Icon    = pill.icon;
            const active  = filtro === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setFiltro(pill.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={active
                  ? { background: pill.color, color: '#fff', border: 'none' }
                  : { background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)', cursor: 'pointer' }}
              >
                <Icon size={14} />
                {pill.label}
                {pill.id === 'entrantes' && calls.length > 0 && (
                  <span className="text-xs tabular-nums" style={{ opacity: 0.8 }}>
                    {calls.length >= 200 ? '200+' : calls.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Entrantes */}
      {filtro === 'entrantes' && (
        <>
          {/* Live pulse */}
          {pulseText && (
            <p className="text-xs flex items-center gap-2 px-1" style={{ color: 'var(--c-text-3)' }}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ background: '#22c55e' }} />
              {pulseText}
            </p>
          )}

          <Card padding="sm">
            <SectionHeader
              as="h3"
              title="Registro de llamadas"
              right={
                <DownloadCallsCSV
                  calls={calls as any}
                  filename={`llamadas-${businessName.replace(/\s+/g, '-').toLowerCase()}.csv`}
                />
              }
              className="mb-4"
            />
            {calls.length === 0 ? (
              <EmptyState icon={PhoneCall} title="Sin llamadas todavía" size="sm" />
            ) : (
              <CallsSearch
                calls={calls as any}
                isPro={isPro}
                callerNames={callerNames}
                token={token}
                agentName={agentName}
                agentNameById={agentNameById}
              />
            )}
          </Card>

          {/* LeadsTabsSection removed: all-time data, doesn't respect period filter.
              Leads/Citas totals visible in /inicio KPIs. */}
        </>
      )}

      {/* Salientes */}
      {filtro === 'salientes' && showOutbound && (
        <>
          {/* OutboundToggles moved to /configurar > Horarios y automatizaciones */}
          {initOutbound && (
            <OutboundSection
              token={token}
              initialContacts={contactOutbound}
              initialCampaigns={outboundCampaigns}
              agents={outboundAgents}
              initialTab="contactos"
            />
          )}
          {!initOutbound && (
            <Card padding="md">
              <EmptyState
                icon={PhoneOutgoing}
                title="Llamadas salientes desactivadas"
                description="Activa esta función desde Configurar tu empleado > Horarios y automatizaciones."
                size="sm"
              />
            </Card>
          )}
        </>
      )}

      {/* Campañas */}
      {filtro === 'campanas' && showOutbound && (
        <>
          {/* OutboundToggles moved to /configurar > Horarios y automatizaciones */}
          {initOutbound && (
            <OutboundSection
              token={token}
              initialContacts={contactOutbound}
              initialCampaigns={outboundCampaigns}
              agents={outboundAgents}
              initialTab="campanas"
            />
          )}
          {!initOutbound && (
            <Card padding="md">
              <EmptyState
                icon={Megaphone}
                title="Llamadas salientes desactivadas"
                description="Activa esta función desde Configurar tu empleado > Horarios y automatizaciones."
                size="sm"
              />
            </Card>
          )}
        </>
      )}

      {/* Recovery */}
      {filtro === 'recovery' && initMissedCall && (
        <Card padding="md">
          <EmptyState
            icon={PhoneMissed}
            title="Missed call recovery activo"
            description="Configura esta función desde Configurar tu empleado > Horarios y automatizaciones."
            size="sm"
          />
        </Card>
      )}

    </div>
  );
}
