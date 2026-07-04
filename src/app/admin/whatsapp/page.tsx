import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { MessageCircle, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { WA_MESSAGES_PLAN_CONFIG } from '@/lib/billing/plans';
import type { WaMessagesPlan } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export default async function WhatsAppMonitorPage() {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, active, wa_phone_number, capture_leads, capture_appointments, capture_orders, wa_messages_plan, wa_messages_used, wa_messages_included')
    .not('wa_phone_number', 'is', null)
    .order('created_at', { ascending: false });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>WhatsApp</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-3)' }}>
          {agents?.length ?? 0} agente{(agents?.length ?? 0) !== 1 ? 's' : ''} con WhatsApp activo
        </p>
      </div>

      {!agents || agents.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
          <MessageCircle size={36} className="mx-auto mb-3 opacity-30" style={{ color: '#25D366' }} />
          <p className="font-medium" style={{ color: 'var(--c-text)' }}>Ningún agente tiene WhatsApp activo</p>
          <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: 'var(--c-text-3)' }}>
            Para activar WhatsApp en un agente Pro, ve a <strong>Agentes de voz</strong> → selecciona el agente → tab <strong>WhatsApp</strong>.
          </p>
          <Link
            href="/admin/agentes"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            Ver agentes <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {agents.map((agent: any) => {
            const used     = agent.wa_messages_used ?? 0;
            const included = agent.wa_messages_included ?? 0;
            const pct      = included > 0 ? Math.min((used / included) * 100, 100) : 0;
            const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#25D366';
            const plan     = agent.wa_messages_plan as WaMessagesPlan | null;
            const planLabel = plan ? WA_MESSAGES_PLAN_CONFIG[plan]?.label : null;

            return (
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
                    {planLabel && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.2)' }}>
                        {planLabel}
                      </span>
                    )}
                  </div>

                  <p className="text-xs mt-1 font-mono" style={{ color: '#25D366' }}>{agent.wa_phone_number}</p>

                  <div className="flex gap-2 mt-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
                    {[
                      agent.capture_leads        && 'Leads',
                      agent.capture_appointments && 'Citas',
                      agent.capture_orders       && 'Pedidos',
                    ].filter(Boolean).map((label, i, arr) => (
                      <span key={label as string}>{i > 0 ? '· ' : ''}{label}</span>
                    ))}
                    {!agent.capture_leads && !agent.capture_appointments && !agent.capture_orders && (
                      <span style={{ color: 'var(--c-text-4)' }}>Sin capturas activas</span>
                    )}
                  </div>

                  {included > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>
                        <span>{used} / {included} mensajes</span>
                        <span style={{ color: barColor }}>{Math.round(pct)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  href={`/admin/agentes/${agent.id}/editar?tab=whatsapp`}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 flex items-center gap-1"
                  style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
                >
                  Configurar <ArrowRight size={11} />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
