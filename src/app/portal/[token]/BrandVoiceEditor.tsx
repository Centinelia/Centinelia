'use client';

import { useState } from 'react';
import { Check, Sparkles, Trash2, Loader2, Mail, Globe, Megaphone, FileText } from 'lucide-react';

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
    <div className="flex flex-col gap-5">
      <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
        Extrae el tono real de tu negocio a partir de textos que ya hayas escrito. Tus empleados van a hablar como tu marca, no con un tono genérico. Puedes editarlo manualmente después.
      </p>

      {!guide.trim() && (
        <div className="flex flex-col gap-5">

          {/* Cómo empezar — pasos numerados */}
          <div className="flex flex-col gap-3 rounded-2xl p-5"
            style={{
              background: `linear-gradient(135deg, ${roleColor}14 0%, ${roleColor}08 50%, #ffffff 100%)`,
              border: `1px solid ${roleColor}33`,
            }}>
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
              Cómo hacerlo en 3 pasos
            </p>

            <ol className="flex flex-col gap-3">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: roleColor, color: '#ffffff' }}>1</span>
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                    Junta 3 a 5 muestras reales de tu negocio
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                      style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                      <Mail size={11} style={{ color: roleColor }} /> Correos que ya mandaste
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                      style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                      <Globe size={11} style={{ color: roleColor }} /> Copy de tu sitio web
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                      style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                      <Megaphone size={11} style={{ color: roleColor }} /> Publicaciones de redes sociales
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                      style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                      <FileText size={11} style={{ color: roleColor }} /> Descripciones de servicios
                    </span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: roleColor, color: '#ffffff' }}>2</span>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                    Pégalos en el cuadro de abajo
                  </p>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                    Separa cada muestra con una <strong>línea en blanco</strong> (presiona Enter dos veces entre una y otra).
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: roleColor, color: '#ffffff' }}>3</span>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                    Presiona <span style={{ color: roleColor }}>Extraer tono de marca</span>
                  </p>
                  <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                    Analizamos las muestras y generamos una guía que tus empleados usarán para escribir con tu voz.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
              Pega aquí tus 3 a 5 muestras
            </label>
            <textarea
              value={samples}
              onChange={e => { setSamples(e.target.value); setError(null); }}
              rows={10}
              placeholder='Muestra 1: un correo previo que hayas mandado a un cliente...

Muestra 2: el texto "Sobre nosotros" de tu sitio web...

Muestra 3: la descripción de tu servicio principal...'
              className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors focus:border-[#6C3BFF]"
              style={{
                padding:    '14px 16px',
                background: '#ffffff',
                border:     '1px solid #E8E3F5',
                color:      '#1A0A3B',
                fontFamily: 'inherit',
                minHeight:  220,
              }}
            />
            <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
              Tip: entre más muestras y más variadas, mejor detectamos el tono real.
            </p>
          </div>

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
            {extracting ? 'Analizando muestras' : 'Extraer tono de marca'}
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
