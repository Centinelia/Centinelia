'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Approval, PolicyCheck } from '@/lib/admin/approvals';

const TYPE_LABEL: Record<string, string> = {
  grant_ops:        'Grant de ops',
  refund:           'Refund',
  cancel_agent:     'Cancelar agente',
  plan_change:      'Cambio de plan',
  modify_learnings: 'Modificar learnings',
};

const TYPE_COLOR: Record<string, string> = {
  grant_ops:        '#22c55e',
  refund:           '#f59e0b',
  cancel_agent:     '#ef4444',
  plan_change:      '#3b82f6',
  modify_learnings: '#e879f9',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.round((now - t) / 1000);
  if (secs < 60) return `hace ${secs}s`;
  if (secs < 3600) return `hace ${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)}h`;
  return `hace ${Math.floor(secs / 86400)}d`;
}

interface Props {
  initialPending: Approval[];
  initialDecided: Approval[];
}

export default function ApprovalsClient({ initialPending, initialDecided }: Props) {
  const [pending, setPending]   = useState<Approval[]>(initialPending);
  const [decided, setDecided]   = useState<Approval[]>(initialDecided);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ approve }),
      });
      const data = await res.json();
      if (!data.ok && !data.item) {
        setError(data.error ?? 'Error al decidir');
        setBusyId(null);
        return;
      }
      const updated: Approval = data.item;
      setPending(prev => prev.filter(a => a.id !== id));
      setDecided(prev => [updated, ...prev].slice(0, 20));
      if (approve && data.executed && !data.executed.ok) {
        setError(`Aprobado pero la ejecución falló: ${data.executed.message}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Pendientes */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--c-text-3)' }}>
          Pendientes ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="p-6 text-center rounded-xl" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle2 size={20} style={{ color: '#22c55e', margin: '0 auto 6px' }} />
            <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Sin aprobaciones pendientes.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map(a => <ApprovalCard key={a.id} approval={a} onDecide={decide} busy={busyId === a.id} />)}
          </div>
        )}
      </section>

      {/* Historial */}
      <section>
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase mb-3 transition-opacity hover:opacity-80"
          style={{ color: 'var(--c-text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Historial ({decided.length})
          {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showHistory && (
          <div className="flex flex-col gap-2">
            {decided.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin decisiones aún.</p>
            )}
            {decided.map(a => <DecidedRow key={a.id} approval={a} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function ApprovalCard({ approval, onDecide, busy }: { approval: Approval; onDecide: (id: string, approve: boolean) => void; busy: boolean }) {
  const label = TYPE_LABEL[approval.type] ?? approval.type;
  const color = TYPE_COLOR[approval.type] ?? '#6b7280';
  const anyFailed = approval.checks.some(c => !c.passed);

  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--c-surface)', border: `1px solid ${anyFailed ? 'rgba(239,68,68,0.3)' : 'var(--c-border)'}` }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              {label}
            </span>
            {approval.amount != null && (
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--c-text)' }}>
                {approval.amount}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{approval.title}</p>
          {approval.target_email && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              {approval.target_email}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>
          <Clock size={11} />
          {relativeTime(approval.created_at)}
        </div>
      </div>

      {/* Rationale */}
      {approval.rationale && (
        <div className="mb-3 text-xs italic" style={{ color: 'var(--c-text-3)' }}>
          {approval.rationale}
        </div>
      )}

      {/* Policy checks */}
      {approval.checks.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {approval.checks.map((c, i) => <CheckRow key={i} check={c} />)}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onDecide(approval.id, true)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-semibold transition-opacity"
          style={{
            background: anyFailed ? '#ef4444' : '#22c55e',
            color:      '#fff',
            border:     'none',
            cursor:     busy ? 'not-allowed' : 'pointer',
            opacity:    busy ? 0.4 : 1,
          }}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : anyFailed ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
          {anyFailed ? 'Override y aprobar' : 'Aprobar'}
        </button>
        <button
          onClick={() => onDecide(approval.id, false)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-semibold transition-opacity"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color:      'var(--c-text-2)',
            border:     '1px solid rgba(255,255,255,0.1)',
            cursor:     busy ? 'not-allowed' : 'pointer',
            opacity:    busy ? 0.4 : 1,
          }}
        >
          <XCircle size={12} />
          Rechazar
        </button>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: PolicyCheck }) {
  return (
    <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
      {check.passed
        ? <CheckCircle2 size={12} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
        : <XCircle    size={12} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />}
      <div>
        <span className="font-mono" style={{ color: 'var(--c-text-4)' }}>{check.name}</span>
        <span> · </span>
        <span>{check.detail}</span>
      </div>
    </div>
  );
}

function DecidedRow({ approval }: { approval: Approval }) {
  const label = TYPE_LABEL[approval.type] ?? approval.type;
  const isApproved = approval.status === 'approved';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      {isApproved
        ? <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
        : <XCircle    size={13} style={{ color: '#ef4444', flexShrink: 0 }} />}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{label}</span>
        <span className="text-xs mx-1" style={{ color: 'var(--c-text-4)' }}>·</span>
        <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{approval.title}</span>
      </div>
      <div className="text-xs flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>
        {isApproved ? 'aprobado' : 'rechazado'} {relativeTime(approval.decided_at)}
      </div>
    </div>
  );
}
