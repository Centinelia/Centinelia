'use client';

import { useEffect, useState, useMemo } from 'react';
import { Activity, Clock, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';

interface StateMachineSummary {
  name:               string;
  label:              string;
  source_table:       string;
  status_distribution: Record<string, number>;
  transitions_24h:    number;
  transitions_by_actor: Record<string, number>;
  top_reasons:        Array<{ reason: string; count: number }>;
  terminal_ratio:     number | null;
  total_rows:         number;
  sampled_rows:       number;
  truncated:          boolean;
}

interface FeedItem {
  machine:       string;
  machine_label: string;
  entity_id:     string;
  from_status:   string | null;
  to_status:     string;
  actor:         string;
  reason:        string | null;
  at:            string;
}

const MACHINE_ACCENTS: Record<string, string> = {
  agent_tasks:          '#8B5CF6',   // violeta
  ops_inbox:            '#3B82F6',   // azul
  contract_drafts:      '#10B981',   // esmeralda
  outbound_contacts:    '#F59E0B',   // ámbar
  onboarding_instances: '#EC4899',   // rosa
};

const MACHINE_EMPTY_HINT: Record<string, string> = {
  agent_tasks:          'Aparecerá cuando un empleado use delegar_tarea con otro.',
  ops_inbox:            'Aparecerá cuando llegue el primer correo procesado.',
  contract_drafts:      'Aparecerá cuando un empleado genere un contrato con create_contract_draft.',
  outbound_contacts:    'Aparecerá cuando subas una campaña saliente o el equipo agende llamadas.',
  onboarding_instances: 'Aparecerá cuando Naia envíe un onboarding a un cliente nuevo.',
};

export function GraphView() {
  const [summaries, setSummaries] = useState<StateMachineSummary[]>([]);
  const [feed, setFeed]           = useState<FeedItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [warnings, setWarnings] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const res  = await fetch('/api/admin/graph/summary', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'fetch failed');
      setSummaries(data.summaries ?? []);
      setFeed(data.feed ?? []);
      if (Array.isArray(data.errors) && data.errors.length) setWarnings(data.errors);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  // Empty machines al final
  const orderedSummaries = useMemo(
    () => [...summaries].sort((a, b) => {
      const at = Object.values(a.status_distribution).reduce((s, v) => s + v, 0);
      const bt = Object.values(b.status_distribution).reduce((s, v) => s + v, 0);
      return bt - at;
    }),
    [summaries],
  );

  // Colapsa feed: agrupa runs consecutivos del mismo machine+reason
  const collapsedFeed = useMemo(() => collapseFeed(feed), [feed]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[13px]" style={{ color: '#6B7280' }}>
          {loading ? 'Cargando…' : `${summaries.length} state machines · ${feed.length} transiciones recientes`}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors"
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

      {warnings.length > 0 && (
        <div className="p-3 rounded-xl text-[12px] font-mono" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          <div className="font-sans font-medium mb-1">Errores parciales en queries:</div>
          {warnings.map((w, i) => <div key={i}>• {w}</div>)}
        </div>
      )}

      {/* Grid de state machines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {orderedSummaries.map(s => <MachineCard key={s.name} m={s} />)}
      </div>

      {/* Feed cronológico */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[15px] font-semibold flex items-center gap-2" style={{ color: '#111827' }}>
            <Activity size={15} style={{ color: '#6B7280' }} />
            Últimas transiciones
          </h2>
          <span className="text-[12px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
            Cross-machine
          </span>
        </div>

        <div className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}>
          {collapsedFeed.length === 0 && !loading && (
            <div className="p-8 text-center">
              <Activity size={20} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: '#6B7280' }}>
                Sin transiciones registradas todavía.
              </p>
              <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
                Aparecerán en cuanto ocurra actividad en los state machines.
              </p>
            </div>
          )}
          <div>
            {collapsedFeed.map((row, i) => (
              <div
                key={i}
                className="grid gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                style={{
                  gridTemplateColumns: '130px 140px 1fr 100px auto',
                  borderTop: i > 0 ? '1px solid #F3F4F6' : undefined,
                }}
              >
                <span className="font-mono tabular-nums whitespace-nowrap" style={{ color: '#9CA3AF' }}>{fmt(row.at)}</span>
                <MachinePill name={row.machine} label={row.machine_label} />
                <span style={{ color: '#111827' }} className="truncate">
                  {row.count > 1 && <strong className="font-semibold">{row.count}× </strong>}
                  {row.from_status ? (
                    <><span style={{ color: '#6B7280' }}>{row.from_status}</span> → <span>{row.to_status}</span></>
                  ) : (
                    <>→ <span>{row.to_status}</span></>
                  )}
                  {row.reason && <span style={{ color: '#9CA3AF' }}> · {row.reason}</span>}
                </span>
                <span className="text-[12px]" style={{ color: '#6B7280' }}>{row.actor}</span>
                <ChevronRight size={14} style={{ color: '#D1D5DB' }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

interface CollapsedFeedRow extends FeedItem { count: number; }

function collapseFeed(feed: FeedItem[]): CollapsedFeedRow[] {
  const out: CollapsedFeedRow[] = [];
  for (const t of feed) {
    const last = out[out.length - 1];
    if (last && last.machine === t.machine && last.to_status === t.to_status && last.reason === t.reason && last.actor === t.actor) {
      last.count++;
    } else {
      out.push({ ...t, count: 1 });
    }
  }
  return out;
}

function MachinePill({ name, label }: { name: string; label: string }) {
  const color = MACHINE_ACCENTS[name] ?? '#6B7280';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium w-fit"
      style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function MachineCard({ m }: { m: StateMachineSummary }) {
  const sampled = Object.values(m.status_distribution).reduce((a, b) => a + b, 0);
  const total   = m.total_rows ?? sampled;
  const accent  = MACHINE_ACCENTS[m.name] ?? '#6B7280';
  const sortedStates = Object.entries(m.status_distribution).sort((a, b) => b[1] - a[1]);

  // Alertas: si failed/rejected supera 40% → badge
  const failedCount = (m.status_distribution.failed ?? 0) + (m.status_distribution.rejected ?? 0) + (m.status_distribution.cancelled ?? 0) + (m.status_distribution.cancelado ?? 0) + (m.status_distribution.rechazado ?? 0);
  const failedRatio = sampled > 0 ? failedCount / sampled : 0;
  const hasAlert    = sampled > 0 && failedRatio > 0.4;

  const isEmpty = total === 0;

  return (
    <div
      className="rounded-xl bg-white overflow-hidden"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      {/* Header */}
      <div
        className="px-6 py-5 flex items-start justify-between gap-4"
        style={{ borderBottom: total > 0 ? '1px solid #F3F4F6' : undefined }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
            <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: '#111827' }}>
              {m.label}
            </h3>
            {hasAlert && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                <AlertTriangle size={9} />
                {(failedRatio * 100).toFixed(0)}% fallidos
              </span>
            )}
            {m.truncated && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ background: '#FEF3C7', color: '#92400E' }}
                title={`Distribución basada en ${sampled.toLocaleString()} de ${total.toLocaleString()} rows`}
              >
                muestra parcial
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5 font-mono" style={{ color: '#9CA3AF' }}>{m.source_table}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>
            {total.toLocaleString()}
          </p>
          <p className="text-[11px] uppercase tracking-wider mt-1" style={{ color: '#9CA3AF' }}>items</p>
        </div>
      </div>

      {/* Body */}
      {isEmpty ? (
        <div className="px-6 py-8 text-center">
          <p className="text-[13px]" style={{ color: '#6B7280' }}>Aún no hay actividad.</p>
          <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>
            {MACHINE_EMPTY_HINT[m.name] ?? 'Aparecerá cuando ocurra el primer evento.'}
          </p>
        </div>
      ) : (
        <div className="px-6 py-5">
          {/* Distribución */}
          <div className="space-y-2.5 mb-5">
            {sortedStates.map(([state, count]) => {
              const pct = total > 0 ? (count / total) * 100 : 0;
              const color = stateColor(state);
              return (
                <div key={state}>
                  <div className="flex items-baseline justify-between text-[12px] mb-1">
                    <span className="font-medium" style={{ color: '#374151' }}>{state}</span>
                    <span className="tabular-nums" style={{ color: '#9CA3AF' }}>
                      {count.toLocaleString()} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terminal ratio prominente */}
          {m.terminal_ratio !== null && (
            <div className="flex items-baseline justify-between py-3 px-3 rounded-lg mb-4" style={{ background: '#F9FAFB' }}>
              <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>
                Terminal ratio
              </span>
              <span className="text-[15px] font-semibold tabular-nums" style={{ color: '#111827' }}>
                {(m.terminal_ratio * 100).toFixed(1)}%
              </span>
            </div>
          )}

          {/* Últimas 24h */}
          <div>
            <div className="flex items-center justify-between text-[12px] mb-2.5">
              <span className="flex items-center gap-1.5 uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
                <Clock size={11} />
                Últimas 24h
              </span>
              <span className="tabular-nums font-medium" style={{ color: '#374151' }}>
                {m.transitions_24h} transiciones
              </span>
            </div>
            {Object.keys(m.transitions_by_actor).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {Object.entries(m.transitions_by_actor).map(([actor, count]) => (
                  <span
                    key={actor}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                    style={{ background: '#F3F4F6', color: '#4B5563' }}
                  >
                    {actor}
                    <span className="tabular-nums" style={{ color: '#9CA3AF' }}>· {count}</span>
                  </span>
                ))}
              </div>
            )}
            {m.top_reasons.length > 0 && (
              <div className="space-y-0.5 text-[12px]">
                {m.top_reasons.slice(0, 3).map(r => (
                  <div key={r.reason} className="flex items-baseline gap-2" style={{ color: '#6B7280' }}>
                    <span className="tabular-nums font-medium" style={{ color: '#374151', minWidth: '24px' }}>
                      {r.count}×
                    </span>
                    <span className="font-mono text-[11px]">{r.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function stateColor(state: string): string {
  const s = state.toLowerCase();
  if (['completed', 'completado', 'approved', 'firmado', 'auto_replied'].includes(s)) return '#10B981';
  if (['pending', 'pendiente', 'calling', 'in_progress', 'en_proceso'].includes(s))    return '#8B5CF6';
  if (['failed', 'rejected', 'cancelled', 'cancelado', 'rechazado'].includes(s))       return '#EF4444';
  if (['awaiting_plan_approval', 'info_requested', 'no_answer', 'escalated'].includes(s)) return '#F59E0B';
  if (['skipped', 'archived', 'dnc'].includes(s))                                       return '#9CA3AF';
  if (s === 'partial')                                                                  return '#F97316';
  return '#6B7280';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
