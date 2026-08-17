'use client';

import { useEffect, useState } from 'react';
import type { Industry } from '@/lib/industry';
import { getIndustryLabel } from '@/lib/industry';

type Props = { token: string };

type DailyState = {
  unavailable: string[];
  limited:     string[];
  special:     string | null;
  notes:       string | null;
  updated_at?: string;
};

export default function DailyAvailabilityCard({ token }: Props) {
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [state, setState]       = useState<DailyState>({ unavailable: [], limited: [], special: null, notes: null });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/daily-availability`)
      .then(r => r.json())
      .then(r => {
        if (r.industry) setIndustry(r.industry as Industry);
        if (r.data) {
          setState({
            unavailable: r.data.unavailable ?? [],
            limited:     r.data.limited     ?? [],
            special:     r.data.special     ?? null,
            notes:       r.data.notes       ?? null,
            updated_at:  r.data.updated_at,
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [token]);

  // Self-hide: not loaded yet, or industry is not in whitelist
  if (!loaded || !industry) return null;

  const title = getIndustryLabel(industry, 'daily_availability_title');
  const word  = getIndustryLabel(industry, 'daily_availability_item_word');

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const r = await fetch(`/api/portal/${token}/daily-availability`, {
        method:  'PUT',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          unavailable: state.unavailable,
          limited:     state.limited,
          special:     state.special,
          notes:       state.notes,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        setState(s => ({ ...s, updated_at: data.data.updated_at }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(data.error ?? 'Error al guardar');
      }
    } catch {
      setSaveError('Error de conexion. Verifica tu internet.');
    } finally {
      setSaving(false);
    }
  };

  const listInput = (label: string, key: 'unavailable' | 'limited') => (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>{label}</span>
      <textarea
        value={state[key].join(', ')}
        onChange={e =>
          setState(s => ({
            ...s,
            [key]: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
          }))
        }
        rows={2}
        placeholder={`Un ${word} por coma`}
        className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed outline-none resize-none transition-all focus:border-[rgba(108,59,255,0.4)]"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
      />
    </label>
  );

  return (
    <div
      id="disponibilidad-diaria"
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>{title}</h2>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Actualiza lo que está disponible hoy para que tus empleados lo comuniquen correctamente.
          </p>
        </div>
        {state.updated_at && (
          <span
            className="text-[11px] self-start px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: '#FAFAFB', color: '#9B8FB5', border: '1px solid #E8E3F5' }}
          >
            Actualizado: {new Date(state.updated_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Form body */}
      <div
        className="px-5 py-4 flex flex-col gap-4"
        style={{ borderTop: '1px solid #F0EDF9' }}
      >
        {listInput('No disponibles hoy', 'unavailable')}
        {listInput('Con existencia limitada', 'limited')}

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>Especial del día</span>
          <input
            type="text"
            value={state.special ?? ''}
            onChange={e => setState(s => ({ ...s, special: e.target.value || null }))}
            placeholder={`Ej: ${word.charAt(0).toUpperCase() + word.slice(1)} especial de hoy`}
            className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all focus:border-[rgba(108,59,255,0.4)]"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>Notas adicionales</span>
          <textarea
            value={state.notes ?? ''}
            onChange={e => setState(s => ({ ...s, notes: e.target.value || null }))}
            rows={2}
            placeholder="Ej: Cierre anticipado a las 6 pm"
            className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed outline-none resize-none transition-all focus:border-[rgba(108,59,255,0.4)]"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </label>

        {saveError && (
          <p className="text-[12px]" style={{ color: '#EF4444' }}>{saveError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#ffffff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
          >
            {saving ? 'Guardando...' : 'Guardar disponibilidad de hoy'}
          </button>
          {saved && (
            <span className="text-[12px] font-medium" style={{ color: '#22c55e' }}>
              Guardado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
