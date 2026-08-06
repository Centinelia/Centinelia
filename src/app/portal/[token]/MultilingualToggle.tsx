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
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--c-text-4)' }}
        >
          Atender también en inglés
        </p>
        <button
          onClick={toggle}
          disabled={saving}
          className="w-10 h-6 rounded-full transition-colors relative"
          style={{ background: enabled ? '#6C3BFF' : 'var(--c-border)' }}
        >
          <div
            className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
            style={{ left: enabled ? '20px' : '4px' }}
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
      <p
        className="text-xs"
        style={{ color: 'var(--c-text-3)', lineHeight: 1.5 }}
      >
        Por default tus empleados atienden solo en español, que es más preciso para transcribir voz en México. Activa esto si también recibes llamadas en inglés.
      </p>
    </div>
  );
}
