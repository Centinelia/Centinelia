'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Clock, Bot, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed' | 'cancelled';

interface Task {
  id:                   string;
  title:                string;
  description:          string | null;
  assigned_to:          string | null;
  created_by:           string | null;
  created_at:           string;
  status:               TaskStatus;
  started_at:           string | null;
  completed_at:         string | null;
  success_criteria:     string | null;
  current_iteration:    number | null;
  max_iterations:       number | null;
  goal_met:             boolean | null;
  eval_notes:           string | null;
  result:               string | null;
  trigger_type:         string | null;
  assigned_agent_name?: string | null;
}

const ACTIVE_STATUSES:  TaskStatus[] = ['pending', 'in_progress'];
const DONE_STATUSES:    TaskStatus[] = ['completed', 'partial'];
const FAILED_STATUSES:  TaskStatus[] = ['failed', 'cancelled'];

type Filter = 'active' | 'done' | 'failed';

const FILTERS: { key: Filter; label: string; statuses: TaskStatus[] }[] = [
  { key: 'active', label: 'En curso',   statuses: ACTIVE_STATUSES },
  { key: 'done',   label: 'Terminadas', statuses: DONE_STATUSES },
  { key: 'failed', label: 'Fallidas',   statuses: FAILED_STATUSES },
];

export default function AgentTasksSection({ token }: { token: string }) {
  const [filter, setFilter] = useState<Filter>('active');
  const [items,  setItems]  = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = FILTERS.find(f => f.key === filter)!.statuses.join(',');
      const res  = await fetch(`/api/portal/${token}/agent-tasks?statuses=${statuses}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Tareas del equipo</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
            Trabajo delegado a los empleados. Ves el estado, la iteración del intento y el resultado.
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
        >
          Actualizar
        </button>
      </div>

      <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', width: 'fit-content' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-md text-xs transition-all"
            style={{
              color:      filter === f.key ? '#FAFBFF' : 'var(--c-text-2)',
              background: filter === f.key ? '#6C3BFF' : 'transparent',
              fontWeight: filter === f.key ? 600 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Cargando…</p>}

      {!loading && items.length === 0 && (
        <div className="p-6 rounded-lg text-sm text-center"
             style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
          Sin tareas en este estado.
        </div>
      )}

      <div className="space-y-2">
        {items.map(t => <TaskCard key={t.id} task={t} />)}
      </div>
    </section>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { icon: Icon, color } = statusVisual(task.status);
  const started  = task.started_at   ? fmt(task.started_at)   : null;
  const finished = task.completed_at ? fmt(task.completed_at) : null;
  const iter     = task.max_iterations && task.max_iterations > 1
    ? `Intento ${task.current_iteration ?? 1}/${task.max_iterations}`
    : null;

  return (
    <div className="p-4 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-start gap-3">
        <Icon size={18} style={{ color, marginTop: 2, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{task.title}</h3>
            <span className="text-xs" style={{ color }}>{statusLabel(task.status)}</span>
            {iter && <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>· {iter}</span>}
          </div>

          {task.description && (
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>{task.description}</p>
          )}

          <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: 'var(--c-text-3)' }}>
            {task.assigned_agent_name && (
              <span className="flex items-center gap-1"><Bot size={12} /> {task.assigned_agent_name}</span>
            )}
            {task.trigger_type && <span>Trigger: {task.trigger_type}</span>}
            {started && <span>Inició: {started}</span>}
            {finished && <span>Terminó: {finished}</span>}
            {task.goal_met !== null && task.goal_met !== undefined && (
              <span style={{ color: task.goal_met ? '#4ade80' : '#f87171' }}>
                {task.goal_met ? 'Criterio cumplido' : 'Criterio NO cumplido'}
              </span>
            )}
          </div>

          {task.success_criteria && (
            <div className="mt-2 text-xs p-2 rounded" style={{ background: 'rgba(108,59,255,0.05)', color: 'var(--c-text-2)' }}>
              <strong style={{ color: 'var(--c-text)' }}>Criterio de éxito:</strong> {task.success_criteria}
            </div>
          )}

          {task.result && (
            <div className="mt-2 text-xs p-2 rounded" style={{ background: 'rgba(0,0,0,0.15)', color: 'var(--c-text)' }}>
              <strong style={{ color: 'var(--c-text-2)' }}>Resultado:</strong> {task.result}
            </div>
          )}

          {task.eval_notes && task.status !== 'completed' && (
            <div className="mt-2 text-xs p-2 rounded" style={{ background: 'rgba(248,113,113,0.08)', color: 'var(--c-text-2)' }}>
              <strong style={{ color: '#f87171' }}>Evaluación:</strong> {task.eval_notes}
            </div>
          )}

          <TransitionsTimeline taskId={task.id} />
        </div>
      </div>
    </div>
  );
}

function statusVisual(s: TaskStatus): { icon: typeof CheckCircle2; color: string } {
  switch (s) {
    case 'completed':  return { icon: CheckCircle2,  color: '#4ade80' };
    case 'partial':    return { icon: AlertTriangle, color: '#facc15' };
    case 'in_progress':return { icon: Loader2,      color: '#9B6DFF' };
    case 'pending':    return { icon: Clock,        color: 'var(--c-text-2)' };
    case 'failed':     return { icon: XCircle,      color: '#f87171' };
    case 'cancelled':  return { icon: XCircle,      color: 'var(--c-text-3)' };
  }
}

function statusLabel(s: TaskStatus): string {
  return { completed: 'Completada', partial: 'Parcial', in_progress: 'En curso', pending: 'Pendiente', failed: 'Falló', cancelled: 'Cancelada' }[s];
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Transition {
  id:              string;
  from_status:     string | null;
  to_status:       string;
  actor:           string;
  reason:          string | null;
  metadata:        Record<string, unknown> | null;
  transitioned_at: string;
}

function TransitionsTimeline({ taskId }: { taskId: string }) {
  const params = useParams<{ token: string }>();
  const token  = params?.token as string | undefined;
  const [open,   setOpen]   = useState(false);
  const [items,  setItems]  = useState<Transition[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token || items || loading) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/agent-tasks/${taskId}/transitions`);
      const data = await res.json();
      setItems(data.transitions ?? []);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [token, taskId, items, loading]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-80"
        style={{ color: 'var(--c-text-3)' }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <GitBranch size={11} />
        <span>Historial de estados</span>
      </button>

      {open && (
        <div className="mt-2 pl-4 border-l" style={{ borderColor: 'var(--c-border)' }}>
          {loading && <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Cargando…</p>}
          {!loading && items?.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Sin historial registrado (tarea previa al state machine).</p>
          )}
          {!loading && items && items.length > 0 && (
            <ol className="space-y-1.5">
              {items.map(t => (
                <li key={t.id} className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                  <span className="font-mono" style={{ color: 'var(--c-text-3)' }}>{fmt(t.transitioned_at)}</span>
                  {' · '}
                  <span style={{ color: 'var(--c-text)' }}>{t.from_status ? `${t.from_status} → ${t.to_status}` : `→ ${t.to_status}`}</span>
                  {' · '}
                  <span style={{ color: 'var(--c-text-3)' }}>{t.actor}</span>
                  {t.reason && (
                    <span style={{ color: 'var(--c-text-3)' }}> · {t.reason}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
