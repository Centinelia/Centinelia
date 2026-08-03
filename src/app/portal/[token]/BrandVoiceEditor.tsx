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
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
        Extrae el tono real de tu negocio a partir de correos, copy del sitio o cualquier texto que ya escribieron. Tus empleados van a hablar como tu marca, no con un tono genérico. Puedes editarlo manualmente después.
      </p>

      {!guide.trim() && (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium" style={{ color: 'var(--c-text-2)' }}>
            Pega 3 a 5 muestras reales, separadas por una línea en blanco:
          </label>
          <textarea
            value={samples}
            onChange={e => { setSamples(e.target.value); setError(null); }}
            rows={10}
            placeholder='Un correo previo que hayas mandado a un cliente…

Otro correo o mensaje…

Tu descripción del negocio o pitch escrito…'
            className="w-full rounded-xl text-xs leading-relaxed outline-none resize-y"
            style={{
              padding:    '10px 12px',
              background: 'var(--c-surface-2)',
              border:     '1px solid var(--c-border)',
              color:      'var(--c-text)',
              fontFamily: 'inherit',
              minHeight:  180,
            }}
          />
          <button
            type="button"
            onClick={extract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
            style={{ background: roleColor, color: '#fff' }}
          >
            {extracting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {extracting ? 'Analizando muestras…' : 'Extraer tono de marca'}
          </button>
        </div>
      )}

      {guide.trim() && (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium" style={{ color: 'var(--c-text-2)' }}>
            Guía de tono actual (editable):
          </label>
          <textarea
            value={guide}
            onChange={e => { setGuide(e.target.value); setSaved(false); }}
            onBlur={() => guide !== initGuide && save(guide)}
            rows={12}
            className="w-full rounded-xl text-xs leading-relaxed outline-none resize-y"
            style={{
              padding:    '10px 12px',
              background: 'var(--c-surface-2)',
              border:     '1px solid var(--c-border)',
              color:      'var(--c-text)',
              fontFamily: 'inherit',
              minHeight:  240,
            }}
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-[10px] hover:opacity-80"
              style={{ color: 'var(--c-text-4)' }}
            >
              <Trash2 size={10} /> Borrar guía y volver al genérico
            </button>
            {saving && <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Guardando…</span>}
            {saved && !saving && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
                <Check size={11} /> Guardado
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px]" style={{ color: '#ef4444' }}>{error}</p>
      )}
    </div>
  );
}
