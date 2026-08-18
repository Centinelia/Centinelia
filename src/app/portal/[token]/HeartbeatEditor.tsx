'use client';

import { useState, useRef } from 'react';
import { Check, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface HeartbeatConfig {
  enabled:     boolean;
  frequency:   'daily' | 'weekly';
  day_of_week: number;
  hour:        number;
  task:        string;
}

interface Props {
  token:          string;
  agentId?:       string;
  initConfig:     HeartbeatConfig | null;
  isCoordinator?: boolean;
}

const HOURS = [
  { v: 6, l: '6:00 AM' }, { v: 7, l: '7:00 AM' }, { v: 8, l: '8:00 AM' },
  { v: 9, l: '9:00 AM' }, { v: 10, l: '10:00 AM' }, { v: 11, l: '11:00 AM' },
  { v: 12, l: '12:00 PM' }, { v: 13, l: '1:00 PM' }, { v: 14, l: '2:00 PM' },
  { v: 15, l: '3:00 PM' }, { v: 16, l: '4:00 PM' }, { v: 17, l: '5:00 PM' },
  { v: 18, l: '6:00 PM' }, { v: 19, l: '7:00 PM' }, { v: 20, l: '8:00 PM' },
];

const DAYS = [
  { v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' }, { v: 3, l: 'Miércoles' },
  { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' }, { v: 0, l: 'Domingo' },
];

const DEFAULT_TASK = 'Revisa las llamadas del día y envíame un resumen con los puntos más importantes: leads capturados, solicitudes pendientes y cualquier situación que requiera mi atención.';
const DEFAULT_TASK_COORDINATOR = 'Revisa la actividad operativa del día: tareas completadas, pendientes sin resolver y cualquier situación que requiera decisión. Envíame un resumen ejecutivo con lo más relevante.';

export default function HeartbeatEditor({ token, agentId, initConfig, isCoordinator = false }: Props) {
  const base: HeartbeatConfig = {
    enabled:     false,
    frequency:   isCoordinator ? 'weekly' : 'daily',
    day_of_week: 1,
    hour:        18,
    task:        '',
    ...initConfig,
  };

  const [config, setConfig] = useState<HeartbeatConfig>(base);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(next: HeartbeatConfig) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/portal/${token}/settings`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...(agentId ? { agentId } : {}), heartbeat_config: next }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } finally {
        setSaving(false);
      }
    }, 500);
  }

  function update(patch: Partial<HeartbeatConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    setSaved(false);
    persist(next);
  }

  const triggerCls = 'w-auto py-1.5 px-2.5 text-xs bg-[color:#FAFAFB] border-[color:#E8E3F5]';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
        {isCoordinator
          ? 'El director ejecuta una revisión operativa en el horario que configures: estado de tareas, pendientes del equipo, situaciones que requieren decisión. El reporte queda disponible en la Oficina sin que tengas que pedírselo.'
          : 'Tu empleado ejecuta una tarea de forma autónoma en el horario que configures: revisar llamadas, preparar resúmenes, dar seguimiento a prospectos. Sin que tengas que pedírselo.'}
      </p>

      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer w-fit">
        <div className="relative flex-shrink-0">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            className="sr-only"
          />
          <div
            className="w-9 h-5 rounded-full transition-colors"
            style={{ background: config.enabled ? '#6C3BFF' : '#E8E3F5' }}
          />
          <div
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
            style={{ transform: config.enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </div>
        <span className="text-xs font-medium" style={{ color: '#1A0A3B' }}>
          {config.enabled ? 'Check-in automático activado' : 'Check-in automático desactivado'}
        </span>
      </label>

      {config.enabled && (
        <>
          {/* Schedule */}
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: '#1A0A3B' }}>
            <Clock size={12} style={{ color: '#9B8FB5', flexShrink: 0 }} />
            <span>Ejecutar</span>
            <Select value={config.frequency} onValueChange={v => update({ frequency: v as 'daily' | 'weekly' })}>
              <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">todos los días</SelectItem>
                <SelectItem value="weekly">cada semana</SelectItem>
              </SelectContent>
            </Select>
            {config.frequency === 'weekly' && (
              <>
                <span>el</span>
                <Select value={String(config.day_of_week)} onValueChange={v => update({ day_of_week: Number(v) })}>
                  <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map(d => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            <span>a las</span>
            <Select value={String(config.hour)} onValueChange={v => update({ hour: Number(v) })}>
              <SelectTrigger className={triggerCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map(h => <SelectItem key={h.v} value={String(h.v)}>{h.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Task */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium" style={{ color: '#6B6480' }}>
              Tarea a ejecutar
            </p>
            <textarea
              value={config.task}
              onChange={e => update({ task: e.target.value })}
              rows={4}
              placeholder={isCoordinator ? DEFAULT_TASK_COORDINATOR : DEFAULT_TASK}
              className="w-full rounded-xl text-xs leading-relaxed outline-none resize-y"
              style={{
                padding:    '10px 12px',
                background: '#FAFAFB',
                border:     '1px solid #E8E3F5',
                color:      '#1A0A3B',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px]" style={{ color: '#9B8FB5' }}>
          {config.enabled
            ? isCoordinator
              ? 'Consume 3-8 tareas por check-in · el resultado llega por correo al owner'
              : 'Consume 3-8 tareas por check-in · el resultado llega por tus canales de notificación'
            : 'Activa para que tu empleado trabaje sin que tengas que pedírselo'}
        </p>
        {saving && <span className="text-[11px]" style={{ color: '#6B6480' }}>Guardando…</span>}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
