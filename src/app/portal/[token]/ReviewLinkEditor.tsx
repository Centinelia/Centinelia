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
      <div>
        <label className="text-[13px] font-semibold block mb-1" style={{ color: '#1A0A3B' }}>
          Enlace de Google Reviews
        </label>
        <p className="text-[12px] mb-2.5" style={{ color: '#6B6480' }}>
          Tu empleado comparte este link con clientes satisfechos al final de la llamada para pedir una reseña.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={value}
            onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
            placeholder="https://g.page/r/tu-negocio/review"
            className="flex-1 px-3.5 py-2.5 rounded-lg text-[14px] outline-none transition-colors focus:border-[#6C3BFF]"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed shrink-0"
            style={{
              background: saved ? '#22c55e' : dirty ? '#6C3BFF' : '#FAFAFB',
              color:      saved || dirty ? '#fff' : '#9B8FB5',
              border:     saved || dirty ? 'none' : '1px solid #E8E3F5',
              boxShadow:  saved
                ? '0 4px 12px rgba(34,197,94,0.24)'
                : dirty ? '0 4px 12px rgba(108,59,255,0.24)' : 'none',
              opacity:    saving ? 0.7 : 1,
            }}
          >
            {saving
              ? <><Loader2 size={13} className="animate-spin" />Guardando</>
              : saved
                ? <><Check size={13} strokeWidth={2.5} />Guardado</>
                : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
