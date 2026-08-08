'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function MultilingualToggle({
  token,
  initial,
}: {
  token: string;
  initial: boolean;
}) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/portal/${token}/org`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multilingual: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next
          ? 'Tus empleados podrán atender también en inglés.'
          : 'Tus empleados atenderán solo en español.'
      );
    } catch {
      setEnabled(!next);
      toast.error('No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{
          background: enabled ? 'rgba(108,59,255,0.04)' : '#FAFAFB',
          border: `1px solid ${enabled ? 'rgba(108,59,255,0.24)' : '#E8E3F5'}`,
          transition: 'background 0.2s, border 0.2s',
        }}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            Atender también en inglés
          </p>
          <p className="text-[11px]" style={{ color: '#6B6480' }}>
            {enabled
              ? 'Tus empleados detectan y responden en español o inglés.'
              : 'Tus empleados atienden solo en español.'}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          aria-label="Atender también en inglés"
          className="rounded-full transition-colors relative flex-shrink-0"
          style={{
            width: 44,
            height: 24,
            background: enabled ? '#6C3BFF' : '#E8E3F5',
            boxShadow: enabled ? '0 1px 2px rgba(108,59,255,0.24)' : 'none',
          }}
        >
          <div
            className="rounded-full bg-white absolute transition-all"
            style={{
              width: 18,
              height: 18,
              top: 3,
              left: enabled ? 23 : 3,
              boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
            }}
          />
          {saving && (
            <Loader2
              size={10}
              className="animate-spin absolute inset-0 m-auto"
              style={{ color: '#fff' }}
            />
          )}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: '#9B8FB5' }}>
        Por default tus empleados atienden solo en español, que es más preciso para transcribir voz en México. Activa esto si también recibes llamadas en inglés.
      </p>
    </div>
  );
}
