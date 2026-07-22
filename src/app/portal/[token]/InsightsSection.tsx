'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle, X, Sparkles, ChevronDown, RefreshCw } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

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
  recs:        Rec[];
  mode:        'llm' | 'rules';
  agentCount:  number;
  weekStart:   string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#9ca3af',
};
const PRIORITY_LABEL: Record<string, string> = {
  high: 'Urgente', medium: 'Importante', low: 'Mejora',
};

const MODE_CONFIG = {
  llm: {
    label:    'IA generativa',
    cost:     (n: number) => `${n * 2} ops para generar`,
    desc:     'Claude analiza conversaciones, CES y metas para generar recomendaciones contextuales específicas para tu negocio.',
    costNote: '2 ops por empleado',
  },
  rules: {
    label:    'Reglas fijas',
    cost:     () => 'Sin costo de ops',
    desc:     'Verifica umbrales automáticos: escalación >30%, CES <3.5, caída de llamadas, metas retrasadas. Predecible y sin costo.',
    costNote: 'Sin costo',
  },
} as const;

export default function InsightsSection({ token }: { token: string }) {
  const [data,       setData]       = useState<ApiResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState<string | null>(null);
  const [pending,    setPending]    = useState<Record<string, boolean>>({});
  const [modeOpen,   setModeOpen]   = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/insights`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!modeOpen) return;
    const handler = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modeOpen]);

  const updateStatus = async (id: string, status: 'aplicada' | 'descartada') => {
    setPending(p => ({ ...p, [id]: true }));
    setData(prev => prev ? { ...prev, recs: prev.recs.filter(r => r.id !== id) } : prev);
    await fetch(`/api/portal/${token}/insights/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setPending(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const setMode = async (mode: 'llm' | 'rules') => {
    setModeOpen(false);
    if (data?.mode === mode) return;
    setData(prev => prev ? { ...prev, mode } : prev);
    await fetch(`/api/portal/${token}/insights`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
  };

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/portal/${token}/insights`, { method: 'POST' });
      const json = await res.json() as { ok?: boolean; error?: string; recs?: Rec[]; agentName?: string };
      if (!res.ok) {
        if (json.error === 'sin_ops') setGenError(`Ops insuficientes. Compra más ops para generar con IA.`);
        else setGenError('Ocurrió un error al generar. Intenta de nuevo.');
        return;
      }
      if (json.recs && data) setData({ ...data, recs: json.recs });
    } catch {
      setGenError('Error de conexión. Intenta de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  const mode       = data?.mode ?? 'llm';
  const modeCfg    = MODE_CONFIG[mode];
  const agentCount = data?.agentCount ?? 1;

  const Header = () => (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
          Insights de la semana
        </h2>
        <InfoTooltip text="Recomendaciones accionables para mejorar a cada empleado, basadas en sus conversaciones, CES y metas. Se generan automáticamente cada lunes o puedes pedirlas ahora." />
        {data && data.recs.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF' }}>
            <Sparkles size={10} />
            {data.recs.length}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Generate now button */}
        <div className="flex flex-col items-end gap-0.5">
          <button
            onClick={generate}
            disabled={generating || loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
            <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Generando...' : 'Generar ahora'}
          </button>
          <span className="text-[10px]" style={{ color: 'var(--c-text-3)' }}>
            {modeCfg.cost(agentCount)}
          </span>
        </div>

        {/* Mode selector */}
        <div ref={modeRef} className="relative">
          <button
            onClick={() => setModeOpen(v => !v)}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
            {modeCfg.label}
            <ChevronDown size={10} style={{ transform: modeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {modeOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
              style={{ width: 260, background: 'var(--c-modal, #1e1b2e)', border: '1px solid rgba(108,59,255,0.22)', boxShadow: '0 16px 40px rgba(0,0,0,0.28)' }}>
              {(['llm', 'rules'] as const).map(m => {
                const cfg     = MODE_CONFIG[m];
                const active  = mode === m;
                return (
                  <button key={m} onClick={() => setMode(m)}
                    className="w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors"
                    style={{ background: active ? 'rgba(108,59,255,0.08)' : 'transparent', borderBottom: m === 'llm' ? '1px solid rgba(108,59,255,0.1)' : 'none' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: active ? '#9B6DFF' : 'var(--c-text)' }}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: m === 'llm' ? 'rgba(108,59,255,0.1)' : 'rgba(34,197,94,0.1)', color: m === 'llm' ? '#9B6DFF' : '#22c55e' }}>
                        {cfg.costNote}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                      {cfg.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
      <div className="h-4 w-40 rounded-md mb-4 animate-pulse" style={{ background: 'var(--c-border)' }} />
      <div className="flex flex-col gap-3">
        {[1, 2].map(i => <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--c-border)' }} />)}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <Header />

      {genError && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {genError}
        </div>
      )}

      {!data || data.recs.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          {data
            ? 'Tu equipo tuvo una buena semana. Sin recomendaciones pendientes.'
            : 'Los insights se generan cada lunes. Usa "Generar ahora" para verlos hoy.'}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {Object.entries(
            data.recs.reduce<Record<string, Rec[]>>((acc, r) => {
              if (!acc[r.agent_name]) acc[r.agent_name] = [];
              acc[r.agent_name].push(r);
              return acc;
            }, {})
          ).map(([agentName, recs]) => (
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
                      style={{ background: PRIORITY_COLOR[rec.priority], boxShadow: rec.priority === 'high' ? `0 0 5px ${PRIORITY_COLOR[rec.priority]}` : 'none' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--c-text)' }}>
                          {rec.title}
                        </p>
                        <span className="text-[10px] flex-shrink-0 mt-0.5 font-medium" style={{ color: PRIORITY_COLOR[rec.priority] }}>
                          {PRIORITY_LABEL[rec.priority]}
                        </span>
                      </div>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                        {rec.body}
                      </p>
                      {rec.current_value !== null && rec.metric_key && (
                        <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--c-text-3)' }}>
                          {rec.metric_key.replace('ces_', 'CES ').replace(/_/g, ' ')}: {rec.current_value}
                          {rec.metric_key.includes('rate') || rec.metric_key === 'goal' ? '%' : ''}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2.5">
                        <button disabled={!!pending[rec.id]} onClick={() => updateStatus(rec.id, 'aplicada')}
                          className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                          <CheckCircle size={11} /> Ya lo apliqué
                        </button>
                        <button disabled={!!pending[rec.id]} onClick={() => updateStatus(rec.id, 'descartada')}
                          className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}>
                          <X size={11} /> Descartar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
