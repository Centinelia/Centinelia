import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { MessageCircle, Plus, CheckCircle, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function WhatsAppAgentsPage() {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('*')
    .not('wa_phone_number', 'is', null)
    .order('created_at', { ascending: false });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Agentes de WhatsApp</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {agents?.length ?? 0} agente{(agents?.length ?? 0) !== 1 ? 's' : ''} configurado{(agents?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/whatsapp/nuevo"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: '#25D366', color: '#fff' }}
        >
          <Plus size={15} />
          Nuevo agente WA
        </Link>
      </div>

      {!agents || agents.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
          <MessageCircle size={36} className="mx-auto mb-3 opacity-30" style={{ color: '#25D366' }} />
          <p className="font-medium" style={{ color: 'var(--c-text)' }}>Sin agentes de WhatsApp</p>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>Crea tu primer agente para empezar a atender clientes por WhatsApp.</p>
          <Link
            href="/admin/whatsapp/nuevo"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90"
            style={{ background: '#25D366', color: '#fff' }}
          >
            <Plus size={14} /> Crear agente
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {agents.map((agent: any) => (
            <div key={agent.id}
              className="rounded-2xl p-5 flex items-start gap-4"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(37,211,102,0.12)' }}>
                <MessageCircle size={20} style={{ color: '#25D366' }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                    {agent.business_name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>· {agent.client_name}</span>
                  {agent.active
                    ? <CheckCircle size={13} style={{ color: '#22c55e' }} />
                    : <XCircle size={13} style={{ color: '#6b7280' }} />
                  }
                </div>
                <p className="text-xs mt-1 font-mono" style={{ color: '#25D366' }}>{agent.wa_phone_number}</p>
                <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
                  {agent.capture_leads        && <span>· Leads</span>}
                  {agent.capture_appointments && <span>· Citas</span>}
                  {agent.capture_orders       && <span>· Pedidos</span>}
                </div>
              </div>

              <Link
                href={`/admin/whatsapp/${agent.id}`}
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
                style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
              >
                Ver / editar
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
