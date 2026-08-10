'use client';

import { Megaphone, PhoneOutgoing } from 'lucide-react';
import { Card } from '@/components/portal-ui';
import { EmptyState } from '@/components/ui/empty-state';
import OutboundSection from '../../OutboundSection';
import OficinaPageHero from '../OficinaPageHero';

interface OutboundAgent { id: string; agent_name: string | null; business_name: string }

interface Counters {
  campanasActivas: number;
  contactos:       number;
  llamadasHoy:     number;
  completadas:     number;
}

interface Props {
  token:            string;
  showOutbound:     boolean;
  initOutbound:     boolean;
  contacts:         any[];
  campaigns:        any[];
  outboundAgents:   OutboundAgent[];
  counters:         Counters;
  minutesRemaining: number;
}

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

export default function CampanasClient({
  token, showOutbound, initOutbound,
  contacts, campaigns, outboundAgents, counters, minutesRemaining,
}: Props) {
  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={Megaphone}
        eyebrow="Campañas"
        title="Automatiza llamadas salientes"
        description={counters.campanasActivas > 0
          ? `${counters.campanasActivas} ${counters.campanasActivas === 1 ? 'campaña activa' : 'campañas activas'} · ${counters.contactos} contactos disponibles · ${counters.completadas} llamadas completadas esta semana.`
          : 'Programa a tu equipo para que llame a tus contactos en el horario que elijas. Ideal para cobranza, seguimientos de leads y recordatorios.'}
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiInline label="Campañas activas"  value={counters.campanasActivas} accent="#A855F7" />
        <KpiInline label="Contactos"          value={counters.contactos}      accent="#6C3BFF" />
        <KpiInline label="Llamadas hoy"       value={counters.llamadasHoy}    accent="#F59E0B" />
        <KpiInline label="Completadas 7 días" value={counters.completadas}    accent="#22C55E" />
      </section>

      {/* Contenido */}
      {!showOutbound ? (
        <Card padding="md">
          <EmptyState
            icon={Megaphone}
            title="Las llamadas salientes están apagadas"
            description="Enciéndelas para que tus empleados puedan marcarle a contactos. Se activa en Configurar > tu empleado > Llamadas salientes."
            size="sm"
          />
        </Card>
      ) : !initOutbound ? (
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
          initialContacts={contacts}
          initialCampaigns={campaigns}
          agents={outboundAgents}
          initialTab="contactos"
          show="both"
          minutesRemaining={minutesRemaining}
        />
      )}
    </div>
  );
}
