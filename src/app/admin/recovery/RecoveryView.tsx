'use client';

import { useEffect, useState } from 'react';
import { LifeBuoy, Play, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
  const [rules, setRules]     = useState<Rule[]>([]);
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
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          {loading ? (
            <span style={{ color: '#6B7280' }}>Cargando…</span>
          ) : (
            <>
              <span style={{ color: '#374151' }}>{rules.length} reglas activas</span>
              <span style={{ color: '#D1D5DB' }}>·</span>
              {totalStuck > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium" style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                  <AlertTriangle size={12} />
                  {totalStuck} items a recover
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                  <CheckCircle2 size={12} />
                  Todo al día
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadDryRun}
            disabled={loading || running}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg"
            style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            onClick={runNow}
            disabled={running || totalStuck === 0}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg"
            style={{
              color:      totalStuck > 0 ? '#FFFFFF' : '#9CA3AF',
              background: totalStuck > 0 ? '#8B5CF6' : '#F3F4F6',
              cursor:     totalStuck > 0 && !running ? 'pointer' : 'not-allowed',
              border:     totalStuck > 0 ? 'none' : '1px solid #E5E7EB',
            }}
          >
            <Play size={12} />
            {running ? 'Ejecutando…' : `Ejecutar ahora${totalStuck > 0 ? ` (${totalStuck})` : ''}`}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {lastRun && (
        <div className="rounded-xl p-4" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
          <p className="text-[13px] font-semibold flex items-center gap-2" style={{ color: '#047857' }}>
            <CheckCircle2 size={14} />
            Última ejecución
          </p>
          <p className="text-[12px] mt-1.5" style={{ color: '#374151' }}>
            <span className="tabular-nums font-medium">{lastRun.totalRecovered}</span> recovered ·{' '}
            <span className="tabular-nums font-medium">{lastRun.totalFailed}</span> failed ·{' '}
            <span className="tabular-nums font-medium">{lastRun.totalScanned}</span> scanned ·{' '}
            {new Date(lastRun.ranAt).toLocaleString('es-MX')}
          </p>
          {lastRun.results.some(r => r.errors.length > 0) && (
            <div className="mt-2 space-y-0.5">
              {lastRun.results.filter(r => r.errors.length).map(r => (
                <p key={r.ruleId} className="text-[12px] font-mono" style={{ color: '#B91C1C' }}>
                  {r.ruleId}: {r.errors.join(' | ')}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reglas */}
      <div className="space-y-3">
        {rules.map(rule => {
          const highlight = rule.would_recover_now > 0;
          return (
            <div
              key={rule.id}
              className="rounded-xl bg-white overflow-hidden"
              style={{
                border: highlight ? '1px solid #FCD34D' : '1px solid #E5E7EB',
                boxShadow: highlight ? '0 4px 12px -2px rgb(245 158 11 / 0.15)' : '0 1px 3px 0 rgb(0 0 0 / 0.05)',
              }}
            >
              <div className="px-5 py-4 flex items-start gap-3">
                <div className="flex-shrink-0 p-2 rounded-lg" style={{ background: highlight ? '#FFFBEB' : '#F3F4F6' }}>
                  <LifeBuoy size={16} style={{ color: highlight ? '#B45309' : '#6B7280' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-mono" style={{ color: '#111827' }}>{rule.id}</p>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: highlight ? '#B45309' : '#9CA3AF' }}>
                        {rule.would_recover_now}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider mt-1" style={{ color: '#9CA3AF' }}>
                        a recover
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] mt-1.5" style={{ color: '#374151' }}>{rule.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium" style={{ background: '#F3F4F6', color: '#4B5563' }}>
                      <span className="font-mono">{rule.source_table}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium" style={{ background: '#F3F4F6', color: '#4B5563' }}>
                      status = <span className="font-mono">{rule.stuck_status}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium" style={{ background: '#F3F4F6', color: '#4B5563' }}>
                      timeout {fmtMin(rule.stuck_after_min)}
                    </span>
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
