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
    await fetch(`/api/portal/${token}/integrations`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ google_review_url: value || null }),
    });
    setSaving(false);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="url"
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
        placeholder="https://g.page/r/tu-negocio/review"
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
        style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
        style={{ background: saved ? '#22c55e' : '#6C3BFF', color: '#fff' }}
      >
        {saving
          ? <><Loader2 size={13} className="animate-spin" />Guardando…</>
          : saved
            ? <><Check size={13} />Guardado</>
            : 'Guardar'}
      </button>
    </div>
  );
}
