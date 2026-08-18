'use client';

import { useState } from 'react';
import { Check, Target } from 'lucide-react';

interface Props {
  token:    string;
  agentId?: string;
  initDod:  string;
}

export default function DefinitionOfDoneEditor({ token, agentId, initDod }: Props) {
  const [value,  setValue]  = useState(initDod);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function handleBlur() {
    if (value === initDod) return;
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...(agentId ? { agentId } : {}), definition_of_done: value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
        En una oración, define cuándo este empleado ha cumplido su trabajo. Tu empleado usará esto como su brújula para saber qué es el éxito.
      </p>

      <div className="relative">
        <div
          className="absolute left-3 top-3 flex-shrink-0"
          style={{ color: '#9B8FB5', pointerEvents: 'none' }}
        >
          <Target size={13} />
        </div>
        <textarea
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false); }}
          onBlur={handleBlur}
          rows={3}
          placeholder='Ej: "Listo significa que cada mañana a las 9am la bandeja de correos está vacía, los leads del día anterior están en Notion y cualquier urgencia fue notificada al equipo por correo."'
          className="w-full rounded-xl text-xs leading-relaxed outline-none resize-none"
          style={{
            padding:    '10px 12px 10px 32px',
            background: '#FAFAFB',
            border:     '1px solid #E8E3F5',
            color:      '#1A0A3B',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px]" style={{ color: '#9B8FB5' }}>
          Empieza con "Listo significa que..." · sé específico y medible
        </p>
        {saving && (
          <span className="text-[11px]" style={{ color: '#6B6480' }}>Guardando…</span>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
