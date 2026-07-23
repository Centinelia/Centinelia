'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Agent {
  id:             string;
  agent_name:     string | null;
  role:           string | null;
  is_coordinator: boolean;
}

interface ScheduledTask {
  id:               string;
  agent_id:         string;
  name:             string;
  description:      string;
  success_criteria: string | null;
  max_iterations:   number;
  frequency:        string;
  schedule:         Record<string, number>;
  active:           boolean;
  last_run_at:      string | null;
  next_run_at:      string | null;
  last_result:      string | null;
  last_status:      string | null;
  last_goal_met:    boolean | null;
}

const FREQ_LABELS: Record<string, string> = {
  daily:   'Diario',
  weekly:  'Semanal',
  monthly: 'Mensual',
};

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const STATUS_CONFIG = {
  success: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Exitosa',  Icon: CheckCircle2 },
  partial: { color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Parcial',  Icon: RefreshCw    },
  failed:  { color: 'text-red-400',     bg: 'bg-red-400/10',     label: 'Fallida',  Icon: XCircle      },
};

function scheduleLabel(frequency: string, schedule: Record<string, number>): string {
  if (frequency === 'daily')   return `Diario a las ${schedule.hour ?? 8}:00`;
  if (frequency === 'weekly')  return `Semanal — ${DAY_LABELS[schedule.day_of_week ?? 1]} a las ${schedule.hour ?? 9}:00`;
  if (frequency === 'monthly') return `Mensual — día ${schedule.day_of_month ?? 1} a las ${schedule.hour ?? 8}:00`;
  return FREQ_LABELS[frequency] ?? frequency;
}

function agentLabel(agent: Agent): string {
  if (agent.agent_name && agent.role) return `${agent.agent_name} — ${agent.role}`;
  return agent.agent_name ?? agent.role ?? 'Agente';
}

// ── Create modal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  agents:  Agent[];
  token:   string;
  onSaved: (task: ScheduledTask) => void;
  onClose: () => void;
}

