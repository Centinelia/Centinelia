'use client';

/**
 * OnboardingWizardClient — wizard de 4 pantallas para configurar el negocio
 * la primera vez que el cliente activa un meerkat client-facing.
 *
 * Pantallas:
 *   1. Bienvenida
 *   2. Reglas base (3-5 reglas cortas del negocio)
 *   3. Tareas base (1-2 tareas MAPS)
 *   4. Resumen y confirmar
 *
 * Al completar, PATCH /api/portal/[token]/org con { wizard_completed_at }
 * para marcar que no vuelva a mostrarse.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ArrowLeft, Check, Plus, X, Loader2,
  BookOpen, ListTodo, Sparkles, ChevronRight,
} from 'lucide-react';
import type { MissionFormData } from '../AgentMissionsWizard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RuleDraft {
  id:         string;
  regla:      string;
  detalles:   string;
  applies_to: string[];      // [] = todos
}

interface TaskDraft {
  mission:        string;
  trigger_type:   MissionFormData['trigger_type'];
  trigger_config: Record<string, unknown>;
  parameters:     string;
  deliverable:    string;
}

interface Props {
  token:      string;
  portalEmail: string;
  agentId:    string;
  agentName:  string;
  agents:     { id: string; name: string; meerkatRoleId: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const CRON_PRESETS = [
  { label: 'Cada lunes a las 9:00 AM',     cron: '0 9 * * 1'  },
  { label: 'Todos los días a las 8:00 AM', cron: '0 8 * * *'  },
  { label: 'El día 1 de cada mes',         cron: '0 9 1 * *'  },
  { label: 'El día 5 de cada mes',         cron: '0 9 5 * *'  },
  { label: 'El día 15 de cada mes',        cron: '0 9 15 * *' },
];

const DELIVERABLE_OPTIONS = [
  { value: 'correo',         label: 'Por correo al responsable' },
  { value: 'portal',         label: 'Resumen en el portal' },
  { value: 'resumen_tacito', label: 'Registro interno' },
];

const EXAMPLE_RULES = [
  'Nunca ofrecer descuentos sin autorización del responsable.',
  'Siempre confirmar la cita 24 horas antes por correo.',
  'No compartir precios sin antes escuchar la necesidad del cliente.',
];

const EXAMPLE_TASKS = [
  'Enviar resumen semanal de cotizaciones pendientes al responsable.',
  'Recordar a clientes con facturas vencidas hace más de 15 días.',
];

// ── Pantalla 1: Bienvenida ────────────────────────────────────────────────────

function Step1Welcome({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.2)' }}
      >
        <Sparkles size={28} style={{ color: '#6C3BFF' }} />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight mb-3" style={{ color: '#1A0A3B' }}>
          Vamos a enseñarle a {agentName} cómo opera tu negocio
        </h2>
        <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: '#6B6480' }}>
          Toma de 5 a 8 minutos y hace que trabaje con tu criterio, no con el de nadie más.
          Podrás editar todo esto después cuando quieras.
        </p>
      </div>
      <div className="w-full flex flex-col gap-3">
        {[
          { icon: BookOpen,  title: 'Reglas del negocio',     desc: 'Cómo opera tu negocio siempre.' },
          { icon: ListTodo,  title: 'Tareas programadas',     desc: 'Qué debe hacer solo, cuándo y cómo entregar.' },
          { icon: Check,     title: 'Revisión y guardado',    desc: 'Confirma todo antes de activar.' },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: '#FAFAFB', border: '1px solid #F0EDF9' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.08)' }}
              >
                <Icon size={16} style={{ color: '#6C3BFF' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{item.title}</p>
                <p className="text-xs" style={{ color: '#9B8FB5' }}>{item.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pantalla 2: Reglas base ───────────────────────────────────────────────────

function Step2Rules({
  rules,
  onAdd,
  onUpdate,
  onRemove,
  agents,
}: {
  rules:    RuleDraft[];
  onAdd:    () => void;
  onUpdate: (id: string, field: keyof RuleDraft, value: unknown) => void;
  onRemove: (id: string) => void;
  agents:   { id: string; name: string; meerkatRoleId: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold mb-1" style={{ color: '#1A0A3B' }}>
          Reglas del negocio
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
          Escribe cómo opera tu negocio siempre. Estos principios guiarán a tus empleados en cada
          conversación. No necesitas ser exhaustivo ahora, puedes agregar más después.
        </p>
      </div>

      {/* Ejemplos como inspiración */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Ejemplos de reglas
        </p>
        {EXAMPLE_RULES.map((ex, i) => (
          <p key={i} className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #F0EDF9' }}>
            {ex}
          </p>
        ))}
      </div>

      {/* Reglas del usuario */}
      <div className="flex flex-col gap-3">
        {rules.map(rule => (
          <div
            key={rule.id}
            className="flex flex-col gap-2 p-3 rounded-xl"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <textarea
                  required
                  rows={2}
                  maxLength={500}
                  value={rule.regla}
                  onChange={e => onUpdate(rule.id, 'regla', e.target.value)}
                  placeholder="Ej. Nunca ofrecer descuentos sin autorización."
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none', fontFamily: 'inherit' }}
                />
                <p className="text-[10px] text-right mt-0.5" style={{ color: rule.regla.length > 450 ? '#ef4444' : '#9B8FB5' }}>
                  {rule.regla.length}/500
                </p>
              </div>
              {rules.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(rule.id)}
                  className="mt-2 p-1 rounded-lg hover:opacity-60"
                  style={{ color: '#9B8FB5' }}
                  aria-label="Quitar regla"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Alcance */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.applies_to.length === 0}
                  onChange={e => onUpdate(rule.id, 'applies_to', e.target.checked ? [] : [agents[0]?.meerkatRoleId ?? ''])}
                  className="w-3.5 h-3.5 rounded accent-purple-600"
                />
                <span className="text-xs" style={{ color: '#6B6480' }}>Aplica a todos</span>
              </label>
            </div>

            {rule.applies_to.length > 0 && agents.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {agents.map(a => {
                  const selected = rule.applies_to.includes(a.meerkatRoleId);
                  return (
                    <button
                      key={a.meerkatRoleId}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? rule.applies_to.filter(x => x !== a.meerkatRoleId)
                          : [...rule.applies_to, a.meerkatRoleId];
                        onUpdate(rule.id, 'applies_to', next);
                      }}
                      className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
                      style={{
                        background: selected ? '#6C3BFF' : '#FAFAFB',
                        color:      selected ? '#ffffff' : '#6B6480',
                        border:     selected ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                      }}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {rules.length < 5 && (
        <button
          type="button"
          onClick={onAdd}
          className="self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <Plus size={13} />
          Agregar otra regla
        </button>
      )}
    </div>
  );
}

// ── Pantalla 3: Tareas base ───────────────────────────────────────────────────

function Step3Tasks({
  tasks,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
}: {
  tasks:        TaskDraft[];
  onAddTask:    () => void;
  onUpdateTask: (i: number, t: TaskDraft) => void;
  onRemoveTask: (i: number) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(tasks.length > 0 ? 0 : null);
  const [phraseInputs, setPhraseInputs] = useState<Record<number, string>>({});

  function updateField<K extends keyof TaskDraft>(i: number, field: K, value: TaskDraft[K]) {
    onUpdateTask(i, { ...tasks[i], [field]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold mb-1" style={{ color: '#1A0A3B' }}>
          Tareas programadas
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
          Una tarea es algo que quieres que tu empleado haga de forma autónoma: cobrar morosos,
          enviar resúmenes semanales, etc. Empieza con una o dos; podrás agregar más después.
        </p>
      </div>

      {/* Ejemplos */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Ejemplos de tareas
        </p>
        {EXAMPLE_TASKS.map((ex, i) => (
          <p key={i} className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #F0EDF9' }}>
            {ex}
          </p>
        ))}
      </div>

      {tasks.map((task, i) => {
        const isOpen = expandedIdx === i;
        const phrases = (task.trigger_config.phrases as string[] | undefined) ?? [];

        return (
          <div
            key={i}
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid #E8E3F5' }}
          >
            {/* Tarea header (acordeón) */}
            <button
              type="button"
              onClick={() => setExpandedIdx(isOpen ? null : i)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ background: isOpen ? 'rgba(108,59,255,0.04)' : '#ffffff' }}
            >
              <span className="flex-1 text-sm font-semibold truncate" style={{ color: '#1A0A3B' }}>
                {task.mission.trim() || `Tarea ${i + 1}`}
              </span>
              <ChevronRight
                size={14}
                className="flex-shrink-0 transition-transform"
                style={{ color: '#9B8FB5', transform: isOpen ? 'rotate(90deg)' : 'none' }}
              />
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onRemoveTask(i); }}
                  className="p-1 rounded hover:opacity-60"
                  style={{ color: '#9B8FB5' }}
                  aria-label="Quitar tarea"
                >
                  <X size={13} />
                </button>
              )}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid #F0EDF9' }}>

                {/* Sub-paso 1: Misión */}
                <div className="pt-3">
                  <p className="text-xs font-semibold mb-1.5" style={{ color: '#1A0A3B' }}>
                    ¿Qué debe lograr esta tarea?
                  </p>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={task.mission}
                    onChange={e => updateField(i, 'mission', e.target.value)}
                    placeholder="Ej. Cobrar a los clientes con facturas vencidas hace más de 30 días."
                    className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                    style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <p className="text-[10px] text-right mt-0.5" style={{ color: task.mission.length > 450 ? '#ef4444' : '#9B8FB5' }}>
                    {task.mission.length}/500
                  </p>
                </div>

                {/* Sub-paso 2: Trigger */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#1A0A3B' }}>
                    ¿Cuándo se ejecuta?
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { key: 'cron',   label: 'Calendario' },
                      { key: 'phrase', label: 'Frase del cliente' },
                      { key: 'manual', label: 'Solo manual' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => updateField(i, 'trigger_type', opt.key)}
                        className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                        style={{
                          background: task.trigger_type === opt.key ? '#6C3BFF' : '#FAFAFB',
                          color:      task.trigger_type === opt.key ? '#ffffff' : '#6B6480',
                          border:     task.trigger_type === opt.key ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {task.trigger_type === 'cron' && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      {CRON_PRESETS.map(p => {
                        const active = task.trigger_config.cron === p.cron;
                        return (
                          <button
                            key={p.cron}
                            type="button"
                            onClick={() => updateField(i, 'trigger_config', { ...task.trigger_config, cron: p.cron })}
                            className="text-left px-3 py-2 rounded-lg text-xs font-medium"
                            style={{
                              background: active ? '#6C3BFF' : '#ffffff',
                              color:      active ? '#ffffff' : '#6B6480',
                              border:     active ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                            }}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {task.trigger_type === 'phrase' && (
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={phraseInputs[i] ?? ''}
                          onChange={e => setPhraseInputs(prev => ({ ...prev, [i]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const t = (phraseInputs[i] ?? '').trim();
                            if (!t || phrases.includes(t)) return;
                            updateField(i, 'trigger_config', { ...task.trigger_config, phrases: [...phrases, t] });
                            setPhraseInputs(prev => ({ ...prev, [i]: '' }));
                          }}
                          placeholder='Ej. "cobra a morosos"'
                          className="flex-1 px-3 py-2 rounded-lg text-xs"
                          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const t = (phraseInputs[i] ?? '').trim();
                            if (!t || phrases.includes(t)) return;
                            updateField(i, 'trigger_config', { ...task.trigger_config, phrases: [...phrases, t] });
                            setPhraseInputs(prev => ({ ...prev, [i]: '' }));
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-semibold"
                          style={{ background: '#6C3BFF', color: '#ffffff' }}
                        >
                          Agregar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {phrases.map(ph => (
                          <span
                            key={ph}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
                          >
                            {ph}
                            <button
                              type="button"
                              onClick={() => updateField(i, 'trigger_config', { ...task.trigger_config, phrases: phrases.filter(x => x !== ph) })}
                              className="hover:opacity-60"
                              aria-label="Quitar frase"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-paso 3: Reglas específicas (parámetros opcionales) */}
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: '#1A0A3B' }}>
                    Reglas específicas de esta tarea
                    <span className="ml-1.5 text-[10px] font-normal" style={{ color: '#9B8FB5' }}>Opcional</span>
                  </p>
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={task.parameters}
                    onChange={e => updateField(i, 'parameters', e.target.value)}
                    placeholder="Ejemplo: 'Solo cobra a clientes con mora mayor a 30 días. Nunca menciones penalizaciones en el primer contacto.'"
                    className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                    style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <p className="text-[10px] text-right mt-0.5" style={{ color: task.parameters.length > 3800 ? '#ef4444' : '#9B8FB5' }}>
                    {task.parameters.length}/4000
                  </p>
                </div>

                {/* Sub-paso 4: Entregable */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#1A0A3B' }}>
                    ¿Cómo te entrega el resultado?
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {DELIVERABLE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateField(i, 'deliverable', opt.value)}
                        className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                        style={{
                          background: task.deliverable === opt.value ? '#6C3BFF' : '#FAFAFB',
                          color:      task.deliverable === opt.value ? '#ffffff' : '#6B6480',
                          border:     task.deliverable === opt.value ? '1px solid #6C3BFF' : '1px solid #E8E3F5',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {tasks.length < 2 && (
        <button
          type="button"
          onClick={onAddTask}
          className="self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <Plus size={13} />
          Agregar otra tarea
        </button>
      )}
    </div>
  );
}

// ── Pantalla 4: Resumen ────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<string, string> = {
  cron:   'Calendario',
  phrase: 'Frase del cliente',
  manual: 'Solo manual',
};
const DELIVER_LABEL: Record<string, string> = {
  correo:         'Correo al responsable',
  portal:         'Resumen en el portal',
  resumen_tacito: 'Registro interno',
};
const CRON_LABEL: Record<string, string> = Object.fromEntries(
  CRON_PRESETS.map(p => [p.cron, p.label]),
);

function Step4Review({
  rules,
  tasks,
  agents,
}: {
  rules:  RuleDraft[];
  tasks:  TaskDraft[];
  agents: { id: string; name: string; meerkatRoleId: string }[];
}) {
  const agentMap = Object.fromEntries(agents.map(a => [a.meerkatRoleId, a.name]));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold mb-1" style={{ color: '#1A0A3B' }}>
          Resumen de configuración
        </h2>
        <p className="text-xs" style={{ color: '#6B6480' }}>
          Revisa lo que se va a guardar. Podrás editar todo esto después desde el portal.
        </p>
      </div>

      {/* Reglas */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
          Reglas del negocio ({rules.filter(r => r.regla.trim()).length})
        </p>
        {rules.filter(r => r.regla.trim()).length === 0 && (
          <p className="text-xs" style={{ color: '#9B8FB5' }}>No agregaste reglas.</p>
        )}
        {rules.filter(r => r.regla.trim()).map((rule, i) => (
          <div key={rule.id} className="mb-2 p-3 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #F0EDF9' }}>
            <p className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{rule.regla}</p>
            {rule.detalles.trim() && (
              <p className="text-xs mt-1" style={{ color: '#6B6480' }}>{rule.detalles}</p>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: '#9B8FB5' }}>
              {rule.applies_to.length === 0
                ? 'Aplica a todos los empleados'
                : `Aplica a: ${rule.applies_to.map(id => agentMap[id] ?? id).join(', ')}`}
            </p>
          </div>
        ))}
      </div>

      {/* Tareas */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
          Tareas programadas ({tasks.filter(t => t.mission.trim()).length})
        </p>
        {tasks.filter(t => t.mission.trim()).length === 0 && (
          <p className="text-xs" style={{ color: '#9B8FB5' }}>No agregaste tareas.</p>
        )}
        {tasks.filter(t => t.mission.trim()).map((task, i) => (
          <div key={i} className="mb-2 p-3 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #F0EDF9' }}>
            <p className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{task.mission}</p>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                {TRIGGER_LABEL[task.trigger_type] ?? task.trigger_type}
              </span>
              {task.trigger_type === 'cron' && (task.trigger_config.cron as string | undefined) && (
                <span className="text-[10px]" style={{ color: '#9B8FB5' }}>
                  {CRON_LABEL[task.trigger_config.cron as string] ?? (task.trigger_config.cron as string)}
                </span>
              )}
              {task.trigger_type === 'phrase' && (
                <span className="text-[10px]" style={{ color: '#9B8FB5' }}>
                  {((task.trigger_config.phrases as string[] | undefined) ?? []).join(', ')}
                </span>
              )}
              <span className="text-[10px]" style={{ color: '#9B8FB5' }}>
                {DELIVER_LABEL[task.deliverable] ?? task.deliverable}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────

function buildSlug(mission: string): string {
  return mission
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

export default function OnboardingWizardClient({ token, agentId, agentName, agents }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [rules, setRules] = useState<RuleDraft[]>([
    { id: uid(), regla: '', detalles: '', applies_to: [] },
  ]);

  const [tasks, setTasks] = useState<TaskDraft[]>([
    { mission: '', trigger_type: 'cron', trigger_config: {}, parameters: '', deliverable: 'correo' },
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const STEPS = ['Bienvenida', 'Reglas base', 'Tareas base', 'Resumen'];

  // ── Rule handlers ───────────────────────────────────────────────────────────

  function addRule() {
    setRules(prev => [...prev, { id: uid(), regla: '', detalles: '', applies_to: [] }]);
  }

  function updateRule(id: string, field: keyof RuleDraft, value: unknown) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  // ── Task handlers ────────────────────────────────────────────────────────────

  function addTask() {
    setTasks(prev => [...prev, { mission: '', trigger_type: 'cron', trigger_config: {}, parameters: '', deliverable: 'correo' }]);
  }

  function updateTask(i: number, t: TaskDraft) {
    setTasks(prev => prev.map((x, idx) => idx === i ? t : x));
  }

  function removeTask(i: number) {
    setTasks(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Guardar y completar ──────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);

    try {
      const validRules = rules.filter(r => r.regla.trim());
      const validTasks = tasks.filter(t => t.mission.trim());

      // 1. Crear reglas
      for (const rule of validRules) {
        const res = await fetch(`/api/portal/${token}/agent-rules`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            regla:      rule.regla.trim(),
            detalles:   rule.detalles.trim() || null,
            applies_to: rule.applies_to,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Error al crear regla: ${rule.regla}`);
      }

      // 2. Crear tareas
      for (const task of validTasks) {
        const res = await fetch(`/api/portal/${token}/agent-missions`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            ownerAgentId:  agentId,
            mission:       task.mission.trim(),
            trigger_type:  task.trigger_type,
            trigger_config: task.trigger_config,
            parameters:    task.parameters.trim() || null,
            deliverable:   task.deliverable,
            slug:          buildSlug(task.mission),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Error al crear tarea: ${task.mission}`);
      }

      // 3. Marcar wizard completado
      await fetch(`/api/portal/${token}/org`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wizard_completed_at: new Date().toISOString() }),
      });

      // 4. Redirigir al portal
      router.push(`/portal/${token}?tab=organizacion#reglas-del-negocio`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Ocurrió un error. Intenta de nuevo.');
      setIsSaving(false);
    }
  }

  async function handleSkip() {
    try {
      await fetch(`/api/portal/${token}/org`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wizard_completed_at: new Date().toISOString() }),
      });
    } catch { /* Ignorar — el wizard igual se omite */ }
    router.push(`/portal/${token}`);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ background: '#FAFAFB' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 24px 60px rgba(26,10,59,0.12)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid #F0EDF9' }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
            CONFIGURACIÓN INICIAL
          </p>
          <div className="flex gap-1 mb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ background: i < step ? '#6C3BFF' : '#E8E3F5' }}
              />
            ))}
          </div>
          <p className="text-xs" style={{ color: '#9B8FB5' }}>
            Paso {step} de {STEPS.length}: {STEPS[step - 1]}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxHeight: '70vh' }}>
          {step === 1 && <Step1Welcome agentName={agentName} />}
          {step === 2 && (
            <Step2Rules
              rules={rules}
              onAdd={addRule}
              onUpdate={updateRule}
              onRemove={removeRule}
              agents={agents}
            />
          )}
          {step === 3 && (
            <Step3Tasks
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onRemoveTask={removeTask}
            />
          )}
          {step === 4 && (
            <Step4Review
              rules={rules}
              tasks={tasks}
              agents={agents}
            />
          )}

          {saveError && (
            <div className="mt-4 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4"
          style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
        >
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}
              >
                <ArrowLeft size={14} /> Atrás
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkip}
                className="text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-70"
                style={{ color: '#9B8FB5' }}
              >
                Saltar por ahora
              </button>
            )}
          </div>

          {step < STEPS.length ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#6C3BFF', color: '#ffffff' }}
            >
              Siguiente <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: '#6C3BFF', color: '#ffffff', opacity: isSaving ? 0.5 : 1 }}
            >
              {isSaving
                ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                : <><Check size={14} /> Guardar y continuar</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Nota "Saltar" al final */}
      {step > 1 && (
        <button
          type="button"
          onClick={handleSkip}
          className="mt-4 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: '#9B8FB5' }}
        >
          Saltar por ahora — Sin esto tu empleado va a operar sin contexto de tu negocio.
        </button>
      )}
    </div>
  );
}
