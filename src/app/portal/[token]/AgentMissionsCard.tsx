'use client';

/**
 * AgentMissionsCard — tarjeta por tarea programada de un empleado.
 *
 * Muestra: texto de la misión, badge de tipo de activación (Calendario /
 * Frase / Solo manual), y botones Ejecutar / Editar / Desactivar.
 */

import { Calendar, MessageSquare, Hand, Play, Pencil, Loader2 } from 'lucide-react';

export interface AgentTask {
  id:             string;
  mission:        string;
  trigger_type:   'cron' | 'phrase' | 'manual';
  trigger_config: Record<string, unknown> | null;
  parameters:     string | null;
  deliverable:    string | null;
  active:         boolean;
  created_at:     string;
  slug:           string | null;
}

interface Props {
  task:           AgentTask;
  onEdit:         (task: AgentTask) => void;
  onDeactivate:   (taskId: string) => void;
  onExecute:      (taskId: string) => void;
  isExecuting?:   boolean;
  isDeactivating?: boolean;
}

const TRIGGER_META: Record<
  AgentTask['trigger_type'],
  { label: string; icon: typeof Calendar; color: string; bg: string }
> = {
  cron:   { label: 'Calendario',       icon: Calendar,      color: '#6C3BFF', bg: 'rgba(108,59,255,0.08)' },
  phrase: { label: 'Frase del cliente', icon: MessageSquare, color: '#0891b2', bg: 'rgba(8,145,178,0.08)'  },
  manual: { label: 'Solo manual',       icon: Hand,          color: '#6B6480', bg: 'rgba(107,100,128,0.08)' },
};

const DELIVERABLE_LABEL: Record<string, string> = {
  correo:         'Correo al responsable',
  portal:         'Resumen en el portal',
  resumen_tacito: 'Registro interno',
};

function triggerSummary(task: AgentTask): string {
  if (task.trigger_type === 'cron') {
    const cronMap: Record<string, string> = {
      '0 9 * * 1':   'Cada lunes a las 9:00 AM',
      '0 8 * * *':   'Todos los días a las 8:00 AM',
      '0 9 1 * *':   'El día 1 de cada mes',
      '0 9 5 * *':   'El día 5 de cada mes',
      '0 9 15 * *':  'El día 15 de cada mes',
    };
    const cron = task.trigger_config?.cron as string | undefined;
    return cron ? (cronMap[cron] ?? 'Calendario personalizado') : 'Calendario';
  }
  if (task.trigger_type === 'phrase') {
    const phrases = task.trigger_config?.phrases as string[] | undefined;
    if (phrases && phrases.length > 0) {
      return `Cuando digan: "${phrases.slice(0, 2).join('", "')}"${phrases.length > 2 ? ` +${phrases.length - 2}` : ''}`;
    }
    return 'Frase del cliente';
  }
  return 'Ejecución manual';
}

export default function AgentMissionsCard({
  task,
  onEdit,
  onDeactivate,
  onExecute,
  isExecuting,
  isDeactivating,
}: Props) {
  const meta       = TRIGGER_META[task.trigger_type];
  const TrigIcon   = meta.icon;
  const summary    = triggerSummary(task);
  const delivLabel = task.deliverable ? (DELIVERABLE_LABEL[task.deliverable] ?? task.deliverable) : null;

  return (
    <div
      data-testid={`mission-card-${task.id}`}
      className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
    >
      {/* Body */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-2">
        {/* Trigger badge */}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}22` }}
          >
            <TrigIcon size={10} />
            {meta.label}
          </span>
          {delivLabel && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: '#F5F3FF', color: '#6B6480', border: '1px solid #E8E3F5' }}
            >
              {delivLabel}
            </span>
          )}
        </div>

        {/* Misión */}
        <p className="text-sm font-semibold leading-snug" style={{ color: '#1A0A3B' }}>
          {task.mission}
        </p>

        {/* Frecuencia / frases */}
        <p className="text-xs" style={{ color: '#9B8FB5' }}>
          {summary}
        </p>

        {/* Instrucciones especiales (colapsadas) */}
        {task.parameters?.trim() && (
          <details className="mt-0.5">
            <summary
              className="text-[11px] cursor-pointer select-none"
              style={{ color: '#9B8FB5', WebkitAppearance: 'none' } as React.CSSProperties}
            >
              Ver instrucciones especiales
            </summary>
            <p
              className="text-[11px] leading-relaxed mt-1.5 px-2 py-1.5 rounded-lg"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #F0EDF9' }}
            >
              {task.parameters}
            </p>
          </details>
        )}
      </div>

      {/* Footer acciones */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
      >
        {/* Ejecutar ahora (solo tareas manuales o como forzar) */}
        {task.trigger_type === 'manual' && (
          <button
            type="button"
            onClick={() => onExecute(task.id)}
            disabled={isExecuting}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              background: '#6C3BFF',
              color:      '#ffffff',
              opacity:    isExecuting ? 0.5 : 1,
            }}
          >
            {isExecuting
              ? <Loader2 size={11} className="animate-spin" />
              : <Play size={11} />
            }
            Ejecutar
          </button>
        )}

        {/* Editar */}
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}
        >
          <Pencil size={11} />
          Editar
        </button>

        {/* Desactivar */}
        <button
          type="button"
          onClick={() => onDeactivate(task.id)}
          disabled={isDeactivating}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{
            background: 'transparent',
            color:      '#9B8FB5',
            opacity:    isDeactivating ? 0.5 : 1,
          }}
        >
          {isDeactivating ? <Loader2 size={11} className="animate-spin" /> : null}
          Desactivar
        </button>
      </div>
    </div>
  );
}
