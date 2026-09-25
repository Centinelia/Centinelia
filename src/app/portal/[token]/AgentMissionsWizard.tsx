'use client';

import { useState } from 'react';
import { X, Loader2, Check, Calendar, MessageSquare, Hand, ArrowRight, ArrowLeft } from 'lucide-react';

export interface MissionFormData {
  mission:        string;
  trigger_type:   'cron' | 'phrase' | 'manual';
  trigger_config: Record<string, unknown>;
  parameters:     string;
  deliverable:    string;
  slug:           string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Paso 1: ¿Qué debe lograr? ─────────────────────────────────────────────────

function Step1Mission({
  mission,
  onChange,
}: {
  mission: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: '#1A0A3B' }}>
          ¿Qué debe lograr esta tarea?
        </p>
        <p className="text-xs mb-3" style={{ color: '#6B6480' }}>
          Describe en una oración clara qué resultado esperas. Tu empleado usará esto como su objetivo.
        </p>
        <textarea
          required
          rows={3}
          maxLength={500}
          value={mission}
          onChange={e => onChange(e.target.value)}
          placeholder="Ej. Cobrar a los clientes con facturas vencidas hace más de 30 días."
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={{
            background: '#FAFAFB',
            border:     '1px solid #E8E3F5',
            color:      '#1A0A3B',
            outline:    'none',
            fontFamily: 'inherit',
          }}
        />
        <p className="text-[11px] mt-1 text-right" style={{ color: mission.length > 450 ? '#ef4444' : '#9B8FB5' }}>
          {mission.length}/500
        </p>
      </div>
    </div>
  );
}

// ── Paso 2: ¿Cuándo se dispara? ───────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Cada lunes a las 9:00 AM',       cron: '0 9 * * 1'  },
  { label: 'Todos los días a las 8:00 AM',   cron: '0 8 * * *'  },
  { label: 'El día 1 de cada mes',           cron: '0 9 1 * *'  },
  { label: 'El día 5 de cada mes',           cron: '0 9 5 * *'  },
  { label: 'El día 15 de cada mes',          cron: '0 9 15 * *' },
];

const DELIVERABLE_OPTIONS = [
  { value: 'correo',           label: 'Por correo al responsable' },
  { value: 'portal',           label: 'Resumen en el portal' },
  { value: 'resumen_tacito',   label: 'Resumen tácito (solo registro interno)' },
];

function Step2Trigger({
  triggerType,
  triggerConfig,
  onChangeTriggerType,
  onChangeTriggerConfig,
}: {
  triggerType:        MissionFormData['trigger_type'];
  triggerConfig:      Record<string, unknown>;
  onChangeTriggerType:   (v: MissionFormData['trigger_type']) => void;
  onChangeTriggerConfig: (v: Record<string, unknown>) => void;
}) {
  const [phraseInput, setPhraseInput] = useState('');
  const phrases = (triggerConfig.phrases as string[] | undefined) ?? [];

  function addPhrase() {
    const t = phraseInput.trim();
    if (!t || phrases.includes(t)) return;
    onChangeTriggerConfig({ ...triggerConfig, phrases: [...phrases, t] });
    setPhraseInput('');
  }

  function removePhrase(p: string) {
    onChangeTriggerConfig({ ...triggerConfig, phrases: phrases.filter(x => x !== p) });
  }

  const TYPES: { key: MissionFormData['trigger_type']; label: string; desc: string; icon: typeof Calendar }[] = [
    { key: 'cron',   label: 'Calendario',          desc: 'Se ejecuta automáticamente en una fecha y hora programadas.',  icon: Calendar      },
    { key: 'phrase', label: 'Frase del cliente',   desc: 'Tu empleado ejecuta esta tarea cuando alguien dice algo específico.', icon: MessageSquare },
    { key: 'manual', label: 'Solo manual',         desc: 'Tú decides cuándo ejecutarla desde el portal.',                icon: Hand          },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: '#1A0A3B' }}>
          ¿Cuándo se dispara esta tarea?
        </p>
        <div className="flex flex-col gap-2">
          {TYPES.map(t => {
            const Icon     = t.icon;
            const selected = triggerType === t.key;
            return (
              <label
                key={t.key}
                className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  background: selected ? 'rgba(108,59,255,0.06)' : '#FAFAFB',
                  border:     selected ? '2px solid rgba(108,59,255,0.35)' : '1px solid #E8E3F5',
                }}
              >
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => { onChangeTriggerType(t.key); onChangeTriggerConfig({}); }}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: selected ? '#6C3BFF' : 'transparent',
                    border:     selected ? '2px solid #6C3BFF' : '2px solid #D1D5DB',
                  }}
                >
                  {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon size={13} style={{ color: selected ? '#6C3BFF' : '#9B8FB5' }} />
                    <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{t.label}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>{t.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Configuración específica del tipo */}
      {triggerType === 'cron' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>Frecuencia</p>
          <div className="flex flex-col gap-1.5">
            {CRON_PRESETS.map(p => {
              const active = triggerConfig.cron === p.cron;
              return (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => onChangeTriggerConfig({ ...triggerConfig, cron: p.cron })}
                  className="text-left px-3 py-2 rounded-lg text-xs font-medium transition-all"
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
        </div>
      )}

      {triggerType === 'phrase' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>Frases que activan esta tarea</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={phraseInput}
              onChange={e => setPhraseInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhrase(); } }}
              placeholder='Ej. "cobra a morosos"'
              className="flex-1 px-3 py-2 rounded-lg text-xs"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
            />
            <button
              type="button"
              onClick={addPhrase}
              className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ background: '#6C3BFF', color: '#ffffff' }}
            >
              Agregar
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {phrases.map(p => (
              <span
                key={p}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
              >
                {p}
                <button type="button" onClick={() => removePhrase(p)} className="hover:opacity-60" aria-label="Quitar frase">
                  <X size={10} />
                </button>
              </span>
            ))}
            {phrases.length === 0 && (
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>Agrega al menos una frase para continuar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Paso 3: Reglas específicas ────────────────────────────────────────────────

function Step3Parameters({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: '#1A0A3B' }}>
          Instrucciones especiales <span style={{ color: '#9B8FB5' }}>(opcional)</span>
        </p>
        <p className="text-xs mb-3" style={{ color: '#6B6480' }}>
          Agrega contexto, límites o excepciones que tu empleado debe considerar al ejecutar esta tarea.
        </p>
        <textarea
          rows={4}
          maxLength={2000}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Ej. Solo contactar a clientes con saldo vencido mayor a $5,000 MXN. No incluir clientes con acuerdos especiales."
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={{
            background: '#FAFAFB',
            border:     '1px solid #E8E3F5',
            color:      '#1A0A3B',
            outline:    'none',
            fontFamily: 'inherit',
          }}
        />
        <p className="text-[11px] mt-1 text-right" style={{ color: value.length > 1800 ? '#ef4444' : '#9B8FB5' }}>
          {value.length}/2000
        </p>
      </div>
    </div>
  );
}

