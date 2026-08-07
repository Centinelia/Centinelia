'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle, Clock, Bot,
  GitBranch, ChevronDown, ChevronRight, ListChecks, RefreshCw,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

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

  const currentLabel = FILTERS.find(f => f.key === filter)?.label ?? '';

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
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
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Tareas del equipo
            </h2>
            {items.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {items.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1 whitespace-nowrap" style={{ color: '#6B6480' }}>
            Trabajo delegado a los empleados.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-70"
            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
          >
            <RefreshCw size={11} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div
        className="px-5 py-2.5 flex items-center gap-1.5 flex-wrap"
        style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: active ? '#6C3BFF' : '#ffffff',
                color:      active ? '#ffffff' : '#6B6480',
                border:     active ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div
          className="px-5 py-8 flex items-center justify-center"
          style={{ borderTop: '1px solid #F0EDF9' }}
        >
          <Loader2 size={16} className="animate-spin" style={{ color: '#9B8FB5' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <EmptyState
            icon={ListChecks}
            title={`Sin tareas ${currentLabel.toLowerCase()}`}
            description="Cuando tu equipo tenga trabajo en este estado, aparecerá aquí."
          />
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {items.map((t, idx) => (
            <div
              key={t.id}
              className="px-5 py-4 flex flex-col gap-3"
              style={{ borderBottom: idx === items.length - 1 ? 'none' : '1px solid #F0EDF9' }}
            >
              <TaskRow task={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { icon: Icon, color } = statusVisual(task.status);
  const started  = task.started_at   ? fmt(task.started_at)   : null;
  const finished = task.completed_at ? fmt(task.completed_at) : null;
  const iter     = task.max_iterations && task.max_iterations > 1
    ? `Intento ${task.current_iteration ?? 1}/${task.max_iterations}`
    : null;

  return (
    <div className="flex items-start gap-3">
      <Icon size={16} style={{ color, marginTop: 2, flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{task.title}</h3>
          <span className="text-[11px] font-medium" style={{ color }}>{statusLabel(task.status)}</span>
          {iter && <span className="text-[11px]" style={{ color: '#9B8FB5' }}>· {iter}</span>}
        </div>

        {task.description && (
          <p className="text-[12px] mt-1 leading-relaxed" style={{ color: '#6B6480' }}>{task.description}</p>
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: '#9B8FB5' }}>
          {task.assigned_agent_name && (
            <span className="flex items-center gap-1"><Bot size={11} /> {task.assigned_agent_name}</span>
          )}
          {task.trigger_type && <span>Trigger: {task.trigger_type}</span>}
          {started && <span>Inició: {started}</span>}
          {finished && <span>Terminó: {finished}</span>}
          {task.goal_met !== null && task.goal_met !== undefined && (
            <span style={{ color: task.goal_met ? '#22C55E' : '#EF4444' }}>
              {task.goal_met ? 'Criterio cumplido' : 'Criterio no cumplido'}
            </span>
          )}
        </div>

        {task.success_criteria && (
          <div
            className="mt-2 text-[12px] px-3 py-2 rounded-lg"
            style={{ background: 'rgba(108,59,255,0.05)', color: '#6B6480', border: '1px solid rgba(108,59,255,0.14)' }}
          >
            <strong style={{ color: '#1A0A3B' }}>Criterio de éxito: </strong>{task.success_criteria}
          </div>
        )}

        {task.result && (
          <div
            className="mt-2 text-[12px] px-3 py-2 rounded-lg"
            style={{ background: '#FAFAFB', color: '#1A0A3B', border: '1px solid #E8E3F5' }}
          >
            <strong style={{ color: '#6B6480' }}>Resultado: </strong>{task.result}
          </div>
        )}

        {task.eval_notes && task.status !== 'completed' && (
          <div
            className="mt-2 text-[12px] px-3 py-2 rounded-lg"
            style={{ background: '#FEF2F2', color: '#6B6480', border: '1px solid #FECACA' }}
          >
            <strong style={{ color: '#EF4444' }}>Evaluación: </strong>{task.eval_notes}
          </div>
        )}

        <TransitionsTimeline taskId={task.id} />
      </div>
    </div>
  );
}

function statusVisual(s: TaskStatus): { icon: typeof CheckCircle2; color: string } {
  switch (s) {
    case 'completed':  return { icon: CheckCircle2,  color: '#22C55E' };
    case 'partial':    return { icon: AlertTriangle, color: '#F59E0B' };
    case 'in_progress':return { icon: Loader2,       color: '#6C3BFF' };
    case 'pending':    return { icon: Clock,         color: '#9B8FB5' };
    case 'failed':     return { icon: XCircle,       color: '#EF4444' };
    case 'cancelled':  return { icon: XCircle,       color: '#9B8FB5' };
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
        className="flex items-center gap-1.5 text-[11px] transition-opacity hover:opacity-70"
        style={{ color: '#9B8FB5' }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <GitBranch size={10} />
        <span>Historial de estados</span>
      </button>

      {open && (
        <div className="mt-2 pl-3" style={{ borderLeft: '1px solid #E8E3F5' }}>
          {loading && <p className="text-[11px]" style={{ color: '#9B8FB5' }}>Cargando…</p>}
          {!loading && items?.length === 0 && (
            <p className="text-[11px]" style={{ color: '#9B8FB5' }}>Sin historial registrado.</p>
          )}
          {!loading && items && items.length > 0 && (
            <ol className="space-y-1.5">
              {items.map(t => (
                <li key={t.id} className="text-[11px]" style={{ color: '#6B6480' }}>
                  <span className="font-mono" style={{ color: '#9B8FB5' }}>{fmt(t.transitioned_at)}</span>
                  {' · '}
                  <span style={{ color: '#1A0A3B' }}>{t.from_status ? `${t.from_status} → ${t.to_status}` : `→ ${t.to_status}`}</span>
                  {' · '}
                  <span style={{ color: '#9B8FB5' }}>{t.actor}</span>
                  {t.reason && (
                    <span style={{ color: '#9B8FB5' }}> · {t.reason}</span>
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
