'use client';

import { useState, useRef } from 'react';
import { Check, Clock } from 'lucide-react';

interface HeartbeatConfig {
  enabled:     boolean;
  frequency:   'daily' | 'weekly';
  day_of_week: number;
  hour:        number;
  task:        string;
}

interface Props {
  token:      string;
  initConfig: HeartbeatConfig | null;
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

export default function HeartbeatEditor({ token, initConfig }: Props) {
  const base: HeartbeatConfig = {
    enabled:     false,
    frequency:   'daily',
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
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ heartbeat_config: next }),
      });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 500);
  }

  function update(patch: Partial<HeartbeatConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    setSaved(false);
    persist(next);
  }

  const sel: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--c-surface-2)',
    border: '1px solid var(--c-border)',
    borderRadius: '8px',
    color: 'var(--c-text)',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
        Tu empleado ejecuta una tarea de forma autónoma en el horario que configures: revisar llamadas, preparar resúmenes, dar seguimiento a prospectos. Sin que tengas que pedírselo.
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
            style={{ background: config.enabled ? '#6C3BFF' : 'var(--c-border)' }}
          />
          <div
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
            style={{ transform: config.enabled ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          {config.enabled ? 'Check-in automático activado' : 'Check-in automático desactivado'}
        </span>
      </label>

      {config.enabled && (
        <>
          {/* Schedule */}
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--c-text-2)' }}>
            <Clock size={12} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
            <span>Ejecutar</span>
            <select value={config.frequency} onChange={e => update({ frequency: e.target.value as 'daily' | 'weekly' })} style={sel}>
              <option value="daily">todos los días</option>
              <option value="weekly">cada semana</option>
            </select>
            {config.frequency === 'weekly' && (
              <>
                <span>el</span>
                <select value={config.day_of_week} onChange={e => update({ day_of_week: Number(e.target.value) })} style={sel}>
                  {DAYS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
              </>
            )}
            <span>a las</span>
            <select value={config.hour} onChange={e => update({ hour: Number(e.target.value) })} style={sel}>
              {HOURS.map(h => <option key={h.v} value={h.v}>{h.l}</option>)}
            </select>
          </div>

          {/* Task */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>
              Tarea a ejecutar
            </p>
            <textarea
              value={config.task}
              onChange={e => update({ task: e.target.value })}
              rows={4}
              placeholder={DEFAULT_TASK}
              className="w-full rounded-xl text-xs leading-relaxed outline-none resize-y"
              style={{
                padding:    '10px 12px',
                background: 'var(--c-surface-2)',
                border:     '1px solid var(--c-border)',
                color:      'var(--c-text)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
          {config.enabled
            ? 'Consume 3–8 tareas por check-in · el resultado llega por tus canales de notificación'
            : 'Activa para que tu empleado trabaje sin que tengas que pedírselo'}
        </p>
        {saving && <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Guardando…</span>}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
