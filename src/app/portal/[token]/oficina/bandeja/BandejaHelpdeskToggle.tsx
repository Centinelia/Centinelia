'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import OpsInboxSection from '../../OpsInboxSection';
import HelpdeskSection from '../helpdesk/HelpdeskSection';
import IncidentesSection from '../helpdesk/IncidentesSection';
import { Card } from '@/components/portal-ui';
import MeerkatPicker from '../../agentes/MeerkatPicker';
import type { InboxAgent } from '../../inbox/categories';

interface Incident {
  id: string; titulo: string; descripcion: string;
  mensaje_voz: string; keywords: string[]; activo: boolean; created_at: string;
}

interface BandejaHelpdeskToggleProps {
  token:          string;
  agents:         InboxAgent[];
  /* Helpdesk props */
  isItSubUser:    boolean;
  subUserName:    string | null;
  hasNeo:         boolean;
  employeeName:   string;
  scheduleLabel:  string;
  lastActivity:   string | null;
  incidents:      Incident[];
  plan:           string;
  defaultTier:    string;
}

export default function BandejaHelpdeskToggle({
  token,
  agents,
  isItSubUser,
  subUserName,
  hasNeo,
  employeeName,
  scheduleLabel,
  lastActivity,
  incidents,
  plan,
  defaultTier,
}: BandejaHelpdeskToggleProps) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const tipo         = searchParams.get('tipo');
  const isHelpdesk   = tipo === 'helpdesk';

  const switchTo = (next: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    // Clear bandeja-specific params when switching
    params.delete('tab');
    params.delete('cat');
    if (next) params.set('tipo', next); else params.delete('tipo');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* View switcher chips */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => switchTo(null)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: !isHelpdesk ? '#6C3BFF' : 'var(--c-surface-2)',
            color:      !isHelpdesk ? '#fff' : 'var(--c-text-3)',
            border:     '1px solid ' + (!isHelpdesk ? '#6C3BFF' : 'var(--c-border)'),
          }}
        >
          Bandeja
        </button>
        <button
          onClick={() => switchTo('helpdesk')}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: isHelpdesk ? '#6C3BFF' : 'var(--c-surface-2)',
            color:      isHelpdesk ? '#fff' : 'var(--c-text-3)',
            border:     '1px solid ' + (isHelpdesk ? '#6C3BFF' : 'var(--c-border)'),
          }}
        >
          Mesa de ayuda
        </button>
      </div>

      {isHelpdesk ? (
        <div className="flex flex-col gap-6" id="of-helpdesk">
          {/* Header card */}
          {isItSubUser ? (
            <Card padding="none" border elevated={false} className="flex items-center gap-3 px-4 py-3" style={{ border: '1px solid var(--c-border-2)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                {subUserName?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--c-text-4)' }}>
                  Mesa de ayuda
                </p>
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
                  {subUserName ? `Hola, ${subUserName}.` : 'Tu queue de soporte.'}
                  <span className="ml-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
                    Tickets asignados a ti.
                  </span>
                </p>
              </div>
            </Card>
          ) : hasNeo ? (
            <Card padding="none" border elevated={false} className="flex overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
              <img src="/meerkats/neo.png" alt="Neo"
                className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
              <div className="flex-1 min-w-0 py-4 pr-4 pl-3 flex flex-col justify-center">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-4)' }}>
                  Mesa de ayuda
                </p>
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
                  {employeeName} está monitoreando solicitudes, incidentes y pendientes.
                </p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#22c55e' }} />
                    Disponible
                  </span>
                  <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Guardia: {scheduleLabel}</span>
                  {lastActivity && (
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Última actividad: {lastActivity}</span>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="none" border elevated={false} className="flex overflow-hidden"
              style={{ background: 'linear-gradient(to right, rgba(6,182,212,0.07), rgba(245,158,11,0.07))', border: '1px solid rgba(6,182,212,0.25)' }}>
              <img src="/meerkats/neo.png" alt="Neo"
                className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
              <div className="flex-1 min-w-0 py-4 pr-4 pl-3 flex flex-col justify-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(6,182,212,0.7)' }}>
                  Mesa de ayuda
                </p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold leading-snug" style={{ color: '#06b6d4' }}>
                    Neo no está en tu equipo.
                  </p>
                  <div style={{ marginRight: 30 }}>
                    <MeerkatPicker
                      token={token}
                      plan={plan as 'pro'}
                      defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                      preselect="neo"
                      triggerLabel="Contratar"
                    />
                  </div>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                  Sin Neo los tickets se registran solo de forma manual. Neo recibe solicitudes por teléfono, las clasifica y las asigna al técnico de guardia.
                </p>
              </div>
            </Card>
          )}

          {/* Incidents — owner only */}
          {!isItSubUser && (
            <IncidentesSection token={token} initialIncidents={incidents} />
          )}

          <HelpdeskSection token={token} subUserName={subUserName} />
        </div>
      ) : (
        <OpsInboxSection token={token} agents={agents} />
      )}
    </div>
  );
}
