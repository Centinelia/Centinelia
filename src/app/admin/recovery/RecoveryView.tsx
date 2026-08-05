'use client';

import { useEffect, useState } from 'react';
import { LifeBuoy, Play, RefreshCw, AlertTriangle } from 'lucide-react';

interface Rule {
  id:                string;
  description:       string;
  source_table:      string;
  stuck_status:      string;
  stuck_after_min:   number;
  would_recover_now: number;
}

interface ExecResult {
  totalScanned:   number;
  totalRecovered: number;
  totalFailed:    number;
  results:        Array<{ ruleId: string; scanned: number; recovered: number; failed: number; errors: string[] }>;
  ranAt:          string;
}

export function RecoveryView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<ExecResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const loadDryRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/recovery', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'fetch failed');
      setRules(data.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin/recovery?run=1', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'run failed');
      setLastRun(data);
      // Refresh dry run counts
      await loadDryRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => { void loadDryRun(); }, []);

  const totalStuck = rules.reduce((s, r) => s + r.would_recover_now, 0);

  const fmtMin = (min: number) => {
    if (min < 60)          return `${min}min`;
    if (min < 24 * 60)     return `${Math.round(min / 60)}h`;
    return `${Math.round(min / (24 * 60))}d`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            {loading ? 'Cargando…' : `${rules.length} reglas · ${totalStuck} items serían recovered ahora mismo`}
          </p>
          {totalStuck > 0 && <AlertTriangle size={14} style={{ color: '#facc15' }} />}
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadDryRun}
            disabled={loading || running}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
            style={{ color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            <RefreshCw size={12} />
            Actualizar
          </button>
          <button
            onClick={runNow}
            disabled={running || totalStuck === 0}
            className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
            style={{
              color: '#FAFBFF',
              background: totalStuck > 0 ? '#6C3BFF' : 'rgba(108,59,255,0.3)',
              cursor: totalStuck > 0 && !running ? 'pointer' : 'not-allowed',
            }}
          >
            <Play size={12} />
            {running ? 'Ejecutando…' : `Ejecutar ahora (${totalStuck})`}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded text-sm" style={{ background: 'rgba(255,80,80,0.1)', color: '#ff7070' }}>{error}</div>}

      {lastRun && (
        <div className="p-4 rounded-lg" style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: '#4ade80' }}>Última ejecución</p>
          <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
            {lastRun.totalRecovered} recovered · {lastRun.totalFailed} failed · {lastRun.totalScanned} scanned · {new Date(lastRun.ranAt).toLocaleString('es-MX')}
          </p>
          {lastRun.results.some(r => r.errors.length > 0) && (
            <div className="mt-2 space-y-0.5">
              {lastRun.results.filter(r => r.errors.length).map(r => (
                <p key={r.ruleId} className="text-xs" style={{ color: '#f87171' }}>
                  {r.ruleId}: {r.errors.join(' | ')}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {rules.map(rule => {
          const highlight = rule.would_recover_now > 0;
          return (
            <div key={rule.id} className="p-4 rounded-lg" style={{
              background: 'var(--c-surface)',
              border: `1px solid ${highlight ? 'rgba(250,204,21,0.5)' : 'var(--c-border)'}`,
            }}>
              <div className="flex items-start gap-3">
                <LifeBuoy size={16} style={{ color: highlight ? '#facc15' : '#9B6DFF', marginTop: 2, flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-mono" style={{ color: 'var(--c-text)' }}>{rule.id}</p>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-semibold" style={{ color: highlight ? '#facc15' : 'var(--c-text-3)' }}>{rule.would_recover_now}</p>
                      <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>a recover</p>
                    </div>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>{rule.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
                    <span>Tabla: <span style={{ color: 'var(--c-text-2)' }}>{rule.source_table}</span></span>
                    <span>Estado stuck: <span style={{ color: 'var(--c-text-2)' }}>{rule.stuck_status}</span></span>
                    <span>Timeout: <span style={{ color: 'var(--c-text-2)' }}>{fmtMin(rule.stuck_after_min)}</span></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
