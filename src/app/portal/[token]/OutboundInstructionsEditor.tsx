'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';
import { KB_LIMITS } from '@/lib/portal/kb-limits';

export default function OutboundInstructionsEditor({
  token,
  initialValue,
}: {
  token: string;
  initialValue: string;
}) {
  const [value, setValue]   = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [dirty, setDirty]   = useState(false);

  useDirtyWarning('outbound-instructions', dirty);

  const SOFT_LIMIT = KB_LIMITS.outbound.soft;
  const HARD_LIMIT = KB_LIMITS.outbound.hard;
  const chars = value.length;
  const pct   = Math.min((chars / HARD_LIMIT) * 100, 100);
  const overHard = chars > HARD_LIMIT;
  const barColor = chars <= SOFT_LIMIT ? '#22c55e' : chars <= HARD_LIMIT ? '#f59e0b' : '#ef4444';
  const hint =
    chars <= SOFT_LIMIT ? 'Ideal' :
    chars <= HARD_LIMIT ? 'Cerca del límite, considera resumir' :
    'Excede el límite. No se puede guardar así.';

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outbound_knowledge_base: value }),
      });
      if (res.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: '#6B6480' }}>
        Define el objetivo de tus llamadas salientes, qué decir, cómo manejar objeciones y qué hacer si no contestan.
      </p>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
        rows={10}
        placeholder={
          'OBJETIVO:\n' +
          'Hacer seguimiento a clientes que pidieron cotización esta semana.\n\n' +
          'QUÉ DECIR:\n' +
          '- Preguntar si recibieron la cotización y si tienen dudas\n' +
          '- Mencionar que incluye instalación sin costo\n\n' +
          'OBJECIONES:\n' +
          '- "Está caro": Ofrecer plan a 6 meses sin intereses\n' +
          '- "No tengo tiempo": Preguntar cuándo puede atender\n\n' +
          'SI NO CONTESTAN:\n' +
          '- Preguntar cuándo es buen momento para volver a llamar'
        }
        className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
        style={{
          background: '#FAFAFB',
          border: '1px solid #E8E3F5',
          color: '#1A0A3B',
          minHeight: 180,
        }}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: barColor, fontWeight: 500 }}>
            {chars.toLocaleString('es-MX')} / {HARD_LIMIT.toLocaleString('es-MX')} caracteres
          </span>
          <span style={{ color: '#9B8FB5' }}>{hint}</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: '#E8E3F5' }}>
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: barColor }} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={handleSave}
          disabled={saving || overHard}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={{ background: saved ? '#22c55e' : '#6C3BFF', color: '#fff' }}
        >
          {saving
            ? <><Loader2 size={13} className="animate-spin" />Guardando…</>
            : saved
              ? <><Check size={13} />Guardado</>
              : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
