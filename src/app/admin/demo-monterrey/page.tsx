import { createAdminClient } from '@/lib/supabase/admin';
import DemoAgentEditor from '../demo/DemoAgentEditor';
import type { VoiceAgent } from '@/types/agent';

export const dynamic = 'force-dynamic';

export default async function DemoMonterreyPage() {
  const agentId = process.env.DEMO_MONTERREY_AGENT_ID;

  if (!agentId) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-xl font-bold mb-3" style={{ color: 'var(--c-text)' }}>Demo personalizado</h1>
        <div className="rounded-xl p-5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: '#f59e0b' }}>Falta configurar el ID del agente demo</p>
          <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            Agrega la variable de entorno <code className="px-1 rounded" style={{ background: 'var(--c-surface)', fontFamily: 'monospace' }}>DEMO_MONTERREY_AGENT_ID</code> con el UUID del agente demo de Monterrey en Supabase.
          </p>
          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            Encuéntralo en la URL al editar el agente: <code style={{ fontFamily: 'monospace' }}>/admin/agentes/&#123;uuid&#125;/editar</code>
          </p>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();
  const { data } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-sm" style={{ color: '#ef4444' }}>
          No se encontró el agente con ID: <code>{agentId}</code>
        </p>
      </div>
    );
  }

  return <DemoAgentEditor agent={data as VoiceAgent} />;
}
