'use client';

import { useState, useEffect, useCallback } from 'react';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';
import {
  CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
  Play, Loader2, AlertTriangle,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', borderRadius: 16, maxWidth: 400, width: '100%', padding: 24 }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div>
            <p style={{ color: 'var(--c-text)', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Eliminar tarea programada</p>
            <p style={{ color: 'var(--c-text-3)', fontSize: 13 }}>Esta acción no se puede deshacer.</p>
          </div>
        </div>
        <p style={{ color: 'var(--c-text-2)', fontSize: 13, background: 'var(--c-surface-2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontStyle: 'italic' }}>
          "{taskName}"
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: 14, fontWeight: 600, border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer' }}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RunResultModal ────────────────────────────────────────────────────────────

function RunResultModal({
  result, onClose,
}: { result: { ok: boolean; message?: string; error?: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', borderRadius: 16, maxWidth: 440, width: '100%', padding: 24 }}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${result.ok ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
            {result.ok
              ? <CheckCircle2 size={18} className="text-emerald-400" />
              : <XCircle     size={18} className="text-red-400" />
            }
          </div>
          <div>
            <p style={{ color: 'var(--c-text)', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {result.ok ? 'Tarea enviada al agente' : 'Error al ejecutar'}
            </p>
            <p style={{ color: 'var(--c-text-3)', fontSize: 13 }}>
              {result.ok ? 'El agente procesará la instrucción.' : 'Revisa la configuración del agente.'}
            </p>
          </div>
        </div>
        {(result.message ?? result.error) && (
          <p style={{ color: 'var(--c-text-2)', fontSize: 12, background: 'var(--c-surface-2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontFamily: 'monospace', lineHeight: 1.6 }}>
            {result.message ?? result.error}
          </p>
        )}
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: '#6C3BFF', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Cerrar
        </button>
      </div>
    </div>
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

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)',
    borderRadius: 12, padding: '10px 14px', color: 'var(--c-text)', fontSize: 14, outline: 'none',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', borderRadius: 20, width: '100%', maxWidth: 520, overflowY: 'auto', maxHeight: '90vh' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--c-border-2)' }}>
          <p style={{ color: 'var(--c-text)', fontWeight: 600, fontSize: 16 }}>Nueva tarea programada</p>
          <p style={{ color: 'var(--c-text-3)', fontSize: 13, marginTop: 4 }}>El agente la ejecutará automáticamente en el horario definido.</p>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Agent */}
          <div>
            <label style={{ color: 'var(--c-text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Asignar a</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {selectedAgent && <AgentAvatar agent={selectedAgent} size={36} />}
              <div style={{ flex: 1 }}>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger
                    className="rounded-xl"
                    style={{
                      background: 'var(--c-surface-2)',
                      border: '1px solid var(--c-border-2)',
                      padding: '10px 14px',
                      fontSize: 14,
                    }}
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
          </div>

          {/* Name */}
          <div>
            <label style={{ color: 'var(--c-text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Nombre de la tarea</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Reporte semanal de leads"
              style={{ ...inputStyle }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ color: 'var(--c-text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Instrucción para el agente</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe qué debe hacer. Ej: Genera un resumen de los leads de la semana y envíalo por correo."
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.55 }}
            />
          </div>

          {/* Success criteria */}
          <div>
            <label style={{ color: 'var(--c-text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
              Criterio de listo{' '}
              <span style={{ color: 'var(--c-text-4)', fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
            </label>
            <input
              value={successCriteria}
              onChange={e => setSuccessCriteria(e.target.value)}
              placeholder="Ej: El correo fue enviado con al menos 3 leads listados"
              style={{ ...inputStyle }}
            />
            {successCriteria && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--c-text-3)', fontSize: 12 }}>Reintentos si no se cumple:</span>
                <Select value={String(maxIterations)} onValueChange={v => setMaxIterations(Number(v))}>
                  <SelectTrigger
                    className="w-auto rounded-md"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', padding: '4px 8px', fontSize: 12 }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div>
            <label style={{ color: 'var(--c-text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Frecuencia</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {(['daily', 'weekly', 'monthly'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  style={{ padding: '8px 0', borderRadius: 12, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', background: frequency === f ? '#6C3BFF' : 'var(--c-surface-2)', color: frequency === f ? '#fff' : 'var(--c-text-3)' }}
                >
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {frequency === 'weekly' && (
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'var(--c-text-4)', fontSize: 11, display: 'block', marginBottom: 4 }}>Día</label>
                  <Select value={String(dayOfWeek)} onValueChange={v => setDayOfWeek(Number(v))}>
                    <SelectTrigger
                      className="rounded-xl"
                      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', padding: '8px 12px', fontSize: 13 }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {frequency === 'monthly' && (
                <div style={{ flex: 1 }}>
                  <label style={{ color: 'var(--c-text-4)', fontSize: 11, display: 'block', marginBottom: 4 }}>Día del mes</label>
                  <input
                    type="number" min={1} max={28}
                    value={dayOfMonth}
                    onChange={e => setDayOfMonth(Number(e.target.value))}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', borderRadius: 12, padding: '8px 12px', color: 'var(--c-text)', fontSize: 13, outline: 'none' }}
                  />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <label style={{ color: 'var(--c-text-4)', fontSize: 11, display: 'block', marginBottom: 4 }}>Hora</label>
                <Select value={String(hour)} onValueChange={v => setHour(Number(v))}>
                  <SelectTrigger
                    className="rounded-xl"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', padding: '8px 12px', fontSize: 13 }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => <SelectItem key={h} value={String(h)}>{fmtH(h)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--c-border-2)', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'var(--c-surface-2)', color: 'var(--c-text-2)', fontSize: 14, border: 'none', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: '#6C3BFF', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({
  task, agents, token, running,
  onToggle, onDelete, onRun,
}: {
  task:     ScheduledTask;
  agents:   Agent[];
  token:    string;
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

  return (
    <div style={{
      background:    'var(--c-surface)',
      border:        `1px solid ${task.active ? acColor + '30' : 'var(--c-border-2)'}`,
      borderRadius:  16,
      overflow:      'hidden',
      opacity:       task.active ? 1 : 0.6,
      transition:    'opacity 0.2s, border-color 0.2s',
    }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {agent && <AgentAvatar agent={agent} size={36} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ color: 'var(--c-text)', fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{task.name}</p>
              {agent && (
                <p style={{ color: 'var(--c-text-4)', fontSize: 12, marginTop: 2 }}>
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: task.active ? acColor : 'var(--c-text-4)', padding: 2 }}
              >
                {task.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
              <button
                onClick={() => onDelete(task.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--c-text-4)', padding: 2 }}
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(108,59,255,0.07)', border: '1px solid rgba(108,59,255,0.18)', borderRadius: 20, padding: '3px 10px', color: '#9B6DFF', fontSize: 11 }}>
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
            <p style={{ color: 'var(--c-text-4)', fontSize: 11, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} />
              Próxima: {nextLabel}
            </p>
          )}
        </div>
      </div>

      {/* Expandable details */}
      {(task.description || task.success_criteria || task.last_result) && (
        <div style={{ borderTop: '1px solid var(--c-border-2)' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)', fontSize: 12 }}
          >
            <span>Detalles</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {expanded && (
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {task.description && (
                <div>
                  <p style={{ color: 'var(--c-text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>Instrucción</p>
                  <p style={{ color: 'var(--c-text-2)', fontSize: 13, lineHeight: 1.6 }}>{task.description}</p>
                </div>
              )}
              {task.success_criteria && (
                <div>
                  <p style={{ color: 'var(--c-text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>Criterio de listo</p>
                  <p style={{ color: 'var(--c-text-2)', fontSize: 13, lineHeight: 1.6 }}>{task.success_criteria}</p>
                </div>
              )}
              {task.last_result && (
                <div>
                  <p style={{ color: 'var(--c-text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>Ultimo resultado</p>
                  <p style={{ color: 'var(--c-text-3)', fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace', background: 'var(--c-surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                    {task.last_result}
                  </p>
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

  return (
    <div style={{ padding: 24, maxWidth: 680, margin: '0 auto' }}>

      {/* Hero banner */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', borderRadius: 14, overflow: 'hidden', display: 'flex', marginBottom: 24 }}>
        <img
          src="/meerkats/nox.png"
          alt="Nox"
          style={{ width: 90, height: 90, objectFit: 'contain', objectPosition: 'bottom center', flexShrink: 0, alignSelf: 'flex-end' }}
        />
        <div style={{ flex: 1, padding: '16px 12px 16px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ color: 'var(--c-text-4)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
            Tareas programadas
          </p>
          <p style={{ color: 'var(--c-text)', fontSize: 14, fontWeight: 500, lineHeight: 1.45 }}>
            Nox, tu director, coordina a todo el equipo en automático. Define qué hacer, cuándo y con qué criterio.
          </p>
        </div>
        {agents.length > 0 && (
          <div style={{ padding: '16px 16px 16px 8px', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6C3BFF', color: '#fff', padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <Plus size={15} />
              Nueva
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
          <div className="w-6 h-6 border-2 border-[#6C3BFF]/30 border-t-[#6C3BFF] rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <div style={{ border: '1px dashed var(--c-border-2)', borderRadius: 16, padding: '52px 24px', textAlign: 'center' }}>
          <CalendarClock size={36} style={{ color: 'var(--c-text-4)', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: 'var(--c-text-2)', fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Sin tareas programadas</p>
          <p style={{ color: 'var(--c-text-4)', fontSize: 13, lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
            Crea tareas para que tu equipo ejecute reportes, seguimientos o revisiones automáticamente.
          </p>
          {agents.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#6C3BFF', color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
              <Plus size={15} />
              Crear primera tarea
            </button>
          )}
        </div>
      )}

      {/* Active tasks */}
      {!loading && active.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: paused.length > 0 ? 24 : 0 }}>
          {active.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              agents={agents}
              token={token}
              running={running}
              onToggle={handleToggle}
              onDelete={id => setDeleteId(id)}
              onRun={handleRun}
            />
          ))}
        </div>
      )}

      {/* Paused tasks */}
      {!loading && paused.length > 0 && (
        <div>
          <p style={{ color: 'var(--c-text-4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>
            Pausadas
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paused.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                agents={agents}
                token={token}
                running={running}
                onToggle={handleToggle}
                onDelete={id => setDeleteId(id)}
                onRun={handleRun}
              />
            ))}
          </div>
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
