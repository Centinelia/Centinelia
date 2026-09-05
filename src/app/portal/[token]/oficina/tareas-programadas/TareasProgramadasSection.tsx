'use client';

import { useState, useEffect, useCallback } from 'react';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';
import {
  CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
  Play, Loader2, AlertTriangle,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import OficinaModal from '../OficinaModal';

interface Agent {
  id:              string;
  agent_name:      string | null;
  role:            string | null;
  is_coordinator:  boolean;
  meerkat_role_id: string | null;
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
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const fmtH = (h: number) =>
  h === 0 ? '12:00 am' : h < 12 ? `${h}:00 am` : h === 12 ? '12:00 pm' : `${h - 12}:00 pm`;

const STATUS_CONFIG = {
  success: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Exitosa',  Icon: CheckCircle2 },
  partial: { color: 'text-amber-400',   bg: 'bg-amber-400/10',   label: 'Parcial',  Icon: RefreshCw    },
  failed:  { color: 'text-red-400',     bg: 'bg-red-400/10',     label: 'Fallida',  Icon: XCircle      },
};

function scheduleLabel(frequency: string, schedule: Record<string, number>): string {
  const h = fmtH(schedule.hour ?? 8);
  if (frequency === 'daily')   return `Diario a las ${h}`;
  if (frequency === 'weekly')  return `Semanal: ${DAY_LABELS[schedule.day_of_week ?? 1]} a las ${h}`;
  if (frequency === 'monthly') return `Mensual: día ${schedule.day_of_month ?? 1} a las ${h}`;
  return FREQ_LABELS[frequency] ?? frequency;
}

function agentDisplayName(agent: Agent): string {
  return agent.agent_name ?? agent.role ?? 'Agente';
}

// ── AgentAvatar ───────────────────────────────────────────────────────────────

function AgentAvatar({ agent, size = 36 }: { agent: Agent; size?: number }) {
  const meerkat = agent.meerkat_role_id
    ? MEERKAT_MAP[agent.meerkat_role_id as keyof typeof MEERKAT_MAP]
    : null;
  const color = meerkat?.color ?? '#6C3BFF';

  if (meerkat?.imagen) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 8,
        background: `${color}18`, border: `1px solid ${color}28`,
        overflow: 'hidden', flexShrink: 0,
      }}>
        <img
          src={meerkat.imagen}
          alt={meerkat.nombre}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 10%' }}
        />
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: `${color}18`, border: `1px solid ${color}28`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, color, fontSize: size * 0.42, fontWeight: 700,
    }}>
      {(agent.agent_name ?? agent.role ?? 'A')[0].toUpperCase()}
    </div>
  );
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({
  taskName, onConfirm, onClose,
}: { taskName: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <OficinaModal
      open
      onClose={onClose}
      eyebrow="Eliminar"
      title="Eliminar tarea programada"
      description="Esta acción no se puede deshacer."
      size="md"
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose}>Cancelar</OficinaModal.SecondaryAction>
          <button
            onClick={onConfirm}
            className="rounded-xl transition-all"
            style={{
              padding: '9px 18px', background: '#EF4444', color: '#fff',
              fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(239,68,68,0.32)',
            }}
          >
            Eliminar
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ width: 40, height: 40, background: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <AlertTriangle size={18} style={{ color: '#EF4444' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] italic p-3 rounded-lg"
            style={{ color: '#1A0A3B', background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            &ldquo;{taskName}&rdquo;
          </p>
        </div>
      </div>
    </OficinaModal>
  );
}

// ── RunResultModal ────────────────────────────────────────────────────────────

function RunResultModal({
  result, onClose,
}: { result: { ok: boolean; message?: string; error?: string }; onClose: () => void }) {
  return (
    <OficinaModal
      open
      onClose={onClose}
      eyebrow={result.ok ? 'Ejecutada' : 'Error'}
      title={result.ok ? 'Tarea enviada al agente' : 'Error al ejecutar'}
      description={result.ok ? 'El agente procesará la instrucción.' : 'Revisa la configuración del agente.'}
      size="md"
      footer={
        <OficinaModal.PrimaryAction onClick={onClose}>Cerrar</OficinaModal.PrimaryAction>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            width: 40, height: 40,
            background: result.ok ? '#ECFDF5' : '#FEF2F2',
            border:     result.ok ? '1px solid #A7F3D0' : '1px solid #FECACA',
          }}
        >
          {result.ok
            ? <CheckCircle2 size={18} style={{ color: '#22C55E' }} />
            : <XCircle     size={18} style={{ color: '#EF4444' }} />}
        </div>
        <div className="flex-1 min-w-0">
          {(result.message ?? result.error) && (
            <p
              className="text-[12px] rounded-lg p-3"
              style={{
                color: '#1A0A3B', background: '#FAFAFB', border: '1px solid #E8E3F5',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6,
              }}
            >
              {result.message ?? result.error}
            </p>
          )}
        </div>
      </div>
    </OficinaModal>
  );
}

// ── CreateModal ───────────────────────────────────────────────────────────────

interface CreateModalProps {
  agents:  Agent[];
  token:   string;
  onSaved: (task: ScheduledTask) => void;
  onClose: () => void;
}

function CreateModal({ agents, token, onSaved, onClose }: CreateModalProps) {
  const [agentId,         setAgentId]         = useState(agents[0]?.id ?? '');
  const [name,            setName]            = useState('');
  const [description,     setDescription]     = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [maxIterations,   setMaxIterations]   = useState(3);
  const [frequency,       setFrequency]       = useState('weekly');
  const [dayOfWeek,       setDayOfWeek]       = useState(1);
  const [dayOfMonth,      setDayOfMonth]      = useState(1);
  const [hour,            setHour]            = useState(9);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');

  const selectedAgent = agents.find(a => a.id === agentId);

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
          agent_id:         agentId,
          name:             name.trim(),
          description:      description.trim(),
          success_criteria: successCriteria.trim() || undefined,
          max_iterations:   maxIterations,
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

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#ffffff', border: '1px solid #E8E3F5',
    borderRadius: 10, padding: '10px 14px', color: '#1A0A3B', fontSize: 14, outline: 'none',
  };

  return (
    <OficinaModal
      open
      onClose={onClose}
      eyebrow="Nueva tarea"
      title="Programa una ejecución automática"
      description="El agente la ejecutará en el horario que definas."
      size="md"
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={handleSave} loading={saving}>Guardar</OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Agent */}
        <OficinaModal.Field label="Asignar a">
          <div className="flex items-center gap-2">
            {selectedAgent && <AgentAvatar agent={selectedAgent} size={36} />}
            <div className="flex-1">
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger
                  className="rounded-lg"
                  style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '10px 14px', fontSize: 14 }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.agent_name ?? a.role ?? 'Agente'}{a.is_coordinator ? ' (Coordinador)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </OficinaModal.Field>

        <OficinaModal.Field label="Nombre de la tarea">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Reporte semanal de leads"
            style={inputStyle}
          />
        </OficinaModal.Field>

        <OficinaModal.Field label="Instrucción para el agente">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe qué debe hacer. Ej: Genera un resumen de los leads de la semana y envíalo por correo."
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.55 }}
          />
        </OficinaModal.Field>

        <OficinaModal.Field label="Criterio de listo" hint="opcional">
          <input
            value={successCriteria}
            onChange={e => setSuccessCriteria(e.target.value)}
            placeholder="Ej: El correo fue enviado con al menos 3 leads listados"
            style={inputStyle}
          />
          {successCriteria && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs" style={{ color: '#6B6480' }}>Reintentos si no se cumple:</span>
              <Select value={String(maxIterations)} onValueChange={v => setMaxIterations(Number(v))}>
                <SelectTrigger
                  className="w-auto rounded-md"
                  style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '4px 8px', fontSize: 12 }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </OficinaModal.Field>

        <OficinaModal.Field label="Frecuencia">
          <div className="grid grid-cols-3 gap-2 mb-2">
            {(['daily', 'weekly', 'monthly'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className="rounded-lg text-[13px] font-semibold transition-all"
                style={{
                  padding:    '9px 0',
                  border:     'none',
                  cursor:     'pointer',
                  background: frequency === f ? '#1A0A3B' : '#ffffff',
                  color:      frequency === f ? '#ffffff' : '#6B6480',
                  boxShadow:  frequency === f ? '0 2px 6px rgba(26,10,59,0.2)' : 'none',
                  outline:    frequency === f ? 'none' : '1px solid #E8E3F5',
                }}
              >
                {FREQ_LABELS[f]}
              </button>
            ))}
          </div>

          <div className="flex gap-2.5">
            {frequency === 'weekly' && (
              <div className="flex-1">
                <label className="text-[10px] block mb-1" style={{ color: '#9B8FB5' }}>Día</label>
                <Select value={String(dayOfWeek)} onValueChange={v => setDayOfWeek(Number(v))}>
                  <SelectTrigger className="rounded-lg" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '8px 12px', fontSize: 13 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {frequency === 'monthly' && (
              <div className="flex-1">
                <label className="text-[10px] block mb-1" style={{ color: '#9B8FB5' }}>Día del mes</label>
                <input
                  type="number" min={1} max={28}
                  value={dayOfMonth}
                  onChange={e => setDayOfMonth(Number(e.target.value))}
                  style={{ ...inputStyle, padding: '8px 12px', fontSize: 13, borderRadius: 8 }}
                />
              </div>
            )}
            <div className="flex-1">
              <label className="text-[10px] block mb-1" style={{ color: '#9B8FB5' }}>Hora</label>
              <Select value={String(hour)} onValueChange={v => setHour(Number(v))}>
                <SelectTrigger className="rounded-lg" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '8px 12px', fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map(h => <SelectItem key={h} value={String(h)}>{fmtH(h)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </OficinaModal.Field>

        {error && <p className="text-[13px]" style={{ color: '#EF4444' }}>{error}</p>}
      </div>
    </OficinaModal>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({
  task, agents, running,
  onToggle, onDelete, onRun,
}: {
  task:     ScheduledTask;
  agents:   Agent[];
  running:  string | null;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onRun:    (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const agent     = agents.find(a => a.id === task.agent_id);
  const meerkat   = agent?.meerkat_role_id ? MEERKAT_MAP[agent.meerkat_role_id as keyof typeof MEERKAT_MAP] : null;
  const acColor   = meerkat?.color ?? '#6C3BFF';
  const status    = task.last_status ? STATUS_CONFIG[task.last_status as keyof typeof STATUS_CONFIG] : null;
  const isRunning = running === task.id;

  const nextRun   = task.next_run_at ? new Date(task.next_run_at) : null;
  const nextLabel = nextRun
    ? nextRun.toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  const hasDetails = Boolean(task.description || task.success_criteria || task.last_result);

  return (
    <div style={{ opacity: task.active ? 1 : 0.6, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {agent && <AgentAvatar agent={agent} size={36} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ color: '#1A0A3B', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{task.name}</p>
              {agent && (
                <p style={{ color: '#9B8FB5', fontSize: 12, marginTop: 2 }}>
                  {agentDisplayName(agent)}{agent.role ? ` · ${agent.role}` : ''}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => onRun(task.id)}
                disabled={isRunning}
                title="Ejecutar ahora"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${acColor}15`, border: `1px solid ${acColor}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isRunning ? 'not-allowed' : 'pointer', color: acColor,
                  flexShrink: 0,
                }}
              >
                {isRunning
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Play size={11} style={{ marginLeft: 1 }} />
                }
              </button>
              <button
                onClick={() => onToggle(task.id, !task.active)}
                title={task.active ? 'Pausar' : 'Activar'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: task.active ? acColor : '#9B8FB5', padding: 2 }}
              >
                {task.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
              <button
                onClick={() => onDelete(task.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#9B8FB5', padding: 2 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${acColor}10`, border: `1px solid ${acColor}22`, borderRadius: 20, padding: '3px 10px', color: acColor, fontSize: 11, fontWeight: 500 }}>
              <CalendarClock size={10} />
              {scheduleLabel(task.frequency, task.schedule)}
            </span>
            {task.success_criteria && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(108,59,255,0.07)', border: '1px solid rgba(108,59,255,0.18)', borderRadius: 20, padding: '3px 10px', color: '#6C3BFF', fontSize: 11 }}>
                {task.max_iterations} reintento{task.max_iterations !== 1 ? 's' : ''}
              </span>
            )}
            {status && (
              <span className={`inline-flex items-center gap-1 ${status.bg} rounded-full px-2.5 py-0.5 ${status.color} text-xs border border-transparent`}>
                <status.Icon size={10} />
                {status.label}
                {task.last_goal_met === true  && ': criterio cumplido'}
                {task.last_goal_met === false && ': criterio no cumplido'}
              </span>
            )}
          </div>

          {/* Next run */}
          {nextLabel && (
            <p style={{ color: '#9B8FB5', fontSize: 11, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} />
              Próxima: {nextLabel}
            </p>
          )}

          {/* Expandable details */}
          {hasDetails && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-[11px] transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9B8FB5' }}
              >
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                <span>Detalles</span>
              </button>

              {expanded && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {task.description && (
                    <div>
                      <p style={{ color: '#9B8FB5', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Instrucción</p>
                      <p style={{ color: '#1A0A3B', fontSize: 12, lineHeight: 1.6 }}>{task.description}</p>
                    </div>
                  )}
                  {task.success_criteria && (
                    <div>
                      <p style={{ color: '#9B8FB5', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Criterio de listo</p>
                      <p style={{ color: '#1A0A3B', fontSize: 12, lineHeight: 1.6 }}>{task.success_criteria}</p>
                    </div>
                  )}
                  {task.last_result && (
                    <div>
                      <p style={{ color: '#9B8FB5', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Último resultado</p>
                      <p style={{ color: '#6B6480', fontSize: 12, lineHeight: 1.6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: '#FAFAFB', border: '1px solid #E8E3F5', borderRadius: 10, padding: '10px 12px' }}>
                        {task.last_result}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [running,    setRunning]    = useState<string | null>(null);
  const [runResult,  setRunResult]  = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function handleToggle(id: string, active: boolean) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, active } : t));
    await fetch(`/api/portal/${token}/scheduled-tasks`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, active }),
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/portal/${token}/scheduled-tasks`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
  }

  async function handleRun(id: string) {
    setRunning(id);
    try {
      const res  = await fetch(`/api/portal/${token}/scheduled-tasks`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      setRunResult({ ok: data.ok ?? false, message: data.message, error: data.error });
    } catch {
      setRunResult({ ok: false, error: 'Error de red al ejecutar la tarea.' });
    } finally {
      setRunning(null);
    }
  }

  const deleteTask = tasks.find(t => t.id === deleteId);
  const active     = tasks.filter(t =>  t.active);
  const paused     = tasks.filter(t => !t.active);
  const ordered    = [...active, ...paused];
  const firstPausedIdx = active.length;

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
              Tareas programadas
            </h2>
            {tasks.length > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {tasks.length}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Nox coordina a todo el equipo en automático. Define qué, cuándo y con qué criterio.
          </p>
        </div>
        {agents.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Actualizar"
              className="flex items-center justify-center rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
              style={{ width: 32, height: 32, background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
            >
              <Plus size={12} />
              Nueva
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && tasks.length === 0 && (
        <div
          className="px-5 py-8 flex items-center justify-center"
          style={{ borderTop: '1px solid #F0EDF9' }}
        >
          <Loader2 size={16} className="animate-spin" style={{ color: '#9B8FB5' }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <div style={{ borderTop: '1px solid #F0EDF9' }}>
          <EmptyState
            icon={CalendarClock}
            title="Sin tareas programadas"
            description="Crea tareas para que tu equipo ejecute reportes, seguimientos o revisiones automáticamente."
            action={agents.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
              >
                <Plus size={12} />
                Crear primera tarea
              </button>
            ) : undefined}
          />
        </div>
      )}

      {/* Rows */}
      {!loading && tasks.length > 0 && (
        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {ordered.map((task, idx) => {
            const isFirstPaused = paused.length > 0 && idx === firstPausedIdx;
            return (
              <div key={task.id}>
                {isFirstPaused && (
                  <div
                    className="px-5 py-2"
                    style={{
                      borderTop:  '1px solid #F0EDF9',
                      background: '#FAFAFB',
                    }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#9B8FB5' }}>
                      Pausadas
                    </p>
                  </div>
                )}
                <div
                  className="px-5 py-4"
                  style={{ borderBottom: idx === ordered.length - 1 ? 'none' : '1px solid #F0EDF9' }}
                >
                  <TaskRow
                    task={task}
                    agents={agents}
                    running={running}
                    onToggle={handleToggle}
                    onDelete={id => setDeleteId(id)}
                    onRun={handleRun}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal
          agents={agents}
          token={token}
          onSaved={task => { setTasks(prev => [task, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {deleteId && deleteTask && (
        <DeleteConfirmModal
          taskName={deleteTask.name}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteId(null)}
        />
      )}

      {runResult && (
        <RunResultModal
          result={runResult}
          onClose={() => setRunResult(null)}
        />
      )}
    </div>
  );
}
