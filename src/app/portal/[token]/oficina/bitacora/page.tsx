export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
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
        <OficinaPageHero
          icon={ClipboardList}
          eyebrow="Bitacora"
          title="Bitacora semanal"
        />
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}
        >
          <ClipboardList size={20} style={{ color: '#9B8FB5', margin: '0 auto 8px' }} />
          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
            Bitacora no habilitada para esta cuenta
          </p>
          <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
            El seguimiento de incidencias de clientes no esta activo en tu plan.
          </p>
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
