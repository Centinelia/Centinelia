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
    <section className="mb-6">
      <div className="rounded-xl border p-5" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: '#6c3bff' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Planes pendientes de tu aprobación
          </h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#6c3bff15', color: '#6c3bff' }}>
            {items.length}
          </span>
        </div>

        <div className="space-y-3">
          {items.map(t => (
            <article key={t.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface-2)' }}>
              <header className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-3)' }}>
                    <Bot size={11} />
                    <span>{t.assigned_agent_name ?? 'Empleado'}</span>
                  </div>
                  <h3 className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>{t.title}</h3>
                </div>
                <time className="text-[10px] whitespace-nowrap" style={{ color: 'var(--c-text-4)' }}>
                  {new Date(t.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </header>

              {t.plan && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs italic leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{t.plan.summary}</p>

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--c-text-3)' }}>Pasos</div>
                    <ol className="space-y-1">
                      {t.plan.steps.map(s => (
                        <li key={s.n} className="text-xs leading-relaxed" style={{ color: 'var(--c-text)' }}>
                          <strong style={{ color: '#6c3bff' }}>{s.n}.</strong> {s.description}
                          {s.tool_hint && <span className="ml-1 text-[10px]" style={{ color: 'var(--c-text-4)' }}>↳ {s.tool_hint}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {t.plan.risks && t.plan.risks.length > 0 && (
                    <div className="rounded p-2" style={{ background: '#fef3c720', borderLeft: '2px solid #f59e0b' }}>
                      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#92400e' }}>Riesgos</div>
                      <ul className="text-xs space-y-0.5" style={{ color: 'var(--c-text-2)' }}>
                        {t.plan.risks.map((r, i) => <li key={i}>· {r}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="rounded p-2" style={{ background: 'var(--c-surface)' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-3)' }}>Se logrará cuando</div>
                    <p className="text-xs leading-snug" style={{ color: 'var(--c-text)' }}>{t.plan.success_metric}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
                <button
                  type="button"
                  onClick={() => decide(t, 'approve')}
                  disabled={busyId === t.id}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ background: '#6c3bff', color: '#fff' }}
                >
                  <CheckCircle2 size={12} /> Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => decide(t, 'reject')}
                  disabled={busyId === t.id}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{ background: 'transparent', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
                >
                  <X size={12} /> Rechazar
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
