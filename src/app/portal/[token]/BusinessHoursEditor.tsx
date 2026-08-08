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
  const size = small
    ? { w: 32, h: 18, dot: 14, onLeft: 15 }
    : { w: 44, h: 24, dot: 18, onLeft: 23 };
  return (
    <button type="button" onClick={onToggle}
      className="rounded-full transition-colors relative flex-shrink-0"
      style={{
        width:      size.w,
        height:     size.h,
        background: on ? '#6C3BFF' : '#E8E3F5',
        boxShadow:  on ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
      }}>
      <span className="absolute rounded-full bg-white transition-all"
        style={{
          width:  size.dot,
          height: size.dot,
          top:    (size.h - size.dot) / 2,
          left:   on ? size.onLeft : (size.h - size.dot) / 2,
          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        }} />
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
      className="w-16 text-center text-[13px] font-medium rounded-lg px-2 py-1.5 outline-none tabular-nums"
      style={{
        background: '#ffffff',
        border: '1px solid #E8E3F5',
        color: '#1A0A3B',
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
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{
          background: enabled ? 'rgba(108,59,255,0.04)' : '#FAFAFB',
          border: `1px solid ${enabled ? 'rgba(108,59,255,0.24)' : '#E8E3F5'}`,
        }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            {enabled ? 'Horario restringido' : 'Sin restricción (24/7)'}
          </div>
          <div className="text-[11px]" style={{ color: '#6B6480' }}>
            {enabled ? 'Tu empleado solo contesta en este horario.' : 'Tu empleado siempre contesta.'}
          </div>
        </div>
        <Toggle on={enabled} onToggle={handleMasterToggle} />
      </div>

      {/* Day rows */}
      {enabled && (
        <div
          className="flex flex-col rounded-xl overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
        >
          {DAYS.map(({ key, label }, idx) => {
            const s: DaySchedule = hours[key] ?? { open: false };
            return (
              <div
                key={key}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderTop: idx === 0 ? 'none' : '1px solid #F0EDF9' }}
              >
                <Toggle on={s.open} onToggle={() => toggleDay(key)} small />
                <span
                  className="w-8 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
                  style={{ color: s.open ? '#1A0A3B' : '#9B8FB5' }}
                >
                  {label}
                </span>
                {s.open ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <TimeInput value={s.from ?? '09:00'} onChange={v => setTime(key, 'from', v)} />
                    <span className="text-[12px]" style={{ color: '#9B8FB5' }}>a</span>
                    <TimeInput value={s.to ?? '18:00'} onChange={v => setTime(key, 'to', v)} />
                  </div>
                ) : (
                  <span className="ml-auto text-[12px]" style={{ color: '#9B8FB5' }}>Cerrado</span>
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
        className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          background: saved ? '#22c55e' : '#6C3BFF',
          color: '#fff',
          boxShadow: saved ? 'none' : '0 1px 2px rgba(108,59,255,0.24)',
        }}
      >
        {saving
          ? <><Loader2 size={14} className="animate-spin" />Guardando</>
          : saved
            ? <><Check size={14} />Guardado</>
            : 'Guardar horario'}
      </button>
    </div>
  );
}
