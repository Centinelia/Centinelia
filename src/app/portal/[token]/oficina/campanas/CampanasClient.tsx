'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Megaphone, PhoneOutgoing, PieChart, Users } from 'lucide-react';
import { Card } from '@/components/portal-ui';
import { EmptyState } from '@/components/ui/empty-state';
import OutboundSection from '../../OutboundSection';
import EncuestasSection from '../encuestas/EncuestasSection';
import OficinaPageHero from '../OficinaPageHero';

// ── Tipos compartidos ───────────────────────────────────────────────────────
export type CampanasTab = 'llamadas' | 'encuestas';

interface OutboundAgent { id: string; agent_name: string | null; business_name: string }

interface OutboundData {
  show:             boolean;                 // showOutbound (feature gate del rol)
  initialized:      boolean;                 // initOutbound (algún empleado con la tool)
  contacts:         unknown[];
  campaigns:        unknown[];
  agents:           OutboundAgent[];
  minutesRemaining: number;
}

interface SurveysData {
  agentName?:      string;
  hasSurveyAgent:  boolean;
  plan:            string;
  defaultTier:     string;
}

interface Counters {
  campanasActivas: number;
  contactos:       number;
  llamadasHoy:     number;
  completadas:     number;
}

interface Props {
  token:        string;
  initialTab:   CampanasTab;
  visibleTabs:  CampanasTab[];   // qué tabs puede ver este usuario (owner: todos; sub-user: subset)
  outbound:     OutboundData;
  surveys:      SurveysData;
  counters:     Counters;
}

const TAB_META: Record<CampanasTab, { label: string; icon: React.ElementType; description: string }> = {
  llamadas:  { label: 'Llamadas',  icon: PhoneOutgoing, description: 'Programa a tu equipo para llamar a listas de contactos.' },
  encuestas: { label: 'Encuestas', icon: PieChart,      description: 'Encuestas de satisfacción que tu equipo aplica al terminar cada llamada.' },
};

// ── KPI compacto reutilizable ──────────────────────────────────────────────
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

export default function CampanasClient({ token, initialTab, visibleTabs, outbound, surveys, counters }: Props) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  // Fallback si el initialTab no es visible para el usuario
  const safeInitial: CampanasTab = visibleTabs.includes(initialTab) ? initialTab : (visibleTabs[0] ?? 'llamadas');
  const [tab, setTab] = useState<CampanasTab>(safeInitial);

  // URL sync — llamadas es default (sin query), el resto se persiste
  useEffect(() => {
    const q = new URLSearchParams(Array.from(searchParams.entries()));
    if (tab === 'llamadas') q.delete('tab'); else q.set('tab', tab);
    const url = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    router.replace(url, { scroll: false });
  }, [tab, pathname, router, searchParams]);

  // ── Hero dinámico según tab activo ────────────────────────────────────────
  // Contactos ya no vive aquí (2026-08-10) — su propia página en /oficina/contactos.
  const heroDescription = tab === 'llamadas'
    ? (counters.campanasActivas > 0
        ? `${counters.campanasActivas} ${counters.campanasActivas === 1 ? 'campaña activa' : 'campañas activas'} · ${counters.completadas} llamadas completadas esta semana.`
        : 'Programa a tu equipo para que llame a tus contactos en el horario que elijas.')
    : 'Diseña una vez y tu equipo aplica la encuesta al terminar cada llamada. Los resultados y hallazgos aparecen aquí.';

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={Megaphone}
        eyebrow="Campañas"
        title="Acciones masivas hacia tus clientes"
        description={heroDescription}
        right={
          <Link
            href={`/portal/${token}/oficina/contactos`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style={{
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              color:      '#6C3BFF',
              boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
            }}
          >
            <Users size={13} strokeWidth={2} />
            Ver contactos
          </Link>
        }
      />

      {/* Sub-tabs — solo aparece si hay más de una visible */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(TAB_META) as CampanasTab[])
            .filter(t => visibleTabs.includes(t))
            .map(t => {
              const meta   = TAB_META[t];
              const Icon   = meta.icon;
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
                  style={{
                    background: active ? '#1A0A3B' : '#ffffff',
                    color:      active ? '#ffffff' : '#6B6480',
                    border:     active ? '1px solid #1A0A3B' : '1px solid #E8E3F5',
                    cursor:     'pointer',
                  }}
                >
                  <Icon size={14} strokeWidth={1.75} />
                  {meta.label}
                </button>
              );
            })}
        </div>
      )}

      {/* KPI strip — solo se muestra en tab llamadas (encuestas tiene su propio dashboard interno) */}
      {tab === 'llamadas' && (
        <section className="grid grid-cols-3 gap-3">
          <KpiInline label="Campañas activas"  value={counters.campanasActivas} accent="#A855F7" />
          <KpiInline label="Llamadas hoy"       value={counters.llamadasHoy}    accent="#F59E0B" />
          <KpiInline label="Completadas 7 días" value={counters.completadas}    accent="#22C55E" />
        </section>
      )}

      {/* ── Body por tab ─────────────────────────────────────────────────── */}
      {tab === 'llamadas' && (
        !outbound.show ? (
          <Card padding="md">
            <EmptyState
              icon={Megaphone}
              title="Las llamadas salientes están apagadas"
              description="Enciéndelas para que tus empleados puedan marcarle a contactos. Se activa en Configurar > tu empleado > Llamadas salientes."
              size="sm"
            />
          </Card>
        ) : !outbound.initialized ? (
          <Card padding="md">
            <EmptyState
              icon={PhoneOutgoing}
              title="Ningún empleado tiene activadas las llamadas salientes"
              description="Ve a Configurar, elige un empleado y enciende Llamadas salientes en Herramientas."
              size="sm"
            />
          </Card>
        ) : (
          <OutboundSection
            token={token}
            initialContacts={outbound.contacts as never[]}
            initialCampaigns={outbound.campaigns as never[]}
            agents={outbound.agents}
            initialTab="campanas"
            show="campanas"
            minutesRemaining={outbound.minutesRemaining}
          />
        )
      )}

      {tab === 'encuestas' && (
        <EncuestasSection
          token={token}
          agentName={surveys.agentName}
          hasSurveyAgent={surveys.hasSurveyAgent}
          plan={surveys.plan}
          defaultTier={surveys.defaultTier}
        />
      )}
    </div>
  );
}
