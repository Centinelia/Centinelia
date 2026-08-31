export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ClipboardList, BookOpen } from 'lucide-react';
import OficinaPageHero from '../OficinaPageHero';
import { loadBitacoraData } from './loadBitacoraData';
import { BitacoraClient } from './BitacoraClient';
import { BitacoraTabs } from './BitacoraTabs';
import { LiveFileControls } from './LiveFileControls';
import { createAdminClient } from '@/lib/supabase/admin';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ week?: string; agent_id?: string }>;
}

export default async function BitacoraPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { week, agent_id } = await searchParams;
  const data = await loadBitacoraData(token, week, 'weekly', agent_id);
  if (!data) notFound();

  // Check si el agent activo tiene template custom (para decidir si mostrar
  // botón de subir versión editada).
  const supabaseCheck = createAdminClient();
  const { data: agentTemplateCheck } = await supabaseCheck
    .from('voice_agents')
    .select('bitacora_template')
    .eq('id', data.agent.id)
    .maybeSingle();
  const hasCustomTemplate = !!(agentTemplateCheck?.bitacora_template as { url?: string } | null)?.url;

  if (!data.enabled) {
    return (
      <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
        <header className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
          >
            <BookOpen size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
              Bitácora
            </p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
              Bitácora semanal
            </h1>
            <p className="text-[14px]" style={{ color: '#6B6480' }}>
              Un registro automático de quejas y altas de clientes, con seguimiento semanal y envío por correo.
            </p>
          </div>
        </header>

        <div
          className="flex items-stretch rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(108,59,255,0.08) 0%, rgba(217,119,6,0.06) 60%, #ffffff 100%)',
            border:     '1px solid rgba(108,59,255,0.30)',
            boxShadow:  '0 4px 20px rgba(108,59,255,0.08)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/meerkats/nelia.png"
            alt="Nelia"
            className="w-36 h-36 object-contain object-bottom shrink-0 self-end"
          />
          <div className="flex-1 min-w-0 py-5 pr-5 pl-2 flex flex-col justify-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6C3BFF', letterSpacing: '0.08em' }}>
              Activa el seguimiento con Nelia
            </p>
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Aún no activaste el flujo de bitácora.
            </h2>
            <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
              Cuando un cliente te llama para reportar una queja o darse de alta, Nelia registra el evento, agenda la llamada de verificación a +3 días y te manda un correo semanal con el resumen en tu propio formato Excel.
            </p>
            <p className="text-[12px] mt-1" style={{ color: '#9B8FB5' }}>
              Contacta a tu ejecutivo Centinelia para habilitarlo en tu cuenta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={ClipboardList}
        eyebrow="Bitacora"
        title="Bitacora semanal"
        description="Registro semanal por empleado. La plantilla, el envío automático y las columnas se configuran en la ficha del empleado."
      />
      <BitacoraTabs token={token} activeId={data.agent.id} agents={data.bitacoraAgents} />
      <BitacoraClient token={token} initial={data} />
      <LiveFileControls
        token={token}
        agentId={data.agent.id}
        agentName={data.agent.agent_name ?? 'empleado'}
        hasCustomTemplate={hasCustomTemplate}
      />
    </div>
  );
}
