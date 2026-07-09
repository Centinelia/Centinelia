'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, ArrowRight } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  vendedor:     'Ejecutivo de ventas',
  cotizador:    'Cotizador',
  seguimiento:  'Agente de seguimiento',
  recuperacion: 'Ejecutivo de recuperación',
  cobrador:     'Cobrador',
};

const TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  handoff:  { label: 'Entregué',  color: '#6C3BFF', bg: 'rgba(108,59,255,0.12)' },
  task:     { label: 'Tarea',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  learning: { label: 'Aprendí',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
  insight:  { label: 'Observé',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};

const COLORS = [
  '#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b',
  '#22c55e', '#a855f7', '#ef4444', '#06b6d4',
];

function pickColor(id: string | null): string {
  if (!id) return COLORS[0];
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

interface AgentRef {
  agent_name:    string | null;
  business_name: string;
  outbound_role: string | null;
}

interface FeedMessage {
  id:            string;
  type:          string;
  content:       string;
  metadata:      Record<string, unknown>;
  created_at:    string;
  from_agent_id: string | null;
  to_agent_id:   string | null;
  from_agent:    AgentRef | null;
  to_agent:      AgentRef | null;
}

function label(a: AgentRef | null): string {
  if (!a) return 'Sistema';
  if (a.agent_name) return a.agent_name;
  if (a.outbound_role && ROLE_LABELS[a.outbound_role]) return ROLE_LABELS[a.outbound_role];
  return a.business_name;
}

function roleTag(a: AgentRef | null): string {
  if (!a) return '';
  if (a.outbound_role && ROLE_LABELS[a.outbound_role]) return ROLE_LABELS[a.outbound_role];
  return 'Recepcionista';
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return 'ahora';
  if (mins < 60)  return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'ayer' : `${days}d`;
}

export default function TeamFeed({ token }: { token: string }) {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(() => {
    fetch(`/api/portal/${token}/team-feed`)
      .then(r => r.json())
      .then(d => { setMessages(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Building2 size={18} style={{ color: '#9B6DFF' }} />
        <h3 className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>
          La Oficina
        </h3>
        <span className="text-xs" style={{ color: 'var(--c-text-sub)' }}>
          · comunicación del equipo
        </span>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: 'var(--c-text-sub)' }}>Cargando mensajes...</p>
      )}

      {!loading && messages.length === 0 && (
        <div
          className="rounded-xl p-6 text-center"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--c-text-sub)' }}>
            La oficina empieza a llenarse cuando el equipo atiende sus primeras llamadas.
          </p>
        </div>
      )}

      {!loading && messages.length > 0 && (
        <div className="space-y-3">
          {messages.map(msg => {
            const from  = msg.from_agent;
            const to    = msg.to_agent;
            const cfg   = TYPE_CFG[msg.type] ?? TYPE_CFG.handoff;
            const color = pickColor(msg.from_agent_id);

            return (
              <div
                key={msg.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{
                      background: `${color}1a`,
                      color,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    {label(from).charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center flex-wrap gap-1.5 mb-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                        {label(from)}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-md"
                        style={{
                          background: 'var(--c-bg)',
                          color:      'var(--c-text-sub)',
                          border:     '1px solid var(--c-border)',
                        }}
                      >
                        {roleTag(from)}
                      </span>

                      {to && (
                        <>
                          <ArrowRight size={11} style={{ color: 'var(--c-text-sub)' }} />
                          <span className="text-xs font-medium" style={{ color: cfg.color }}>
                            {label(to)}
                          </span>
                        </>
                      )}

                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>

                      <span
                        className="text-xs ml-auto"
                        style={{ color: 'var(--c-text-sub)' }}
                      >
                        {timeAgo(msg.created_at)}
                      </span>
                    </div>

                    {/* Content */}
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
