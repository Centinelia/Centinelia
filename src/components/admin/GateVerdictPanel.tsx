'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import type { GateStatus, GateVerdict } from '@/lib/golden-tests/types';

interface Props {
  meerkat_id: string;
  target_version: number;
}

export function GateVerdictPanel({ meerkat_id, target_version }: Props) {
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/versiones/${meerkat_id}/gate-status?target=${target_version}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        setStatus(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [meerkat_id, target_version]);

  if (loading) return (
    <div className="text-xs text-slate-500 py-3">
      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
      Cargando golden tests...
    </div>
  );
  if (error) return <div className="text-xs text-red-600 py-3">Error: {error}</div>;
  if (!status) return null;

  const { verdict, active, target, delta } = status;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <VerdictBadge verdict={verdict} />
        {delta != null && (
          <span className="text-xs font-mono text-slate-700">
            {'Δ'} {delta > 0 ? '+' : ''}{delta.toFixed(2)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-slate-500">Activa (v{active?.version ?? '?'})</div>
          <div className="text-slate-900 font-mono">
            {active ? active.median.toFixed(2) : '—'}
            {active && <span className="text-slate-400"> ({active.scenarios_scored} esc.)</span>}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Objetivo (v{target.version})</div>
          <div className="text-slate-900 font-mono">
            {target.median != null ? target.median.toFixed(2) : '—'}
            <span className="text-slate-400"> ({target.scenarios_scored} esc.)</span>
          </div>
        </div>
      </div>

      {(target.run_status === 'running' || target.run_status === 'queued') && (
        <div className="text-xs text-slate-600 pt-1 border-t border-slate-200">
          Tests en curso: {Math.round(target.progress * 100)}%
        </div>
      )}

      {verdict === 'incomplete' && target.run_status === 'none' && (
        <div className="text-xs text-amber-700 pt-1 border-t border-slate-200">
          No hay baseline para esta version. Correr golden tests primero para tener veredicto.
        </div>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: GateVerdict }) {
  const cfg: Record<GateVerdict, { icon: React.ReactNode; label: string; cls: string }> = {
    pass:       { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Pasa',             cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    warn:       { icon: <AlertTriangle className="w-4 h-4" />, label: 'Degradacion leve', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    fail:       { icon: <XCircle className="w-4 h-4" />,       label: 'Falla',            cls: 'text-red-700 bg-red-50 border-red-200' },
    incomplete: { icon: <Loader2 className="w-4 h-4" />,       label: 'Sin veredicto',   cls: 'text-slate-700 bg-white border-slate-200' },
  };
  const c = cfg[verdict];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  );
}
