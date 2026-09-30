'use client';

import { useState } from 'react';
import { Check, Loader2, Ban } from 'lucide-react';

interface Props {
  token:       string;
  initTerms:   string;
}

// Restricción dura: palabras/frases que los meerkats NUNCA deben usar. Se
// inyecta como bloque separado del brand_voice_guide (que es guía suave).
// Se guarda en organizations.banned_terms (text, una por línea).
export default function BannedTermsEditor({ token, initTerms }: Props) {
  const [terms,  setTerms]  = useState(initTerms);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const save = async () => {
    if (terms === initTerms) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/brand-voice`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ banned_terms: terms }),
      });
      if (!res.ok) throw new Error('No se pudo guardar');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const count = terms
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
        Palabras o frases que tus empleados NUNCA deben usar. Escribe una por línea. Se aplica como restricción dura en los 5 canales (voz, chat, correo, WhatsApp).
      </p>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
          <Ban size={13} style={{ color: '#EF4444' }} />
          Lista de expresiones prohibidas
        </label>
        <textarea
          value={terms}
          onChange={e => { setTerms(e.target.value); setSaved(false); setError(null); }}
          onBlur={save}
          rows={6}
          placeholder={'estimado cliente\ncordial saludo\nquedo a la orden'}
          className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors focus:border-[#6C3BFF]"
          style={{
            padding:    '12px 14px',
            background: '#ffffff',
            border:     '1px solid #E8E3F5',
            color:      '#1A0A3B',
            fontFamily: 'inherit',
            minHeight:  140,
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
            {count === 0
              ? 'Ninguna restricción activa. Los empleados usan solo el tono de marca extraído arriba.'
              : `${count} ${count === 1 ? 'expresión prohibida' : 'expresiones prohibidas'}. Máximo 40.`}
          </p>
          {saving && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              <Loader2 size={11} className="animate-spin" /> Guardando
            </span>
          )}
          {saved && !saving && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
              <Check size={11} strokeWidth={2.5} /> Guardado
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[12px] px-3 py-2 rounded-lg font-medium"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