// ── Paso 4: Cómo entrega el resultado ─────────────────────────────────────────

function Step4Deliverable({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold mb-3" style={{ color: '#1A0A3B' }}>
          ¿Cómo te entrega el resultado?
        </p>
        <div className="flex flex-col gap-2">
          {DELIVERABLE_OPTIONS.map(opt => {
            const selected = value === opt.value;
            return (
              <label
                key={opt.value}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  background: selected ? 'rgba(108,59,255,0.06)' : '#FAFAFB',
                  border:     selected ? '2px solid rgba(108,59,255,0.35)' : '1px solid #E8E3F5',
                }}
              >
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => onChange(opt.value)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: selected ? '#6C3BFF' : 'transparent',
                    border:     selected ? '2px solid #6C3BFF' : '2px solid #D1D5DB',
                  }}
                >
                  {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────

interface Props {
  agentId:   string;
  agentName: string;
  token:     string;
  onSave:    (data: MissionFormData) => void;
  onCancel:  () => void;
  isSaving?: boolean;
  error?:    string | null;
  /** Tarea existente — pre-popula el wizard para edición */
  editTask?: { mission: string; trigger_type: MissionFormData['trigger_type']; trigger_config: Record<string, unknown> | null; parameters: string | null; deliverable: string | null } | null;
}

export default function AgentMissionsWizard({
  agentName,
  onSave,
  onCancel,
  isSaving,
  error,
  editTask,
}: Props) {
  const [step,     setStep]     = useState(1);
  const [mission,  setMission]  = useState(editTask?.mission        ?? '');
  const [trigType, setTrigType] = useState<MissionFormData['trigger_type']>(editTask?.trigger_type ?? 'cron');
  const [trigConf, setTrigConf] = useState<Record<string, unknown>>(editTask?.trigger_config ?? {});
  const [params,   setParams]   = useState(editTask?.parameters     ?? '');
  const [deliver,  setDeliver]  = useState(editTask?.deliverable    ?? 'correo');

  const STEPS = ['¿Qué lograr?', '¿Cuándo?', 'Instrucciones', '¿Cómo entregar?'];

  function canGoNext(): boolean {
    if (step === 1) return mission.trim().length > 0;
    if (step === 2) {
      if (trigType === 'cron')   return !!(trigConf.cron);
      if (trigType === 'phrase') return ((trigConf.phrases as string[] | undefined) ?? []).length > 0;
      return true; // manual
    }
    return true;
  }

  function handleFinish() {
    onSave({
      mission:        mission.trim(),
      trigger_type:   trigType,
      trigger_config: trigConf,
      parameters:     params.trim(),
      deliverable:    deliver,
      slug:           buildSlug(mission),
    });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ background: 'rgba(15,5,34,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col"
        style={{
          background:  '#ffffff',
          border:      '1px solid #E8E3F5',
          boxShadow:   '0 24px 60px rgba(26,10,59,0.20)',
          maxHeight:   '92vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F0EDF9' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: '#1A0A3B' }}>
              {editTask ? 'Editar tarea' : `Nueva tarea para ${agentName}`}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: '#9B8FB5' }}>
              Paso {step} de {STEPS.length}: {STEPS[step - 1]}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:opacity-60" style={{ color: '#6B6480' }} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-6 pt-3 pb-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: i < step ? '#6C3BFF' : '#E8E3F5' }}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && <Step1Mission mission={mission} onChange={setMission} />}
          {step === 2 && (
            <Step2Trigger
              triggerType={trigType}
              triggerConfig={trigConf}
              onChangeTriggerType={setTrigType}
              onChangeTriggerConfig={setTrigConf}
            />
          )}
          {step === 3 && <Step3Parameters value={params} onChange={setParams} />}
          {step === 4 && <Step4Deliverable value={deliver} onChange={setDeliver} />}

          {error && (
            <div className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
            >
              <ArrowLeft size={14} /> Atrás
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
            >
              Cancelar
            </button>
          )}

          {step < STEPS.length ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: '#6C3BFF', color: '#ffffff', opacity: canGoNext() ? 1 : 0.45 }}
            >
              Siguiente <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isSaving || !canGoNext()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: '#6C3BFF', color: '#ffffff', opacity: isSaving ? 0.5 : 1 }}
            >
              {isSaving
                ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
                : editTask
                  ? <><Check size={14} /> Guardar cambios</>
                  : <><Check size={14} /> Crear tarea</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