function CreateModal({ agents, token, onSaved, onClose }: CreateModalProps) {
  const [agentId,          setAgentId]          = useState(agents[0]?.id ?? '');
  const [name,             setName]             = useState('');
  const [description,      setDescription]      = useState('');
  const [successCriteria,  setSuccessCriteria]  = useState('');
  const [maxIterations,    setMaxIterations]     = useState(3);
  const [frequency,        setFrequency]        = useState('weekly');
  const [dayOfWeek,        setDayOfWeek]        = useState(1);
  const [dayOfMonth,       setDayOfMonth]       = useState(1);
  const [hour,             setHour]             = useState(9);
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');

  async function handleSave() {
    if (!name.trim() || !description.trim()) { setError('Nombre y descripción son requeridos.'); return; }
    setSaving(true);
    setError('');

    const schedule: Record<string, number> = { hour };
    if (frequency === 'weekly')  schedule.day_of_week  = dayOfWeek;
    if (frequency === 'monthly') schedule.day_of_month = dayOfMonth;

    try {
      const res = await fetch(`/api/portal/${token}/scheduled-tasks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id:        agentId,
          name:            name.trim(),
          description:     description.trim(),
          success_criteria: successCriteria.trim() || undefined,
          max_iterations:  maxIterations,
          frequency,
          schedule,
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      const data = await res.json() as { task: ScheduledTask };
      onSaved(data.task);
    } catch {
      setError('No se pudo guardar la tarea.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1A0A3B] border border-white/10 rounded-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-white font-semibold text-lg">Nueva tarea programada</h3>
          <p className="text-white/50 text-sm mt-1">El agente ejecutará esta tarea automáticamente en el horario definido.</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Agent */}
          <div>
            <label className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1.5 block">Asignar a</label>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#6C3BFF]/50"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id}>{agentLabel(a)}{a.is_coordinator ? ' (Coordinador)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1.5 block">Nombre de la tarea</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Reporte semanal de leads"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#6C3BFF]/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1.5 block">Instrucción para el agente</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe qué debe hacer el agente. Ej: Genera un resumen de los leads de la semana y envíalo por correo al dueño."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#6C3BFF]/50 resize-none"
            />
          </div>

          {/* Success criteria */}
          <div>
            <label className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1.5 block">
              Criterio de listo <span className="text-white/30 normal-case font-normal">(opcional)</span>
            </label>
            <input
              value={successCriteria}
              onChange={e => setSuccessCriteria(e.target.value)}
              placeholder="Ej: El correo fue enviado con al menos 3 leads listados"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#6C3BFF]/50"
            />
            {successCriteria && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-white/50 text-xs">Reintentos si no se cumple:</span>
                <select
                  value={maxIterations}
                  onChange={e => setMaxIterations(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                >
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div>
            <label className="text-white/70 text-xs font-medium uppercase tracking-wide mb-1.5 block">Frecuencia</label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(['daily','weekly','monthly'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`py-2 rounded-xl text-sm font-medium transition-colors ${frequency === f ? 'bg-[#6C3BFF] text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                >
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              {frequency === 'weekly' && (
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1 block">Día</label>
                  <select
                    value={dayOfWeek}
                    onChange={e => setDayOfWeek(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                  >
                    {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {frequency === 'monthly' && (
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1 block">Día del mes</label>
                  <input
                    type="number" min={1} max={28}
                    value={dayOfMonth}
                    onChange={e => setDayOfMonth(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                  />
                </div>
              )}
              <div className="flex-1">
                <label className="text-white/50 text-xs mb-1 block">Hora</label>
                <input
                  type="number" min={0} max={23}
                  value={hour}
                  onChange={e => setHour(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        <div className="p-6 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#6C3BFF] text-white text-sm font-medium hover:bg-[#5A2FE0] transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, agents, token,
  onToggle, onDelete,
}: {
  task:     ScheduledTask;
  agents:   Agent[];
  token:    string;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const agent   = agents.find(a => a.id === task.agent_id);
  const status  = task.last_status ? STATUS_CONFIG[task.last_status as keyof typeof STATUS_CONFIG] : null;

  const nextRun = task.next_run_at ? new Date(task.next_run_at) : null;
  const nextLabel = nextRun
    ? nextRun.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={`bg-white/[0.04] border rounded-2xl overflow-hidden transition-all ${task.active ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
      <div className="p-4 flex items-start gap-3">
        {/* Status / active indicator */}
        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${task.active ? 'bg-[#6C3BFF]' : 'bg-white/20'}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-white font-medium text-sm leading-tight">{task.name}</p>
              {agent && (
                <p className="text-white/50 text-xs mt-0.5">{agentLabel(agent)}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onToggle(task.id, !task.active)}
                className="text-white/40 hover:text-white/70 transition-colors"
                title={task.active ? 'Pausar' : 'Activar'}
              >
                {task.active ? <ToggleRight size={20} className="text-[#6C3BFF]" /> : <ToggleLeft size={20} />}
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Schedule + status pills */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5 text-white/60 text-xs">
              <CalendarClock size={10} />
              {scheduleLabel(task.frequency, task.schedule)}
            </span>
            {task.success_criteria && (
              <span className="inline-flex items-center gap-1 bg-[#6C3BFF]/10 border border-[#6C3BFF]/20 rounded-full px-2.5 py-0.5 text-[#9B6DFF] text-xs">
                {task.max_iterations} reintento{task.max_iterations !== 1 ? 's' : ''}
              </span>
            )}
            {status && (
              <span className={`inline-flex items-center gap-1 ${status.bg} border border-transparent rounded-full px-2.5 py-0.5 ${status.color} text-xs`}>
                <status.Icon size={10} />
                {status.label}
                {task.last_goal_met === true && ' — Criterio cumplido'}
                {task.last_goal_met === false && ' — Criterio no cumplido'}
              </span>
            )}
          </div>

          {/* Next run */}
          {nextLabel && (
            <p className="text-white/35 text-xs mt-2 flex items-center gap-1">
              <Clock size={10} />
              Próxima ejecución: {nextLabel}
            </p>
          )}
        </div>
      </div>

      {/* Expandable details */}
      {(task.description || task.success_criteria || task.last_result) && (
        <div className="border-t border-white/5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 flex items-center justify-between text-white/40 hover:text-white/60 text-xs transition-colors"
          >
            <span>Detalles</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Instrucción</p>
                <p className="text-white/70 text-sm leading-relaxed">{task.description}</p>
              </div>
              {task.success_criteria && (
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Criterio de listo</p>
                  <p className="text-white/70 text-sm leading-relaxed">{task.success_criteria}</p>
                </div>
              )}
              {task.last_result && (
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Ultimo resultado</p>
                  <p className="text-white/60 text-xs leading-relaxed font-mono bg-white/5 rounded-xl p-3">{task.last_result}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface Props {
  token:  string;
  agents: Agent[];
}

export default function TareasProgramadasSection({ token, agents }: Props) {
  const [tasks,      setTasks]      = useState<ScheduledTask[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/scheduled-tasks`);
      const data = await res.json() as { tasks: ScheduledTask[] };
      setTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function handleToggle(id: string, active: boolean) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, active } : t));
    await fetch(`/api/portal/${token}/scheduled-tasks`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, active }),
    });
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta tarea programada?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/portal/${token}/scheduled-tasks`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
  }

  const active  = tasks.filter(t => t.active);
  const paused  = tasks.filter(t => !t.active);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock size={20} className="text-[#6C3BFF]" />
            <h1 className="text-white font-semibold text-xl">Tareas programadas</h1>
          </div>
          <p className="text-white/50 text-sm">
            Tu equipo ejecuta estas tareas automáticamente. Si defines un criterio de listo, el agente reintenta hasta cumplirlo.
          </p>
        </div>
        {agents.length > 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-[#6C3BFF] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#5A2FE0] transition-colors flex-shrink-0"
          >
            <Plus size={16} />
            Nueva
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-[#6C3BFF]/30 border-t-[#6C3BFF] rounded-full animate-spin" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
          <CalendarClock size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Sin tareas programadas</p>
          <p className="text-white/25 text-xs mt-1">Crea una para que tu equipo trabaje solo.</p>
        </div>
      )}

      {!loading && active.length > 0 && (
        <div className="space-y-3 mb-6">
          {active.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              agents={agents}
              token={token}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {!loading && paused.length > 0 && (
        <div>
          <p className="text-white/30 text-xs uppercase tracking-wide mb-3">Pausadas</p>
          <div className="space-y-3">
            {paused.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                agents={agents}
                token={token}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateModal
          agents={agents}
          token={token}
          onSaved={task => { setTasks(prev => [task, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
