'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';

export default function ReviewLinkEditor({ token, initialValue }: { token: string; initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [dirty, setDirty]   = useState(false);

  useDirtyWarning('review-link', dirty);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/portal/${token}/integrations`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ google_review_url: value || null }),
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Enlace de reseñas
        </label>
        <input
          type="url"
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
          placeholder="https://g.page/r/tu-negocio/review"
          className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
        />
        <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
          Tu empleado invitará a clientes contentos a dejar una reseña con este enlace.
        </p>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          background: saved ? '#22c55e' : '#6C3BFF',
          color: '#fff',
          boxShadow: saved ? 'none' : '0 1px 2px rgba(108,59,255,0.24)',
        }}
      >
        {saving
          ? <><Loader2 size={13} className="animate-spin" />Guardando</>
          : saved
            ? <><Check size={13} />Guardado</>
            : 'Guardar'}
      </button>
    </div>
  );
}
