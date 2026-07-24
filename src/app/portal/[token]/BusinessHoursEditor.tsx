'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';
import type { BusinessHours, DaySchedule } from '@/types/agent';

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: 'monday',    label: 'Lun' },
  { key: 'tuesday',   label: 'Mar' },
  { key: 'wednesday', label: 'Mié' },
  { key: 'thursday',  label: 'Jue' },
  { key: 'friday',    label: 'Vie' },
  { key: 'saturday',  label: 'Sáb' },
  { key: 'sunday',    label: 'Dom' },
];

const DEFAULT_HOURS: BusinessHours = {
  monday:    { open: true,  from: '09:00', to: '18:00' },
  tuesday:   { open: true,  from: '09:00', to: '18:00' },
  wednesday: { open: true,  from: '09:00', to: '18:00' },
  thursday:  { open: true,  from: '09:00', to: '18:00' },
  friday:    { open: true,  from: '09:00', to: '18:00' },
  saturday:  { open: false },
  sunday:    { open: false },
};

function Toggle({ on, onToggle, small }: { on: boolean; onToggle: () => void; small?: boolean }) {
  const w = small ? 'w-7 h-3.5' : 'w-10 h-5';
  const dot = small ? 'w-2.5 h-2.5' : 'w-4 h-4';
  const onLeft = small ? '0.875rem' : '1.25rem';
  return (
    <button type="button" onClick={onToggle}
      className={`${w} rounded-full transition-colors relative flex-shrink-0`}
      style={{ background: on ? '#6C3BFF' : 'var(--c-border-2)' }}>
      <span className={`absolute top-0.5 ${dot} rounded-full bg-white transition-all`}
        style={{ left: on ? onLeft : '0.125rem' }} />
    </button>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => {
        let v = e.target.value.replace(/[^0-9:]/g, '');
        if (v.length === 2 && !v.includes(':')) v += ':';
        if (v.length > 5) v = v.slice(0, 5);
        onChange(v);
      }}
      placeholder="09:00"
      maxLength={5}
      className="w-14 text-center text-xs rounded-lg px-2 py-1.5 outline-none tabular-nums"
      style={{
        background: 'var(--c-input-bg)',
        border: '1px solid var(--c-input-border)',
        color: 'var(--c-text)',
      }}
    />
  );
}

export default function BusinessHoursEditor({
  token,
  initialHours,
}: {
  token: string;
  initialHours: BusinessHours | null;
}) {
  const [enabled, setEnabled] = useState(!!initialHours);
  const [hours, setHours]     = useState<BusinessHours>(initialHours ?? DEFAULT_HOURS);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [dirty, setDirty]     = useState(false);

  useDirtyWarning('business-hours', dirty);

  const toggleDay = (key: keyof BusinessHours) => {
    setHours(h => ({ ...h, [key]: { ...h[key], open: !h[key].open } }));
    setDirty(true);
  };

  const setTime = (key: keyof BusinessHours, field: 'from' | 'to', value: string) => {
    setHours(h => ({ ...h, [key]: { ...h[key], [field]: value } }));
    setDirty(true);
  };

  const save = async (business_hours: BusinessHours | null) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_hours }),
      });
      if (res.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
    } finally { setSaving(false); }
  };

  const handleMasterToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!next) save(null); // switching to 24/7 → save immediately
  };

  const handleSave = () => save(hours);

  return (
    <div className="flex flex-col gap-4">

      {/* Master toggle */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            {enabled ? 'Horario restringido' : 'Sin restricción (24/7)'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {enabled ? 'Tu empleado solo contesta en este horario' : 'Tu empleado siempre contesta'}
          </div>
        </div>
        <Toggle on={enabled} onToggle={handleMasterToggle} />
      </div>

      {/* Day rows */}
      {enabled && (
        <div className="flex flex-col" style={{ borderTop: '1px solid var(--c-border)' }}>
          {DAYS.map(({ key, label }) => {
            const s: DaySchedule = hours[key] ?? { open: false };
            return (
              <div key={key} className="flex items-center gap-3 py-2.5"
                style={{ borderBottom: '1px solid var(--c-border)' }}>
                <Toggle on={s.open} onToggle={() => toggleDay(key)} small />
                <span className="w-7 text-xs font-medium flex-shrink-0"
                  style={{ color: s.open ? 'var(--c-text)' : 'var(--c-text-4)' }}>
                  {label}
                </span>
                {s.open ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <TimeInput value={s.from ?? '09:00'} onChange={v => setTime(key, 'from', v)} />
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>–</span>
                    <TimeInput value={s.to ?? '18:00'} onChange={v => setTime(key, 'to', v)} />
                  </div>
                ) : (
                  <span className="ml-auto text-xs" style={{ color: 'var(--c-text-4)' }}>Cerrado</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
        style={{ background: saved ? '#22c55e' : '#6C3BFF', color: '#fff' }}
      >
        {saving
          ? <><Loader2 size={14} className="animate-spin" />Guardando…</>
          : saved
            ? <><Check size={14} />Guardado</>
            : 'Guardar horario'}
      </button>
    </div>
  );
}
