'use client';

import { useState } from 'react';
import { PhoneCall, PhoneOutgoing } from 'lucide-react';
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
}

export default function LlamadasTabs({
  token, isPro, businessName,
  calls, leads, orders, appts,
  showLeads, showOrders, showAppts,
  showOutbound, initOutbound, initMissedCall,
  contactOutbound, outboundCampaigns, outboundAgents,
  callerNames,
}: Props) {
  const [tab, setTab] = useState<Tab>('entrantes');

  return (
    <div className="flex flex-col gap-5">

      {/* Selector */}
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
            <span className="text-xs tabular-nums" style={{ opacity: 0.8 }}>{calls.length}</span>
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
          <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                Registro de llamadas
              </h3>
              <DownloadCallsCSV
                calls={calls as any}
                filename={`llamadas-${businessName.replace(/\s+/g, '-').toLowerCase()}.csv`}
              />
            </div>
            {calls.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                  <PhoneCall size={20} style={{ color: '#6C3BFF', opacity: 0.5 }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin llamadas todavía</p>
              </div>
            ) : (
              <CallsSearch calls={calls as any} isPro={isPro} callerNames={callerNames} token={token} />
            )}
          </div>

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
