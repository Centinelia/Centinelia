'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Check, X, Clock } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  vendedor:     'Ejecutivo de ventas',
  cotizador:    'Cotizador',
  seguimiento:  'Agente de seguimiento',
  recuperacion: 'Ejecutivo de recuperación',
  cobrador:     'Cobrador',
};

interface AgentRef {
  agent_name:    string | null;
  business_name: string;
  outbound_role: string | null;
}

interface Learning {
  id:            string;
  content:       string;
  status:        'pending' | 'approved' | 'rejected';
  created_at:    string;
  vapi_call_id:  string | null;
  agent_id:      string;
  voice_agents:  AgentRef | null;
}

function agentLabel(l: Learning): string {
  const va = l.voice_agents;
  if (!va) return 'Agente';
  if (va.agent_name) return va.agent_name;
  if (va.outbound_role && ROLE_LABELS[va.outbound_role]) return ROLE_LABELS[va.outbound_role];
  return va.business_name;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)   return 'Ahora';
  if (mins < 60)  return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export default function LearningsSection({ token }: { token: string }) {
  const [learnings, setLearnings]   = useState<Learning[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [acting,    setActing]      = useState<Record<string, boolean>>({});
  const [edited,    setEdited]      = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch(`/api/portal/${token}/learnings`)
      .then(r => r.json())
      .then(d => { setLearnings(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setActing(p => ({ ...p, [id]: true }));
    const content = edited[id];
    await fetch(`/api/portal/${token}/learnings/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, ...(content !== undefined ? { content } : {}) }),
    });
    setLearnings(prev =>
      prev.map(l => l.id === id
        ? { ...l, status: action === 'approve' ? 'approved' : 'rejected', content: content ?? l.content }
        : l,
      ),
    );
    setActing(p => ({ ...p, [id]: false }));
  }

  const pending  = learnings.filter(l => l.status === 'pending');
  const approved = learnings.filter(l => l.status === 'approved');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Brain size={18} style={{ color: '#9B6DFF' }} />
        <h3 className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>
          Aprendizajes
        </h3>
        {pending.length > 0 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF' }}
          >
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && (
        <p className="text-sm" style={{ color: 'var(--c-text-sub)' }}>Cargando...</p>
      )}

      {!loading && pending.length === 0 && approved.length === 0 && (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--c-text-sub)' }}>
            Los aprendizajes aparecen aquí cuando el equipo termina llamadas.
            <br />Puedes aprobarlos para que el agente los incorpore a su conocimiento.
          </p>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-3 mb-7">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--c-text-sub)' }}
          >
            Pendientes de revisión
          </p>
          {pending.map(l => (
            <div
              key={l.id}
              className="rounded-xl p-4"
              style={{
                background: 'var(--c-surface)',
                border:     '1px solid rgba(108,59,255,0.25)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF' }}
                >
                  {agentLabel(l).charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                  {agentLabel(l)}
                </span>
                <Clock size={11} style={{ color: 'var(--c-text-sub)' }} />
                <span className="text-xs" style={{ color: 'var(--c-text-sub)' }}>
                  {timeAgo(l.created_at)}
                </span>
              </div>

              <textarea
                rows={3}
                value={edited[l.id] ?? l.content}
                onChange={e => setEdited(p => ({ ...p, [l.id]: e.target.value }))}
                className="w-full text-sm leading-relaxed mb-4 rounded-lg px-3 py-2 resize-y outline-none"
                style={{ background: 'var(--c-bg)', border: '1px solid rgba(108,59,255,0.2)', color: 'var(--c-text)', fontFamily: 'inherit' }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => act(l.id, 'approve')}
                  disabled={acting[l.id]}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                  style={{
                    background: 'rgba(108,59,255,0.12)',
                    color:      '#9B6DFF',
                    border:     '1px solid rgba(108,59,255,0.3)',
                  }}
                >
                  <Check size={13} /> Agregar a KB
                </button>
                <button
                  onClick={() => act(l.id, 'reject')}
                  disabled={acting[l.id]}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    color:      '#ef4444',
                    border:     '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  <X size={13} /> Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approved history */}
      {approved.length > 0 && (
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--c-text-sub)' }}
          >
            Ya en base de conocimiento
          </p>
          <div className="space-y-2">
            {approved.slice(0, 8).map(l => (
              <div
                key={l.id}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                style={{
                  background: 'rgba(34,197,94,0.06)',
                  border:     '1px solid rgba(34,197,94,0.15)',
                }}
              >
                <Check size={13} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
                <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>
                  {l.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
