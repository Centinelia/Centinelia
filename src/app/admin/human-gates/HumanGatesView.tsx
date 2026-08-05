'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Edit3, Send, Ban, RefreshCw } from 'lucide-react';

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

const GATE_ACCENTS: Record<string, string> = {
  agent_task_plan: '#8B5CF6',
  ops_inbox:       '#3B82F6',
  contract_send:   '#10B981',
  expense:         '#F59E0B',
  invoice:         '#EC4899',
  onboarding:      '#F97316',
  ml_publication:  '#06B6D4',
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

  const selectStyle = {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    color: '#111827',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '13px',
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-[13px]">
            <span style={{ color: '#6B7280' }}>Ventana</span>
            <select value={win} onChange={e => setWin(e.target.value as Window)} style={selectStyle}>
              {WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <span style={{ color: '#6B7280' }}>Tipo</span>
            <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
              <option value="">Todos</option>
              {Object.entries(GATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg"
          style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* KPIs top */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Total decisiones" value={data.total} sub={`en ${data.window}`} />
            <BreakdownCard label="Por canal"  entries={data.by_channel} />
            <BreakdownCard label="Por actor"  entries={data.by_actor} />
          </div>

          {/* Breakdown por tipo */}
          {Object.keys(data.by_type).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Object.entries(data.by_type).map(([gt, dist]) => {
                const accent = GATE_ACCENTS[gt] ?? '#6B7280';
                return (
                  <div key={gt} className="rounded-xl bg-white overflow-hidden" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
                        <span className="text-[14px] font-semibold" style={{ color: '#111827' }}>
                          {GATE_LABELS[gt] ?? gt}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-4">
                      {Object.entries(dist).map(([d, n]) => (
                        <div key={d} className="text-center rounded-lg py-2.5" style={{ background: decisionBg(d) }}>
                          <p className="text-[16px] font-semibold tabular-nums" style={{ color: decisionColor(d) }}>{n}</p>
                          <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: '#9CA3AF' }}>{d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Feed */}
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
                Decisiones recientes
              </h2>
              <span className="text-[12px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
                {data.decisions.length} rows
              </span>
            </div>
            <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
              {data.decisions.length === 0 && (
                <div className="p-8 text-center">
                  <ShieldCheck size={20} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
                  <p className="text-sm" style={{ color: '#6B7280' }}>Sin decisiones en el rango seleccionado.</p>
                  <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
                    Aparecerán cuando el dueño apruebe/rechace algo por email o portal.
                  </p>
                </div>
              )}
              {data.decisions.map((d, i) => {
                const Icon = decisionIcon(d.decision);
                const color = decisionColor(d.decision);
                return (
                  <div
                    key={d.id}
                    className="grid gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-gray-50 items-center"
                    style={{
                      gridTemplateColumns: '20px 130px 200px 90px 100px 1fr',
                      borderTop: i > 0 ? '1px solid #F3F4F6' : undefined,
                    }}
                  >
                    <Icon size={14} style={{ color }} />
                    <span className="font-mono tabular-nums whitespace-nowrap" style={{ color: '#9CA3AF' }}>{fmt(d.decided_at)}</span>
                    <GatePill gt={d.gate_type} />
                    <span className="font-medium" style={{ color }}>{d.decision}</span>
                    <span className="text-[12px]" style={{ color: '#6B7280' }}>{d.channel}</span>
                    <span className="truncate" style={{ color: '#9CA3AF' }}>{d.reason ?? ''}</span>
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

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white px-5 py-4" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      <p className="text-[28px] font-semibold leading-none tabular-nums mt-2" style={{ color: '#111827' }}>{value}</p>
      {sub && <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{sub}</p>}
    </div>
  );
}

function BreakdownCard({ label, entries }: { label: string; entries: Record<string, number> }) {
  const list = Object.entries(entries).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl bg-white px-5 py-4" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
      <p className="text-[11px] uppercase tracking-wider font-medium mb-3" style={{ color: '#9CA3AF' }}>{label}</p>
      {list.length === 0 ? (
        <p className="text-[13px]" style={{ color: '#9CA3AF' }}>Sin datos</p>
      ) : (
        <div className="space-y-1.5">
          {list.map(([k, n]) => (
            <div key={k} className="flex justify-between text-[13px]">
              <span style={{ color: '#374151' }}>{k}</span>
              <span className="tabular-nums font-medium" style={{ color: '#111827' }}>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GatePill({ gt }: { gt: string }) {
  const color = GATE_ACCENTS[gt] ?? '#6B7280';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium w-fit"
      style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {GATE_LABELS[gt] ?? gt}
    </span>
  );
}

function decisionColor(d: string): string {
  return { approve: '#10B981', send: '#10B981', reject: '#EF4444', cancel: '#EF4444', edit: '#F59E0B' }[d] ?? '#6B7280';
}
function decisionBg(d: string): string {
  return { approve: '#ECFDF5', send: '#ECFDF5', reject: '#FEF2F2', cancel: '#FEF2F2', edit: '#FFFBEB' }[d] ?? '#F9FAFB';
}
function decisionIcon(d: string): typeof CheckCircle2 {
  return { approve: CheckCircle2, send: Send, reject: XCircle, cancel: Ban, edit: Edit3 }[d] ?? CheckCircle2;
}
