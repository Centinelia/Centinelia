'use client';

import { useState, useMemo } from 'react';
import { PhoneCall, PhoneOutgoing } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, SectionHeader } from '@/components/portal-ui';
import type { VoiceCall } from '@/types/agent';
import CallsSearch      from '../../CallsSearch';
import DownloadCallsCSV from '../../DownloadCallsCSV';
import LeadsTabsSection from '../../llamadas/entrantes/LeadsTabsSection';
import OutboundToggles  from '../../OutboundToggles';
import OutboundSection  from '../../OutboundSection';

type Tab = 'entrantes' | 'salientes';

interface OutboundAgent { id: string; agent_name: string | null; business_name: string }

interface Props {
  token:             string;
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

export default function LlamadasTabs({
  token, isPro, businessName, agentName,
  calls, leads, orders, appts,
  showLeads, showOrders, showAppts,
  showOutbound, initOutbound, initMissedCall,
  contactOutbound, outboundCampaigns, outboundAgents,
  callerNames, agentNameById,
}: Props) {
  const [tab, setTab] = useState<Tab>('entrantes');

  const pulseText = useMemo(() => {
    if (!calls.length || !agentName) return null;
    const recent   = calls[0];
    const minsAgo  = Math.floor((Date.now() - new Date(recent.created_at).getTime()) / 60000);
    if (minsAgo > 120) return null;
    if (minsAgo < 2)   return `${agentName} está atendiendo una llamada`;
    if (minsAgo < 60)  return `${agentName} atendió su última llamada hace ${minsAgo} min`;
    return `${agentName} atendió su última llamada hace ${Math.floor(minsAgo / 60)}h`;
  }, [calls, agentName]);

  return (
    <div className="flex flex-col gap-5">

      {/* Tab selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('entrantes')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={tab === 'entrantes'
            ? { background: '#6C3BFF', color: '#fff', border: 'none' }
            : { background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)', cursor: 'pointer' }}
        >
          <PhoneCall size={14} />
          Entrantes
          {calls.length > 0 && (
            <span className="text-xs tabular-nums" style={{ opacity: 0.8 }}>{calls.length >= 200 ? '200+' : calls.length}</span>
          )}
        </button>

        {showOutbound && (
          <button
            onClick={() => setTab('salientes')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={tab === 'salientes'
              ? { background: '#a855f7', color: '#fff', border: 'none' }
              : { background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)', cursor: 'pointer' }}
          >
            <PhoneOutgoing size={14} />
            Salientes
          </button>
        )}
      </div>

      {/* Entrantes */}
      {tab === 'entrantes' && (
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

          {(showLeads || showOrders || showAppts) && (
            <div className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Capturas desde el inicio</p>
              <LeadsTabsSection
                token={token}
                isPro={isPro}
                leads={leads}
                orders={orders}
                appts={appts}
                showLeads={showLeads}
                showOrders={showOrders}
                showAppts={showAppts}
                businessName={businessName}
              />
            </div>
          )}
        </>
      )}

      {/* Salientes */}
      {tab === 'salientes' && showOutbound && (
        <>
          <div id="llamadas-sal">
            <OutboundToggles
              token={token}
              initOutbound={initOutbound}
              initMissedCallRecovery={initMissedCall}
            />
          </div>
          {initOutbound && (
            <OutboundSection
              token={token}
              initialContacts={contactOutbound}
              initialCampaigns={outboundCampaigns}
              agents={outboundAgents}
              initialTab="contactos"
            />
          )}
        </>
      )}

    </div>
  );
}
