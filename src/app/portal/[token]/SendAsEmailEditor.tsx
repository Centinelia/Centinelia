'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  token:        string;
  provider:     string;
  initialValue: string;
}

export default function SendAsEmailEditor({ token, provider, initialValue }: Props) {
  const [value,   setValue]   = useState(initialValue);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const dirty = value !== initialValue;

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/agent-email`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider, send_as_email: value.trim() || null }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="email"
        placeholder="empleado@empresa.com"
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); }}
        className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
        style={{
          background: 'var(--c-bg)',
          border:     '1px solid var(--c-border)',
          color:      'var(--c-text)',
          minWidth:   0,
        }}
      />
      <button
        onClick={save}
        disabled={saving || (!dirty && !saved)}
        className="text-xs px-3 py-2 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-40 flex-shrink-0"
        style={{ background: '#6C3BFF', color: '#fff' }}
      >
        {saving
          ? <Loader2 size={12} className="animate-spin" />
          : saved ? 'Guardado' : 'Guardar'
        }
      </button>
    </div>
  );
}
