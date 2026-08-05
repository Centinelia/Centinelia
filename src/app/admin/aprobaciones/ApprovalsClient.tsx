'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Approval, PolicyCheck } from '@/lib/admin/approvals';

const TYPE_LABEL: Record<string, string> = {
  grant_ops:        'Grant de tareas',
  refund:           'Reembolso',
  cancel_agent:     'Cancelar agente',
  plan_change:      'Cambio de plan',
  modify_learnings: 'Modificar learnings',
};

const TYPE_COLOR: Record<string, string> = {
  grant_ops:        '#10B981',
  refund:           '#F59E0B',
  cancel_agent:     '#EF4444',
  plan_change:      '#3B82F6',
  modify_learnings: '#EC4899',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '.';
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
    <div className="space-y-8">
      {error && (
        <div
          className="p-4 rounded-xl text-[13px]"
          style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}
        >
          {error}
        </div>
      )}

      {/* Pendientes */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
            Pendientes
          </h2>
          <span className="text-[12px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
            {pending.length}
          </span>
        </div>
        {pending.length === 0 ? (
          <div
            className="p-8 text-center rounded-xl bg-white"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <CheckCircle2 size={20} style={{ color: '#10B981', margin: '0 auto 8px' }} />
            <p className="text-[13px]" style={{ color: '#374151' }}>Sin aprobaciones pendientes.</p>
            <p className="text-[12px] mt-1" style={{ color: '#9CA3AF' }}>
              Aparecerán aquí cuando alguien solicite una acción destructiva.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map(a => <ApprovalCard key={a.id} approval={a} onDecide={decide} busy={busyId === a.id} />)}
          </div>
        )}
      </section>

      {/* Historial */}
      <section>
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-2 mb-4 transition-opacity hover:opacity-80"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
            Historial
          </h2>
          <span className="text-[12px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
            {decided.length}
          </span>
          {showHistory ? <ChevronUp size={14} style={{ color: '#6B7280' }} /> : <ChevronDown size={14} style={{ color: '#6B7280' }} />}
        </button>
        {showHistory && (
          <div
            className="rounded-xl overflow-hidden bg-white"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            {decided.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin decisiones aún.</p>
              </div>
            ) : (
              decided.map((a, i) => <DecidedRow key={a.id} approval={a} isFirst={i === 0} />)
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ApprovalCard({ approval, onDecide, busy }: { approval: Approval; onDecide: (id: string, approve: boolean) => void; busy: boolean }) {
  const label = TYPE_LABEL[approval.type] ?? approval.type;
  const color = TYPE_COLOR[approval.type] ?? '#6B7280';
  const anyFailed = approval.checks.some(c => !c.passed);

  return (
    <div
      className="rounded-xl bg-white overflow-hidden"
      style={{
        border: `1px solid ${anyFailed ? '#FECACA' : '#E5E7EB'}`,
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
      }}
    >
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
                style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {label}
              </span>
              {approval.amount != null && (
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: '#111827' }}>
                  {approval.amount}
                </span>
              )}
            </div>
            <p className="text-[14px] font-semibold" style={{ color: '#111827' }}>{approval.title}</p>
            {approval.target_email && (
              <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
                {approval.target_email}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 text-[12px] flex-shrink-0" style={{ color: '#9CA3AF' }}>
            <Clock size={11} />
            {relativeTime(approval.created_at)}
          </div>
        </div>

        {/* Rationale */}
        {approval.rationale && (
          <div
            className="mb-3 px-3 py-2 rounded-lg text-[12px]"
            style={{ background: '#F9FAFB', color: '#4B5563' }}
          >
            {approval.rationale}
          </div>
        )}

        {/* Policy checks */}
        {approval.checks.length > 0 && (
          <div className="mb-4 flex flex-col gap-1.5">
            {approval.checks.map((c, i) => <CheckRow key={i} check={c} />)}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDecide(approval.id, true)}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-opacity"
            style={{
              background: anyFailed ? '#EF4444' : '#10B981',
              color:      '#FFFFFF',
              border:     'none',
              cursor:     busy ? 'not-allowed' : 'pointer',
              opacity:    busy ? 0.5 : 1,
            }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : anyFailed ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            {anyFailed ? 'Anular y aprobar' : 'Aprobar'}
          </button>
          <button
            onClick={() => onDecide(approval.id, false)}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{
              background: '#FFFFFF',
              color:      '#374151',
              border:     '1px solid #E5E7EB',
              cursor:     busy ? 'not-allowed' : 'pointer',
              opacity:    busy ? 0.5 : 1,
            }}
          >
            <XCircle size={13} />
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: PolicyCheck }) {
  return (
    <div className="flex items-start gap-2 text-[12px]" style={{ color: '#4B5563' }}>
      {check.passed
        ? <CheckCircle2 size={12} style={{ color: '#10B981', flexShrink: 0, marginTop: 2 }} />
        : <XCircle    size={12} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />}
      <div>
        <span className="font-mono text-[11px]" style={{ color: '#9CA3AF' }}>{check.name}</span>
        <span style={{ color: '#9CA3AF' }}> · </span>
        <span>{check.detail}</span>
      </div>
    </div>
  );
}

function DecidedRow({ approval, isFirst }: { approval: Approval; isFirst: boolean }) {
  const label = TYPE_LABEL[approval.type] ?? approval.type;
  const isApproved = approval.status === 'approved';
  const color = isApproved ? '#10B981' : '#EF4444';
  return (
    <div
      className="grid gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-gray-50 items-center"
      style={{
        gridTemplateColumns: '20px 1fr auto',
        borderTop: !isFirst ? '1px solid #F3F4F6' : undefined,
      }}
    >
      {isApproved
        ? <CheckCircle2 size={14} style={{ color, flexShrink: 0 }} />
        : <XCircle    size={14} style={{ color, flexShrink: 0 }} />}
      <div className="min-w-0 truncate">
        <span className="font-medium" style={{ color: '#111827' }}>{label}</span>
        <span className="mx-1.5" style={{ color: '#D1D5DB' }}>·</span>
        <span style={{ color: '#6B7280' }}>{approval.title}</span>
      </div>
      <div className="text-[12px] flex-shrink-0" style={{ color: '#9CA3AF' }}>
        {isApproved ? 'aprobado' : 'rechazado'} {relativeTime(approval.decided_at)}
      </div>
    </div>
  );
}
