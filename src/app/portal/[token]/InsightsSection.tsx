'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, X, RefreshCw } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

interface Rec {
  id:            string;
  agent_name:    string;
  agent_role:    string | null;
  title:         string;
  body:          string;
  metric_key:    string | null;
  current_value: number | null;
  priority:      'high' | 'medium' | 'low';
  status:        'nueva' | 'aplicada' | 'descartada';
}

interface ApiResponse {
  recs:       Rec[];
  mode:       'llm' | 'rules';
  agentCount: number;
  weekStart:  string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#9ca3af',
};
const PRIORITY_LABEL: Record<string, string> = {
  high: 'Urgente', medium: 'Importante', low: 'Mejora',
};

interface ModeConfig {
  label:    string;
  desc:     string;
  costNote: () => string;
  costTag:  (n: number) => string;
  tagColor: string;
  tagBg:    string;
}

const MODE_CONFIG: Record<'llm' | 'rules', ModeConfig> = {
  llm: {
    label:    'Profundo',
    desc:     'Revisa las conversaciones de tu equipo y genera sugerencias específicas para mejorar su desempeño.',
    costNote: () => '2 tareas por empleado',
    costTag:  (n: number) => `${n * 2} tareas en total`,
    tagColor: '#9B6DFF',
    tagBg:    'rgba(108,59,255,0.1)',
  },
  rules: {
    label:    'Básico',
    desc:     'Detecta problemas comunes automáticamente: muchas escalaciones, llamadas sin resolver, metas retrasadas.',
    costNote: () => 'Sin costo',
    costTag:  () => 'Sin costo',
    tagColor: '#22c55e',
    tagBg:    'rgba(34,197,94,0.1)',
  },
};

