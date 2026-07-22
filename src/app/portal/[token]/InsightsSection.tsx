'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, X, Sparkles, Settings2 } from 'lucide-react';

interface Rec {
  id:            string;
  agent_id:      string;
  agent_name:    string;
  agent_role:    string | null;
  title:         string;
  body:          string;
  metric_key:    string | null;
  current_value: number | null;
  priority:      'high' | 'medium' | 'low';
  status:        'nueva' | 'aplicada' | 'descartada';
  mode:          'llm' | 'rules';
}

interface ApiResponse {
  recs:      Rec[];
  mode:      'llm' | 'rules';
  weekStart: string;
}

const PRIORITY_DOT: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#9ca3af',
};

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Urgente', medium: 'Importante', low: 'Mejora',
};

export default function InsightsSection({ token }: { token: string }) {
  const [data,    setData]    = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/insights`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: 'aplicada' | 'descartada') => {
    setPending(p => ({ ...p, [id]: true }));
    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      return { ...prev, recs: prev.recs.filter(r => r.id !== id) };
    });
    await fetch(`/api/portal/${token}/insights/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    });
    setPending(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const toggleMode = async () => {
    if (!data) return;
    const newMode = data.mode === 'llm' ? 'rules' : 'llm';
    setData(prev => prev ? { ...prev, mode: newMode } : prev);
    await fetch(`/api/portal/${token}/insights`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode: newMode }),
    });
  };

  if (loading) return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
      <div className="h-4 w-40 rounded-md mb-4 animate-pulse" style={{ background: 'var(--c-border)' }} />
      <div className="flex flex-col gap-3">
        {[1, 2].map(i => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--c-border)' }} />
        ))}
      </div>
    </div>
  );

  if (!data || data.recs.length === 0) return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
          Insights de la semana
        </h2>
        <button onClick={toggleMode} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-opacity hover:opacity-70"
          style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}>
          <Settings2 size={10} />
          {data?.mode === 'llm' ? 'IA generativa' : 'Reglas fijas'}
        </button>
      </div>
      <p className="text-sm mt-3" style={{ color: 'var(--c-text-3)' }}>
        {data ? 'Tu equipo tuvo una buena semana. Sin recomendaciones pendientes.' : 'Sin datos disponibles aún. Los insights se generan cada lunes.'}
      </p>
    </div>
  );

  // Group by agent
  const byAgent: Record<string, Rec[]> = {};
  for (const r of data.recs) {
    if (!byAgent[r.agent_name]) byAgent[r.agent_name] = [];
    byAgent[r.agent_name].push(r);
  }

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Insights de la semana
          </h2>
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF' }}>
            <Sparkles size={10} />
            {data.recs.length}
          </span>
        </div>
        <button onClick={toggleMode}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-opacity hover:opacity-70"
          style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}>
          <Settings2 size={10} />
          {data.mode === 'llm' ? 'IA generativa' : 'Reglas fijas'}
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {Object.entries(byAgent).map(([agentName, recs]) => (
          <div key={agentName}>
            <p className="text-[11px] font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--c-text-3)' }}>
              {agentName}
              {recs[0]?.agent_role && (
                <span className="font-normal normal-case tracking-normal ml-1">— {recs[0].agent_role}</span>
              )}
            </p>
            <div className="flex flex-col gap-2">
              {recs.map(rec => (
                <div key={rec.id} className="rounded-lg px-4 py-3 flex gap-3 items-start"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: PRIORITY_DOT[rec.priority], boxShadow: rec.priority === 'high' ? `0 0 5px ${PRIORITY_DOT[rec.priority]}` : 'none' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--c-text)' }}>
                        {rec.title}
                      </p>
                      <span className="text-[10px] flex-shrink-0 mt-0.5 font-medium" style={{ color: PRIORITY_DOT[rec.priority] }}>
                        {PRIORITY_LABEL[rec.priority]}
                      </span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                      {rec.body}
                    </p>
                    {rec.current_value !== null && rec.metric_key && (
                      <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--c-text-3)' }}>
                        {rec.metric_key.replace('ces_', 'CES ').replace('_', ' ')}: {rec.current_value}
                        {rec.metric_key.includes('rate') || rec.metric_key === 'goal' ? '%' : ''}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2.5">
                      <button
                        disabled={!!pending[rec.id]}
                        onClick={() => updateStatus(rec.id, 'aplicada')}
                        className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                        <CheckCircle size={11} />
                        Ya lo apliqué
                      </button>
                      <button
                        disabled={!!pending[rec.id]}
                        onClick={() => updateStatus(rec.id, 'descartada')}
                        className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}>
                        <X size={11} />
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
