'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle, Clock, Bot,
  ListChecks, RefreshCw, X,
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

const FILTERS: { key: Filter; label: string; statuses: TaskStatus[]; isHistory: boolean }[] = [
  { key: 'active', label: 'En curso',   statuses: ACTIVE_STATUSES, isHistory: false },
  { key: 'done',   label: 'Terminadas', statuses: DONE_STATUSES,   isHistory: true  },
  { key: 'failed', label: 'Fallidas',   statuses: FAILED_STATUSES, isHistory: true  },
];

export default function AgentTasksSection({ token }: { token: string }) {
  const [filter,   setFilter]   = useState<Filter>('active');
  const [items,    setItems]    = useState<Task[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = FILTERS.find(f => f.key === filter)!.statuses.join(',');
      const res  = await fetch(`/api/portal/${token}/agent-tasks?statuses=${statuses}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally { setLoading(false); }
  }, [token, filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const currentFilter = FILTERS.find(f => f.key === filter);
  const currentLabel  = currentFilter?.label ?? '';
  const showDateRange = currentFilter?.isHistory ?? false;

  const filteredItems = items.filter(t => {
    if (!showDateRange) return true; // En curso ignora fechas — es dashboard vivo
    const createdISO = t.created_at?.slice(0, 10) ?? '';
    const matchFrom  = !dateFrom || createdISO >= dateFrom;
    const matchTo    = !dateTo   || createdISO <= dateTo;
    return matchFrom && matchTo;
  });

  const filterSubtitle: Record<Filter, string> = {
    active: 'Tareas activas: en cola para ejecutar o en curso ahora mismo.',
    done:   'Historial de tareas resueltas por el equipo (completas o con detalles).',
    failed: 'Historial de tareas canceladas o que fallaron durante la ejecución.',
  };

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
            {filteredItems.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {filteredItems.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            {filterSubtitle[filter]}
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

      {/* Filter pills + rango de fechas */}
      <div
        className="px-5 py-2.5 flex items-center gap-3 flex-wrap"
        style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
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
        {/* Rango de fechas — solo en tabs de historial (Terminadas / Fallidas).
            En curso es dashboard vivo (pocos items, no necesita filtro). */}
        {showDateRange && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] ml-auto" style={{ color: '#6B6480' }}>
            <span>Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
              style={{
                background: '#ffffff',
                border: dateFrom ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
                color: '#1A0A3B', outline: 'none',
              }}
            />
            <span>hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
              style={{
                background: '#ffffff',
                border: dateTo ? '1px solid rgba(108,59,255,0.5)' : '1px solid #E8E3F5',
                color: '#1A0A3B', outline: 'none',
              }}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:opacity-70"
                style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', fontWeight: 600 }}
              >
                <X size={10} /> limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div
          className="px-5 py-8 flex items-center justify-center"
          style={{ borderTop: '1px solid #F0EDF9' }}
        >
          <Loader2 size={16} className="animate-spin" style={{ color: '#9B8FB5' }} />
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <EmptyState
            icon={ListChecks}
            title={items.length === 0
              ? `Sin tareas ${currentLabel.toLowerCase()}`
              : 'Sin resultados en el rango de fechas'}
            description={items.length === 0
              ? 'Cuando tu equipo tenga trabajo en este estado, aparecerá aquí.'
              : 'Ajusta las fechas o limpia el filtro para ver más resultados.'}
          />
        </div>
      ) : (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {filteredItems.map((t, idx) => (
            <div
              key={t.id}
              className="px-5 py-4 flex flex-col gap-3"
              style={{ borderBottom: idx === filteredItems.length - 1 ? 'none' : '1px solid #F0EDF9' }}
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

