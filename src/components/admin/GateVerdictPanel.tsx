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
    <div className="text-xs py-3" style={{ color: 'var(--c-text-3)' }}>
      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
      Cargando golden tests...
    </div>
  );
  if (error) return <div className="text-xs py-3" style={{ color: '#f87171' }}>Error: {error}</div>;
  if (!status) return null;

  const { verdict, active, target, delta } = status;

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}
    >
      <div className="flex items-center gap-2">
        <VerdictBadge verdict={verdict} />
        {delta != null && (
          <span className="text-xs font-mono" style={{ color: 'var(--c-text-2)' }}>
            {'Δ'} {delta > 0 ? '+' : ''}{delta.toFixed(2)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div style={{ color: 'var(--c-text-3)' }}>Activa (v{active?.version ?? '?'})</div>
          <div className="font-mono" style={{ color: 'var(--c-text)' }}>
            {active ? active.median.toFixed(2) : '--'}
            {active && <span style={{ color: 'var(--c-text-4)' }}> ({active.scenarios_scored} esc.)</span>}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--c-text-3)' }}>Objetivo (v{target.version})</div>
          <div className="font-mono" style={{ color: 'var(--c-text)' }}>
            {target.median != null ? target.median.toFixed(2) : '--'}
            <span style={{ color: 'var(--c-text-4)' }}> ({target.scenarios_scored} esc.)</span>
          </div>
        </div>
      </div>

      {(target.run_status === 'running' || target.run_status === 'queued') && (
        <div className="text-xs pt-1" style={{ color: 'var(--c-text-2)', borderTop: '1px solid var(--c-divider)' }}>
          Tests en curso: {Math.round(target.progress * 100)}%
        </div>
      )}

      {verdict === 'incomplete' && target.run_status === 'none' && (
        <div className="text-xs pt-1" style={{ color: '#fbbf24', borderTop: '1px solid var(--c-divider)' }}>
          No hay baseline para esta versión. Correr golden tests primero para tener veredicto.
        </div>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: GateVerdict }) {
  const cfg: Record<GateVerdict, { icon: React.ReactNode; label: string; bg: string; color: string; borderColor: string }> = {
    pass:       { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Pasa',             bg: 'rgba(16,185,129,0.15)',  color: '#34d399', borderColor: 'rgba(16,185,129,0.4)' },
    warn:       { icon: <AlertTriangle className="w-4 h-4" />, label: 'Degradación leve', bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)' },
    fail:       { icon: <XCircle className="w-4 h-4" />,       label: 'Falla',            bg: 'rgba(239,68,68,0.15)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.4)'  },
    incomplete: { icon: <Loader2 className="w-4 h-4" />,       label: 'Sin veredicto',    bg: 'var(--c-surface-2)',   color: 'var(--c-text-2)', borderColor: 'var(--c-border)' },
  };
  const c = cfg[verdict];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium"
      style={{ background: c.bg, color: c.color, borderColor: c.borderColor }}
    >
      {c.icon}
      {c.label}
    </span>
  );
}
