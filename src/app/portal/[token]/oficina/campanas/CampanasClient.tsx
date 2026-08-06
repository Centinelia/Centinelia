'use client';

import { Megaphone, Users, PhoneOutgoing, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/portal-ui';
import { EmptyState } from '@/components/ui/empty-state';
import OutboundSection from '../../OutboundSection';

interface OutboundAgent { id: string; agent_name: string | null; business_name: string }

interface Counters {
  campanasActivas: number;
  contactos:       number;
  llamadasHoy:     number;
  completadas:     number;
}

interface Props {
  token:          string;
  showOutbound:   boolean;
  initOutbound:   boolean;
  contacts:       any[];
  campaigns:      any[];
  outboundAgents: OutboundAgent[];
  counters:       Counters;
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
  contacts, campaigns, outboundAgents, counters,
}: Props) {
  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">

      {/* Hero */}
      <header className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
          Campañas
        </p>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          Automatiza llamadas salientes
        </h1>
        <p className="text-[14px]" style={{ color: '#6B6480' }}>
          {counters.campanasActivas > 0 ? (
            <>
              <strong style={{ color: '#1A0A3B' }}>{counters.campanasActivas}</strong> {counters.campanasActivas === 1 ? 'campaña activa' : 'campañas activas'}
              {' · '}{counters.contactos} contactos disponibles
              {' · '}{counters.completadas} llamadas completadas esta semana
            </>
          ) : (
            <>Sin campañas activas. Crea una para que tu empleado llame a tus contactos automáticamente en el horario que elijas.</>
          )}
        </p>
      </header>

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
            title="Llamadas salientes desactivadas"
            description="Activa esta función desde Configurar tu empleado > Herramientas > Llamadas salientes."
            size="sm"
          />
        </Card>
      ) : !initOutbound ? (
        <Card padding="md">
          <EmptyState
            icon={PhoneOutgoing}
            title="Outbound no está activado en ningún empleado"
            description="Ve a Configurar tu empleado > Herramientas > Llamadas salientes para activarlo."
            size="sm"
          />
        </Card>
      ) : (
        <OutboundSection
          token={token}
          initialContacts={contacts}
          initialCampaigns={campaigns}
          agents={outboundAgents}
          initialTab="campanas"
        />
      )}
    </div>
  );
}
