'use client';

import { useEffect, useState } from 'react';
import { GitBranch, Activity, Users, Clock } from 'lucide-react';

interface StateMachineSummary {
  name:               string;
  label:              string;
  source_table:       string;
  status_distribution: Record<string, number>;
  transitions_24h:    number;
  transitions_by_actor: Record<string, number>;
  top_reasons:        Array<{ reason: string; count: number }>;
  terminal_ratio:     number | null;
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

export function GraphView() {
  const [summaries, setSummaries] = useState<StateMachineSummary[]>([]);
  const [feed, setFeed]           = useState<FeedItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/graph/summary', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'fetch failed');
      setSummaries(data.summaries ?? []);
      setFeed(data.feed ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          {loading ? 'Cargando…' : `${summaries.length} state machines, ${feed.length} transiciones recientes.`}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded"
          style={{ color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
        >
          Actualizar
        </button>
      </div>

      {error && (
        <div className="p-3 rounded text-sm" style={{ background: 'rgba(255,80,80,0.1)', color: '#ff7070' }}>
          {error}
        </div>
      )}

      {/* Cards de state machines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summaries.map(s => <MachineCard key={s.name} m={s} />)}
      </div>

      {/* Feed cronológico */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
          <Activity size={16} />
          Últimas transiciones (cross-machine)
        </h2>
        <div className="rounded border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {feed.length === 0 && !loading && (
            <p className="p-4 text-sm text-center" style={{ color: 'var(--c-text-3)' }}>
              Sin transiciones registradas todavía. Se pueblan cuando ocurren transiciones en producción.
            </p>
          )}
          {feed.map((t, i) => (
            <div key={i} className="flex items-baseline gap-3 px-4 py-2 text-xs" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
              <span className="font-mono flex-shrink-0" style={{ color: 'var(--c-text-3)', minWidth: '95px' }}>{fmt(t.at)}</span>
              <span className="flex-shrink-0" style={{ color: '#9B6DFF', minWidth: '120px' }}>{t.machine_label}</span>
              <span className="flex-shrink-0" style={{ color: 'var(--c-text)' }}>
                {t.from_status ? `${t.from_status} → ${t.to_status}` : `→ ${t.to_status}`}
              </span>
              <span className="flex-shrink-0" style={{ color: 'var(--c-text-3)' }}>{t.actor}</span>
              {t.reason && <span className="truncate" style={{ color: 'var(--c-text-3)' }}>· {t.reason}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MachineCard({ m }: { m: StateMachineSummary }) {
  const total = Object.values(m.status_distribution).reduce((a, b) => a + b, 0);
  const sortedStates = Object.entries(m.status_distribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-5 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
            <GitBranch size={14} />
            {m.label}
          </h3>
          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--c-text-4)' }}>{m.source_table}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>{total.toLocaleString()}</p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>items</p>
        </div>
      </div>

      {/* Distribución de estados */}
      <div className="space-y-1.5 mb-4">
        {sortedStates.map(([state, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          const color = stateColor(state);
          return (
            <div key={state}>
              <div className="flex items-baseline justify-between text-xs mb-0.5">
                <span style={{ color: 'var(--c-text-2)' }}>{state}</span>
                <span style={{ color: 'var(--c-text-3)' }}>{count} · {pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="h-full" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Últimas 24h */}
      <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
            <Clock size={11} />
            Últimas 24h
          </span>
          <span style={{ color: 'var(--c-text)' }}>{m.transitions_24h} transiciones</span>
        </div>
        {Object.keys(m.transitions_by_actor).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Object.entries(m.transitions_by_actor).map(([actor, count]) => (
              <span key={actor} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF' }}>
                <Users size={10} className="inline mr-1" />
                {actor}: {count}
              </span>
            ))}
          </div>
        )}
        {m.top_reasons.length > 0 && (
          <div className="text-xs space-y-0.5">
            {m.top_reasons.map(r => (
              <div key={r.reason} style={{ color: 'var(--c-text-3)' }}>
                <span style={{ color: 'var(--c-text-2)' }}>{r.count}×</span> {r.reason}
              </div>
            ))}
          </div>
        )}
      </div>

      {m.terminal_ratio !== null && (
        <div className="mt-3 pt-3 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color: 'var(--c-text-3)' }}>Terminal ratio: </span>
          <span style={{ color: 'var(--c-text)' }}>{(m.terminal_ratio * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function stateColor(state: string): string {
  const s = state.toLowerCase();
  if (['completed', 'completado', 'approved', 'firmado', 'auto_replied'].includes(s)) return '#4ade80';
  if (['pending', 'pendiente', 'calling', 'in_progress', 'en_proceso'].includes(s))    return '#9B6DFF';
  if (['failed', 'rejected', 'cancelled', 'cancelado', 'rechazado'].includes(s))       return '#f87171';
  if (['awaiting_plan_approval', 'info_requested', 'no_answer'].includes(s))           return '#facc15';
  if (['skipped', 'archived', 'dnc'].includes(s))                                       return 'var(--c-text-4)';
  if (s === 'partial')                                                                  return '#fb923c';
  return '#94a3b8';
}