export default function InsightsSection({ token }: { token: string }) {
  const [data,       setData]       = useState<ApiResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [genError,   setGenError]   = useState<string | null>(null);
  const [pending,    setPending]    = useState<Record<string, boolean>>({});

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
    setData(prev => prev ? { ...prev, recs: prev.recs.filter(r => r.id !== id) } : prev);
    try {
      await fetch(`/api/portal/${token}/insights/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } finally {
      setPending(p => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  const setMode = async (mode: 'llm' | 'rules') => {
    if (!data || data.mode === mode) return;
    setData(prev => prev ? { ...prev, mode } : prev);
    await fetch(`/api/portal/${token}/insights`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
  };

  const generate = async () => {
    setConfirming(false);
    setGenerating(true);
    setGenError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/insights`, { method: 'POST' });
      const json = await res.json() as { ok?: boolean; error?: string; recs?: Rec[] };
      if (!res.ok) {
        setGenError(
          json.error === 'sin_tareas'
            ? 'No tienes suficientes tareas disponibles. Compra más para generarlas.'
            : 'Error al generar. Intenta de nuevo.'
        );
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

  if (loading) return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
      <div className="h-3 w-36 rounded mb-4 animate-pulse" style={{ background: 'var(--c-border)' }} />
      <div className="h-8 w-full rounded-xl mb-3 animate-pulse" style={{ background: 'var(--c-border)' }} />
      <div className="h-14 w-full rounded-lg animate-pulse" style={{ background: 'var(--c-border)' }} />
    </div>
  );

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>

      {/* ── Fila 1: Título ── */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
          Insights de la semana
        </h2>
        <InfoTooltip text="Sugerencias para mejorar a tu equipo basadas en lo que pasó esta semana. Se actualizan cada lunes o las puedes pedir cuando quieras." />
        {data && data.recs.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF' }}>
            {data.recs.length} pendientes
          </span>
        )}
      </div>

      {/* ── Fila 2: Modo + Generar ── */}
      <div className="flex items-start gap-3 mb-4">

        {/* Segmented mode control */}
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-1 p-1 rounded-xl w-fit"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            {(['llm', 'rules'] as Array<'llm' | 'rules'>).map(m => {
              const active = mode === m;
              const cfg    = MODE_CONFIG[m];
              return (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? '#6C3BFF' : 'transparent',
                    color:      active ? '#fff'    : 'var(--c-text-3)',
                  }}>
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed px-1" style={{ color: 'var(--c-text-3)' }}>
            {modeCfg.desc}
          </p>
          <p className="text-[11px] font-medium px-1" style={{ color: modeCfg.tagColor }}>
            {modeCfg.costNote()}
          </p>
        </div>

        {/* Generate button / confirmation */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
          {confirming ? (
            <div className="flex flex-col items-end gap-2 rounded-xl p-3"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <p className="text-xs text-right" style={{ color: 'var(--c-text-2)', maxWidth: 180 }}>
                Se usarán{' '}
                <span className="font-semibold" style={{ color: '#9B6DFF' }}>
                  {modeCfg.costTag(agentCount)}
                </span>{' '}
                de tu saldo. ¿Continuar?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-70"
                  style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}>
                  Cancelar
                </button>
                <button
                  onClick={generate}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-opacity hover:opacity-80"
                  style={{ background: '#6C3BFF', color: '#fff' }}>
                  Confirmar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={mode === 'llm' ? () => setConfirming(true) : generate}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
                {generating ? 'Generando...' : 'Generar ahora'}
              </button>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: modeCfg.tagBg, color: modeCfg.tagColor }}>
                {modeCfg.costTag(agentCount)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {genError && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.18)' }}>
          {genError}
        </div>
      )}

      {/* ── Contenido ── */}
      {!data || data.recs.length === 0 ? (
        <p className="text-sm py-2" style={{ color: 'var(--c-text-3)' }}>
          {data
            ? 'Tu equipo tuvo una buena semana. Sin recomendaciones pendientes.'
            : 'Los insights se generan cada lunes. Usa "Generar ahora" para verlos hoy.'}
        </p>
      ) : (
        <div className="flex flex-col gap-5 pt-1">
          {Object.entries(
            data.recs.reduce<Record<string, Rec[]>>((acc, r) => {
              if (!acc[r.agent_name]) acc[r.agent_name] = [];
              acc[r.agent_name].push(r);
              return acc;
            }, {})
          ).map(([agentName, recs]) => (
            <div key={agentName}>
              {/* Agent header */}
              <p className="text-[11px] font-semibold mb-2.5 uppercase tracking-widest"
                style={{ color: 'var(--c-text-3)' }}>
                {agentName}
                {recs[0]?.agent_role && (
                  <span className="font-normal normal-case tracking-normal ml-1.5" style={{ color: 'var(--c-text-3)' }}>
                    — {recs[0].agent_role}
                  </span>
                )}
              </p>

              {/* Rec cards */}
              <div className="flex flex-col gap-2">
                {recs.map(rec => (
                  <div key={rec.id}
                    className="rounded-lg px-4 py-3 flex gap-3"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>

                    {/* Priority dot */}
                    <div className="mt-1.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full"
                        style={{
                          background: PRIORITY_COLOR[rec.priority],
                          boxShadow: rec.priority === 'high' ? `0 0 6px ${PRIORITY_COLOR[rec.priority]}` : 'none',
                        }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--c-text)' }}>
                          {rec.title}
                        </p>
                        <span className="text-[10px] font-semibold flex-shrink-0 mt-0.5 px-2 py-0.5 rounded-full"
                          style={{
                            background: `${PRIORITY_COLOR[rec.priority]}18`,
                            color:      PRIORITY_COLOR[rec.priority],
                          }}>
                          {PRIORITY_LABEL[rec.priority]}
                        </span>
                      </div>

                      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                        {rec.body}
                      </p>

                      {rec.current_value !== null && rec.metric_key && (
                        <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--c-text-3)' }}>
                          {rec.metric_key.replace('ces_', 'CES ').replace(/_/g, ' ')}: {rec.current_value}
                          {rec.metric_key.includes('rate') || rec.metric_key === 'goal' ? '%' : ''}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          disabled={!!pending[rec.id]}
                          onClick={() => updateStatus(rec.id, 'aplicada')}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                          <CheckCircle size={12} />
                          Ya lo apliqué
                        </button>
                        <button
                          disabled={!!pending[rec.id]}
                          onClick={() => updateStatus(rec.id, 'descartada')}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ background: 'var(--c-border)', color: 'var(--c-text-3)' }}>
                          <X size={12} />
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
      )}
    </div>
  );
}
