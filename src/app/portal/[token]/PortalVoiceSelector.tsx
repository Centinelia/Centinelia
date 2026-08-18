'use client';

import { useState } from 'react';
import { Check, Loader } from 'lucide-react';
import VoiceSelector from '@/components/VoiceSelector';

export default function PortalVoiceSelector({
  token,
  agentId,
  currentVoiceId,
}: {
  token: string;
  agentId?: string;
  currentVoiceId: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(currentVoiceId);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(agentId ? { agentId } : {}), voice_id: selected }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    } finally {
      setSaving(false);
    }
  };

  const isDirty = selected !== currentVoiceId;

  return (
    <div className="flex flex-col gap-4">
      <VoiceSelector selected={selected} onChange={setSelected} />

      {isDirty && (
        <button
          onClick={handleSave}
          disabled={saving || !selected}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity"
          style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: saving ? 0.6 : 1 }}
        >
          {saving
            ? <><Loader size={13} className="animate-spin" /> Guardando…</>
            : saved
            ? <><Check size={13} /> Guardado</>
            : 'Guardar voz'
          }
        </button>
      )}

      {saved && !isDirty && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: '#16a34a' }}>
          <Check size={11} /> Voz actualizada correctamente
        </p>
      )}
    </div>
  );
}
