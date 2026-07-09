'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, ArrowRight, RefreshCw, Paperclip } from 'lucide-react';

const POLL_MS = 15_000;

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
  email:    { label: 'Correo',    color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'  },
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

function pickColorFromString(s: string): string {
  const hash = s.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

interface AgentRef {
  agent_name:    string | null;
  business_name: string;
  outbound_role: string | null;
}

interface Attachment {
  name: string;
  url:  string;
  type: string;
  size: number;
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

function agentLabel(a: AgentRef | null): string {
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

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TeamFeed({ token }: { token: string }) {
  const [messages,    setMessages]    = useState<FeedMessage[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const r = await fetch(`/api/portal/${token}/team-feed`);
      const d = await r.json();
      if (!Array.isArray(d)) return;
      const hadMessages = knownIds.current.size > 0;
      const newOnes = hadMessages ? d.filter((m: FeedMessage) => !knownIds.current.has(m.id)) : [];
      d.forEach((m: FeedMessage) => knownIds.current.add(m.id));
      if (!hadMessages || newOnes.length > 0) setMessages(d);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

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
        <div className="ml-auto flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--c-text-sub)' }}>
              {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
            style={{ width: 28, height: 28, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
          >
            <RefreshCw size={13} style={{ color: 'var(--c-text-sub)', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
        </div>
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
            const isEmail   = msg.type === 'email';
            const fromAgent = msg.from_agent;
            const toAgent   = msg.to_agent;
            const cfg       = TYPE_CFG[msg.type] ?? TYPE_CFG.handoff;

            const senderName = isEmail
              ? (msg.metadata.from_name as string | null) ?? 'Remitente'
              : agentLabel(fromAgent);
            const senderRole = isEmail ? 'Externo' : roleTag(fromAgent);
            const color      = isEmail
              ? pickColorFromString(senderName)
              : pickColor(msg.from_agent_id);

            const attachments = isEmail
              ? ((msg.metadata.attachments as Attachment[] | null) ?? [])
              : [];

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
                    {senderName.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center flex-wrap gap-1.5 mb-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                        {senderName}
                      </span>
                      {senderRole && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-md"
                          style={{
                            background: 'var(--c-bg)',
                            color:      'var(--c-text-sub)',
                            border:     '1px solid var(--c-border)',
                          }}
                        >
                          {senderRole}
                        </span>
                      )}

                      {toAgent && !isEmail && (
                        <>
                          <ArrowRight size={11} style={{ color: 'var(--c-text-sub)' }} />
                          <span className="text-xs font-medium" style={{ color: cfg.color }}>
                            {agentLabel(toAgent)}
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

                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {attachments.map((att, i) => (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs no-underline transition-opacity hover:opacity-80"
                            style={{
                              background: 'rgba(6,182,212,0.08)',
                              border:     '1px solid rgba(6,182,212,0.25)',
                              color:      '#06b6d4',
                            }}
                          >
                            <Paperclip size={11} />
                            <span className="max-w-[140px] truncate">{att.name}</span>
                            <span style={{ opacity: 0.6 }}>· {formatBytes(att.size)}</span>
                          </a>
                        ))}
                      </div>
                    )}
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
