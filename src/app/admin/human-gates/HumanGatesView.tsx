'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Edit3, Send, Ban } from 'lucide-react';

type Window = '1h' | '24h' | '7d' | '30d';

interface Decision {
  id:               string;
  gate_type:        string;
  resource_id:      string;
  decision:         string;
  actor:            string;
  actor_identifier: string | null;
  channel:          string;
  reason:           string | null;
  metadata:         Record<string, unknown> | null;
  portal_email:     string | null;
  decided_at:       string;
}

interface Summary {
  total:      number;
  window:     Window;
  by_type:    Record<string, Record<string, number>>;
  by_actor:   Record<string, number>;
  by_channel: Record<string, number>;
  decisions:  Decision[];
}

const WINDOWS: { key: Window; label: string }[] = [
  { key: '1h',  label: '1 hora' },
  { key: '24h', label: '24 horas' },
  { key: '7d',  label: '7 días' },
  { key: '30d', label: '30 días' },
];

const GATE_LABELS: Record<string, string> = {
  agent_task_plan: 'Plan de tarea (delegación)',
  ops_inbox:       'Bandeja de correos',
  contract_send:   'Contratos',
  expense:         'Gastos',
  invoice:         'Facturas',
  onboarding:      'Onboarding',
  ml_publication:  'Publicaciones Mercado Libre',
};

export function HumanGatesView() {
  const [win,    setWin]    = useState<Window>('7d');
  const [type,   setType]   = useState<string>('');
  const [data,   setData]   = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ window: win });
      if (type) params.set('gate_type', type);
      const res  = await fetch(`/api/admin/human-gates?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'fetch failed');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [win, type]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <label className="flex items-center gap-2">
          <span style={{ color: 'var(--c-text-2)' }}>Ventana</span>
          <select
            value={win}
            onChange={e => setWin(e.target.value as Window)}
            className="px-2 py-1 rounded border"
            style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--c-text)' }}
          >
            {WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span style={{ color: 'var(--c-text-2)' }}>Tipo</span>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="px-2 py-1 rounded border"
            style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: 'var(--c-text)' }}
          >
            <option value="">Todos</option>
            {Object.entries(GATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {loading && <span style={{ color: 'var(--c-text-2)' }}>Cargando…</span>}
      </div>

      {error && <div className="p-3 rounded text-sm" style={{ background: 'rgba(255,80,80,0.1)', color: '#ff7070' }}>{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Total decisiones</p>
              <p className="text-3xl font-semibold" style={{ color: 'var(--c-text)' }}>{data.total}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>en {data.window}</p>
            </div>

            <div className="p-4 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Por canal</p>
              <div className="space-y-1">
                {Object.entries(data.by_channel).map(([ch, n]) => (
                  <div key={ch} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--c-text-2)' }}>{ch}</span>
                    <span style={{ color: 'var(--c-text)' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Por actor</p>
              <div className="space-y-1">
                {Object.entries(data.by_actor).map(([a, n]) => (
                  <div key={a} className="flex justify-between text-xs">
                    <span style={{ color: 'var(--c-text-2)' }}>{a}</span>
                    <span style={{ color: 'var(--c-text)' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Breakdown por tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(data.by_type).map(([gt, dist]) => (
              <div key={gt} className="p-4 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={14} style={{ color: '#9B6DFF' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{GATE_LABELS[gt] ?? gt}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {Object.entries(dist).map(([d, n]) => (
                    <div key={d} className="text-center p-1.5 rounded" style={{ background: decisionBg(d) }}>
                      <p className="font-semibold" style={{ color: decisionColor(d) }}>{n}</p>
                      <p className="text-[10px]" style={{ color: 'var(--c-text-3)' }}>{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Feed de decisiones individuales */}
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>Decisiones recientes ({data.decisions.length})</h2>
            <div className="rounded border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {data.decisions.length === 0 && (
                <p className="p-4 text-sm text-center" style={{ color: 'var(--c-text-3)' }}>Sin decisiones en el rango.</p>
              )}
              {data.decisions.map(d => {
                const Icon = decisionIcon(d.decision);
                const color = decisionColor(d.decision);
                return (
                  <div key={d.id} className="flex items-baseline gap-3 px-4 py-2 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <Icon size={12} style={{ color, flexShrink: 0 }} />
                    <span className="font-mono flex-shrink-0" style={{ color: 'var(--c-text-3)', minWidth: '95px' }}>{fmt(d.decided_at)}</span>
                    <span className="flex-shrink-0" style={{ color: '#9B6DFF', minWidth: '150px' }}>{GATE_LABELS[d.gate_type] ?? d.gate_type}</span>
                    <span className="flex-shrink-0" style={{ color }}>{d.decision}</span>
                    <span className="flex-shrink-0" style={{ color: 'var(--c-text-3)' }}>{d.channel}</span>
                    {d.reason && <span className="truncate" style={{ color: 'var(--c-text-3)' }}>· {d.reason}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function decisionColor(d: string): string {
  return { approve: '#4ade80', send: '#4ade80', reject: '#f87171', cancel: '#f87171', edit: '#facc15' }[d] ?? '#94a3b8';
}
function decisionBg(d: string): string {
  return { approve: 'rgba(74,222,128,0.08)', send: 'rgba(74,222,128,0.08)', reject: 'rgba(248,113,113,0.08)', cancel: 'rgba(248,113,113,0.08)', edit: 'rgba(250,204,21,0.08)' }[d] ?? 'rgba(148,163,184,0.08)';
}
function decisionIcon(d: string): typeof CheckCircle2 {
  return { approve: CheckCircle2, send: Send, reject: XCircle, cancel: Ban, edit: Edit3 }[d] ?? CheckCircle2;
}
