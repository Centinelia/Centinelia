'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { PhoneCall, PhoneOutgoing, PhoneMissed } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, SectionHeader } from '@/components/portal-ui';
import type { VoiceCall } from '@/types/agent';
import type { LlamadasFiltro } from './page';
import CallsSearch          from '../../CallsSearch';
import DownloadCallsCSV     from '../../DownloadCallsCSV';
import OutboundHistoryList  from '../OutboundHistoryList';
import type { OutboundCallRow } from '../OutboundHistoryList';
import Link                 from 'next/link';
// LeadsTabsSection removed (all-time, no period filter) — data reflected in /inicio KPIs
// OutboundToggles moved to /configurar > Herramientas > Llamadas salientes

interface OutboundAgent { id: string; agent_name: string | null; business_name: string }

interface Counters {
  hoy:      number;
  semana:   number;
  leads:    number;
  outbound: number;
}

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
  outboundHistory:   OutboundCallRow[];
  outboundAgents:    OutboundAgent[];
  callerNames:       Record<string, string>;
  agentNameById?:    Record<string, string>;
  counters?:         Counters;
}

type PillDef = {
  id:       LlamadasFiltro;
  label:    string;
  icon:     React.ElementType;
  visible:  boolean;
  color:    string; // active bg color
};

function KpiInline({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-2.5 rounded-xl min-w-0"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] truncate" style={{ color: '#6B6480' }}>
        {label}
      </p>
      <p className="text-[20px] font-bold leading-none tabular-nums" style={{ color: accent }}>
        {value.toLocaleString('es-MX')}
      </p>
    </div>
  );
}

export default function LlamadasTabs({
  token, filtro,
  isPro, businessName, agentName,
  calls, leads, orders, appts,
  showLeads, showOrders, showAppts,
  showOutbound, initOutbound, initMissedCall,
  outboundHistory, outboundAgents,
  callerNames, agentNameById, counters,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const setFiltro = (f: LlamadasFiltro) => {
    router.push(`${pathname}?filtro=${f}`);
  };

  // 'Campañas' se movió a página propia /oficina/campanas (2026-08-06).
  // Aquí solo dejamos filtros de atención directa: Entrantes, Salientes
  // manuales, Recovery.
  const pills: PillDef[] = ([
    { id: 'entrantes' as LlamadasFiltro, label: 'Entrantes', icon: PhoneCall,     visible: true,           color: '#6C3BFF' },
    { id: 'salientes' as LlamadasFiltro, label: 'Salientes', icon: PhoneOutgoing, visible: showOutbound,   color: '#a855f7' },
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

  const c = counters ?? { hoy: 0, semana: 0, leads: 0, outbound: 0 };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiInline label="Hoy"                value={c.hoy}      accent="#6C3BFF" />
        <KpiInline label="7 días"             value={c.semana}   accent="#3B82F6" />
        <KpiInline label="Leads 7 días"       value={c.leads}    accent="#22C55E" />
        <KpiInline label="Salientes 7 días"   value={c.outbound} accent="#A855F7" />
      </section>

      {/* ── Pills workspace-style ─────────────────────────────────────────── */}
      {pills.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pills.map(pill => {
            const Icon   = pill.icon;
            const active = filtro === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setFiltro(pill.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
                style={active
                  ? { background: '#1A0A3B', color: '#ffffff', border: '1px solid #1A0A3B' }
                  : { background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5', cursor: 'pointer' }}
              >
                <Icon size={14} strokeWidth={1.75} />
                {pill.label}
                {pill.id === 'entrantes' && calls.length > 0 && (
                  <span className="text-[11px] tabular-nums" style={{ opacity: 0.7 }}>
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

      {/* Salientes — historial de llamadas salientes ya realizadas.
          Contactos y campañas viven en /oficina/campanas. */}
      {filtro === 'salientes' && showOutbound && (
        <>
          {initOutbound ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-semibold" style={{ color: '#1A0A3B' }}>Historial de llamadas salientes</h2>
                  <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                    Todas las llamadas que tus empleados han hecho. Para lanzar nuevas, usa{' '}
                    <Link href={`/portal/${token}/oficina/campanas`} className="font-medium underline" style={{ color: '#6C3BFF' }}>Campañas</Link>.
                  </p>
                </div>
              </div>
              <OutboundHistoryList calls={outboundHistory} agentNameById={agentNameById ?? {}} />
            </div>
          ) : (
            <Card padding="md">
              <EmptyState
                icon={PhoneOutgoing}
                title="Llamadas salientes desactivadas"
                description="Activa la función en el empleado que quieres que haga llamadas de seguimiento, cobro o recuperación. Los coordinadores (Nox, Niva) no tienen voz. Solo empleados con voz pueden hacer salientes."
                size="sm"
                action={
                  <Link
                    href={`/portal/${token}/empleados`}
                    className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                    style={{ background: '#6C3BFF', color: '#fff', textDecoration: 'none' }}
                  >
                    Elegir empleado →
                  </Link>
                }
              />
            </Card>
          )}
        </>
      )}

      {/* 'Campañas' fue promovida a página propia — ver /oficina/campanas
          (commit 2026-08-06). Si alguien llega con ?filtro=campanas por
          bookmark viejo, el page.tsx server-side hace redirect. */}

      {/* Recovery — el gate initMissedCall ya asegura que la feature esté activa.
          Copy honesto: si estamos aquí es porque está activo y no hay perdidas. */}
      {filtro === 'recovery' && initMissedCall && (
        <Card padding="md">
          <EmptyState
            icon={PhoneMissed}
            title="Sin llamadas perdidas"
            description="Tu empleado devuelve automáticamente cada llamada que se pierde. Aquí verás el historial cuando ocurra alguna."
            size="sm"
          />
        </Card>
      )}
      {filtro === 'recovery' && !initMissedCall && (
        <Card padding="md">
          <EmptyState
            icon={PhoneMissed}
            title="Recuperación de llamadas desactivada"
            description="Actívala en el empleado que quieres que devuelva llamadas perdidas. Solo aplica a empleados con voz, no a coordinadores."
            size="sm"
            action={
              <Link
                href={`/portal/${token}/empleados`}
                className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', textDecoration: 'none' }}
              >
                Elegir empleado →
              </Link>
            }
          />
        </Card>
      )}

    </div>
  );
}
