'use client';

import { useState } from 'react';
import { Check, Sparkles, Trash2, Loader2 } from 'lucide-react';

interface Props {
  token:      string;
  initGuide:  string;
  roleColor?: string;
}

export default function BrandVoiceEditor({ token, initGuide, roleColor = '#6C3BFF' }: Props) {
  const [guide,   setGuide]   = useState(initGuide);
  const [samples, setSamples] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const save = async (nextGuide: string) => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/brand-voice`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ guide: nextGuide }),
      });
      if (!res.ok) throw new Error('No se pudo guardar');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const extract = async () => {
    const parts = samples.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) { setError('Junta al menos 2 muestras separadas por línea vacía.'); return; }
    setExtracting(true); setError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/brand-voice`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ samples: parts }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo extraer'); return; }
      setGuide(data.guide ?? '');
      setSamples('');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  const clear = async () => {
    if (!guide.trim()) return;
    if (!confirm('¿Borrar la guía actual? Tus empleados volverán a hablar con el tono genérico.')) return;
    setGuide('');
    await save('');
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
        Extrae el tono real de tu negocio a partir de correos, copy del sitio o cualquier texto que ya hayas escrito. Tus empleados van a hablar como tu marca, no con un tono genérico. Puedes editarlo manualmente después.
      </p>

      {!guide.trim() && (
        <div className="flex flex-col gap-3">
          <label className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            Pega 3 a 5 muestras reales, separadas por una línea en blanco
          </label>
          <textarea
            value={samples}
            onChange={e => { setSamples(e.target.value); setError(null); }}
            rows={10}
            placeholder='Un correo previo que hayas mandado a un cliente…

Otro correo o mensaje…

Tu descripción del negocio o pitch escrito…'
            className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors focus:border-[#6C3BFF]"
            style={{
              padding:    '14px 16px',
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              color:      '#1A0A3B',
              fontFamily: 'inherit',
              minHeight:  200,
            }}
          />
          <button
            type="button"
            onClick={extract}
            disabled={extracting}
            className="inline-flex items-center gap-2 self-start rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{
              background: roleColor,
              color:      '#fff',
              boxShadow:  `0 4px 12px ${roleColor}40`,
            }}
          >
            {extracting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {extracting ? 'Analizando muestras…' : 'Extraer tono de marca'}
          </button>
        </div>
      )}

      {guide.trim() && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
              Guía de tono actual
            </label>
            <span className="text-[11px] font-medium" style={{ color: '#9B8FB5' }}>
              Editable, se guarda al salir del campo
            </span>
          </div>
          <textarea
            value={guide}
            onChange={e => { setGuide(e.target.value); setSaved(false); }}
            onBlur={() => guide !== initGuide && save(guide)}
            rows={12}
            className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors focus:border-[#6C3BFF]"
            style={{
              padding:    '14px 16px',
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              color:      '#1A0A3B',
              fontFamily: 'inherit',
              minHeight:  240,
            }}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 0 }}
            >
              <Trash2 size={12} /> Borrar guía y volver al genérico
            </button>
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
      )}

      {error && (
        <p className="text-[12px] px-3 py-2 rounded-lg font-medium"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
