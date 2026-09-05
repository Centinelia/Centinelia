'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, X, Clock, Bot } from 'lucide-react';

interface PlanStep { n: number; description: string; tool_hint?: string }
interface Plan {
  goal:           string;
  steps:          PlanStep[];
  assets?:        string[];
  risks?:         string[];
  success_metric: string;
  summary:        string;
}

interface PendingTask {
  id:              string;
  title:           string;
  description:     string | null;
  assigned_to:     string | null;
  created_by:      string | null;
  created_at:      string;
  plan:            Plan | null;
  plan_approval_token: string | null;
  assigned_agent_name?: string | null;
}

export default function PlanApprovalsSection({ token }: { token: string }) {
  const [items, setItems] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/agent-tasks?status=awaiting_plan_approval`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const decide = async (t: PendingTask, action: 'approve' | 'reject') => {
    if (!t.plan_approval_token) return;
    setBusyId(t.id);
    try {
      const url = action === 'approve'
        ? `/api/portal/agent-tasks/${t.id}/approve-plan?token=${t.plan_approval_token}`
        : `/api/portal/agent-tasks/${t.id}/approve-plan?token=${t.plan_approval_token}&reject=1`;
      await fetch(url);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading && items.length === 0) return null;
  if (!loading && items.length === 0) return null;

  return (
    <section
      id="plan-approvals"
      className="flex flex-col rounded-2xl overflow-hidden scroll-mt-6"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <Clock size={14} style={{ color: '#F59E0B' }} />
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Planes por aprobar
            </h2>
            {items.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {items.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1 whitespace-nowrap" style={{ color: '#6B6480' }}>
            Tu equipo propone un plan y espera tu visto bueno.
          </p>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
        {items.map((t, idx) => (
          <article
            key={t.id}
            className="px-5 py-4 flex flex-col gap-3"
            style={{ borderBottom: idx === items.length - 1 ? 'none' : '1px solid #F0EDF9' }}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: '#9B8FB5' }}>
                  <Bot size={11} />
                  <span>{t.assigned_agent_name ?? 'Empleado'}</span>
                </div>
                <h3 className="text-[13px] font-semibold leading-snug" style={{ color: '#1A0A3B' }}>{t.title}</h3>
              </div>
              <time className="text-[11px] whitespace-nowrap" style={{ color: '#9B8FB5' }}>
                {new Date(t.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </time>
            </header>

            {t.plan && (
              <div className="flex flex-col gap-3">
                <p className="text-[12px] italic leading-relaxed" style={{ color: '#6B6480' }}>{t.plan.summary}</p>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#9B8FB5' }}>
                    Pasos
                  </div>
                  <ol className="space-y-1">
                    {t.plan.steps.map(s => (
                      <li key={s.n} className="text-[12px] leading-relaxed" style={{ color: '#1A0A3B' }}>
                        <strong style={{ color: '#6C3BFF' }}>{s.n}.</strong> {s.description}
                        {s.tool_hint && (
                          <span className="ml-1 text-[11px]" style={{ color: '#9B8FB5' }}>
                            {'↳'} {s.tool_hint}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {t.plan.risks && t.plan.risks.length > 0 && (
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #F59E0B' }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: '#92400E' }}>
                      Riesgos
                    </div>
                    <ul className="text-[12px] space-y-0.5" style={{ color: '#6B6480' }}>
                      {t.plan.risks.map((r, i) => <li key={i}>· {r}</li>)}
                    </ul>
                  </div>
                )}

                <div
                  className="rounded-lg p-3"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: '#9B8FB5' }}>
                    Se logrará cuando
                  </div>
                  <p className="text-[12px] leading-snug" style={{ color: '#1A0A3B' }}>{t.plan.success_metric}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => decide(t, 'approve')}
                disabled={busyId === t.id}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
              >
                <CheckCircle2 size={12} /> Aprobar
              </button>
              <button
                type="button"
                onClick={() => decide(t, 'reject')}
                disabled={busyId === t.id}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-[12px] font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
              >
                <X size={12} /> Rechazar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
