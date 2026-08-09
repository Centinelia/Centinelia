'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, X, RefreshCw, ArrowRight } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

// Infiere meerkat por el nombre exacto (Nia, Noah, Nox, Niva, Sofía, Neo,
// Nash, Nova, Naia). Fallback a null si es un nombre custom.
function meerkatByName(name: string): { color: string | null; img: string | null } {
  const key = name.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = Object.values(MEERKAT_MAP).find(mk => mk.nombre?.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') === key);
  return { color: m?.color ?? null, img: m?.imagen ?? null };
}

interface Rec {
  id:            string;
  agent_name:    string;
  agent_role:    string | null;
  title:         string;
  body:          string;
  metric_key:    string | null;
  current_value: number | null;
  priority:      'high' | 'medium' | 'low';
  status:        'nueva' | 'aplicada' | 'descartada' | 'expirada';
  deep_link:     string | null;
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
    label:    'Con lectura de conversaciones',
    desc:     'Tu equipo lee sus propias llamadas y correos de la semana y te sugiere qué ajustar. Toma más tiempo pero encuentra detalles finos.',
    costNote: () => '2 tareas por empleado',
    costTag:  (n: number) => `${n * 2} tareas en total`,
    tagColor: '#9B6DFF',
    tagBg:    'rgba(108,59,255,0.1)',
  },
  rules: {
    label:    'Rápido',
    desc:     'Detecta problemas comunes al vuelo: muchas escalaciones, llamadas sin resolver, metas retrasadas. Sin costo.',
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
    <div className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
      <div className="h-3 w-36 rounded mb-4 animate-pulse" style={{ background: '#F0EDF9' }} />
      <div className="h-8 w-full rounded-xl mb-3 animate-pulse" style={{ background: '#F0EDF9' }} />
      <div className="h-14 w-full rounded-lg animate-pulse" style={{ background: '#F0EDF9' }} />
    </div>
  );

  const grouped = data && data.recs.length > 0
    ? Object.entries(
        data.recs.reduce<Record<string, Rec[]>>((acc, r) => {
          if (!acc[r.agent_name]) acc[r.agent_name] = [];
          acc[r.agent_name].push(r);
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Ideas para mejorar a tu equipo
            </h2>
            {data && data.recs.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {data.recs.length}
              </span>
            )}
            <InfoTooltip text="Sugerencias concretas para que tu equipo trabaje mejor. Se actualizan cada lunes con lo que aprendieron esta semana, o puedes pedirlas cuando quieras." />
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Lo que tu equipo detectó que podría mejorarse en su forma de trabajar.
          </p>
        </div>
      </div>

      {/* Mode + Generar */}
      <div className="px-5 py-4 flex items-start gap-3 flex-wrap" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
        <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
          <div className="flex gap-1 p-1 rounded-lg w-fit"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
            {(['llm', 'rules'] as Array<'llm' | 'rules'>).map(m => {
              const active = mode === m;
              const cfg    = MODE_CONFIG[m];
              return (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
                  style={{
                    background: active ? '#6C3BFF' : 'transparent',
                    color:      active ? '#fff'    : '#6B6480',
                    boxShadow:  active ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
                    border:     'none',
                    cursor:     'pointer',
                  }}>
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed px-1" style={{ color: '#6B6480' }}>
            {modeCfg.desc}
          </p>
          <p className="text-[11px] font-medium px-1" style={{ color: modeCfg.tagColor }}>
            {modeCfg.costNote()}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
          {confirming ? (
            <div className="flex flex-col items-end gap-2 rounded-xl p-3"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)' }}>
              <p className="text-[12px] text-right" style={{ color: '#1A0A3B', maxWidth: 180 }}>
                Se usarán{' '}
                <span className="font-semibold" style={{ color: '#6C3BFF' }}>
                  {modeCfg.costTag(agentCount)}
                </span>{' '}
                de tu saldo. ¿Continuar?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="text-[12px] px-3 h-7 rounded-lg font-medium transition-opacity hover:opacity-70"
                  style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                  Cancelar
                </button>
                <button
                  onClick={generate}
                  className="flex items-center gap-1.5 text-[12px] px-3 h-7 rounded-lg font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                  Confirmar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={mode === 'llm' ? () => setConfirming(true) : generate}
                disabled={generating}
                className="flex items-center gap-1.5 text-[12px] font-semibold px-4 h-8 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
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

      {/* Error banner */}
      {genError && (
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}>
          {genError}
        </div>
      )}

      {/* Contenido */}
      {!data || data.recs.length === 0 ? (
        <div className="px-5 py-6" style={{ borderTop: '1px solid #F0EDF9' }}>
          <p className="text-[13px]" style={{ color: '#6B6480' }}>
            {data
              ? 'Tu equipo tuvo una buena semana. Sin ideas pendientes por ahora.'
              : 'Las ideas se generan cada lunes. Usa "Generar ahora" para verlas hoy.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {grouped.map(([agentName, recs], gIdx) => {
            const mk = meerkatByName(agentName);
            const accent = mk.color ?? '#6C3BFF';
            return (
            <div key={agentName}
              style={{ borderBottom: gIdx === grouped.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
              {/* Agent header con avatar del meerkat y su color */}
              <div className="flex items-center gap-2.5 px-5 py-3" style={{ background: '#FAFAFB' }}>
                {mk.img ? (
                  <img
                    src={mk.img}
                    alt={agentName}
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      objectFit: 'cover', objectPosition: '50% 8%',
                      border: `1.5px solid ${accent}45`,
                      background: '#ffffff',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{ background: `${accent}20`, color: accent }}>
                    {agentName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[12px] font-semibold" style={{ color: accent }}>
                  {agentName}
                </span>
                {recs[0]?.agent_role && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: `${accent}12`, color: accent }}>
                    {recs[0].agent_role}
                  </span>
                )}
              </div>

              {/* Rec rows */}
              {recs.map((rec) => (
                <div key={rec.id}
                  className="px-5 py-4 flex gap-3"
                  style={{ borderTop: '1px solid #F0EDF9' }}>

                  {/* Priority dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full"
                      style={{
                        background: PRIORITY_COLOR[rec.priority],
                        boxShadow: rec.priority === 'high' ? `0 0 6px ${PRIORITY_COLOR[rec.priority]}` : 'none',
                      }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-[13px] font-semibold leading-snug" style={{ color: '#1A0A3B' }}>
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

                    <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                      {rec.body}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {rec.deep_link ? (
                        <a
                          href={rec.deep_link}
                          className="flex items-center gap-1.5 text-[12px] px-3 h-7 rounded-lg font-semibold no-underline transition-opacity hover:opacity-90"
                          style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                          Aplicar
                          <ArrowRight size={12} />
                        </a>
                      ) : null}
                      <button
                        disabled={!!pending[rec.id]}
                        onClick={() => updateStatus(rec.id, 'aplicada')}
                        className="flex items-center gap-1.5 text-[12px] px-3 h-7 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
                        <CheckCircle size={12} />
                        Ya lo apliqué
                      </button>
                      <button
                        disabled={!!pending[rec.id]}
                        onClick={() => updateStatus(rec.id, 'descartada')}
                        className="flex items-center gap-1.5 text-[12px] px-3 h-7 rounded-lg font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                        style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                        <X size={12} />
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
