'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';
import { KB_LIMITS } from '@/lib/portal/kb-limits';

export default function KnowledgeBaseEditor({
  token,
  initialValue,
  websiteSynced  = false,
  hasDescription = false,
}: {
  token:          string;
  initialValue:   string;
  websiteSynced?: boolean;
  hasDescription?: boolean;
}) {
  const [value, setValue]           = useState(initialValue);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [dirty, setDirty]           = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [isValidationErr, setIsValidationErr] = useState(false);

  useDirtyWarning('kb-business', dirty);

  const SOFT_LIMIT = KB_LIMITS.business.soft;
  const HARD_LIMIT = KB_LIMITS.business.hard;
  const chars = value.length;
  const pct   = Math.min((chars / HARD_LIMIT) * 100, 100);
  const overHard = chars > HARD_LIMIT;
  const barColor = chars <= SOFT_LIMIT ? '#22c55e' : chars <= HARD_LIMIT ? '#f59e0b' : '#ef4444';
  const hint =
    chars <= SOFT_LIMIT ? 'Ideal' :
    chars <= HARD_LIMIT ? 'Cerca del límite, considera resumir' :
    'Excede el límite. No se puede guardar así.';

  const handleGenerate = async () => {
    if (generating) return;

    // Validate required fields before consuming ops
    if (!hasDescription) {
      setIsValidationErr(true);
      setGenError('Necesitas completar esto antes de generar:\n\n· Descripción de la organización → ve a Organización y completa el campo Descripción.');
      return;
    }

    const hasExisting = value.trim().length > 50;
    const confirmMsg  = hasExisting
      ? 'Esto usará 3 tareas y reemplazará el contenido actual. ¿Deseas continuar?'
      : 'Esto usará 3 tareas. ¿Deseas continuar?';
    if (!window.confirm(confirmMsg)) return;

    setGenerating(true);
    setIsValidationErr(false);
    setGenError(null);
    setValue('');
    setSaved(false);
    setDirty(true);
    try {
      const res = await fetch(`/api/portal/${token}/generate-kb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'business' }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setIsValidationErr(false);
        setGenError(error ?? 'Error al generar');
        return;
      }
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let generated = '';
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text, error } = JSON.parse(payload);
            if (error) { setGenError(error); return; }
            if (text) { generated += text; setValue(prev => prev + text); }
          } catch { /* ignore */ }
        }
      }
      if (generated) await handleSave(generated);
    } catch {
      setGenError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (override?: string) => {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/portal/${token}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_base: override ?? value }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
        rows={10}
        placeholder={'SERVICIOS:\n- Corte de cabello: $150\n- Tinte: $300\n\nFAQS:\n¿Aceptan tarjeta? Sí.'}
        className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y"
        style={{
          background: 'var(--c-input-bg)',
          border: '1px solid var(--c-input-border)',
          color: 'var(--c-text)',
          minHeight: 180,
        }}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: barColor, fontWeight: 500 }}>
            {chars.toLocaleString('es-MX')} / {HARD_LIMIT.toLocaleString('es-MX')} caracteres
          </span>
          <span style={{ color: 'var(--c-text-4)' }}>{hint}</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--c-input-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleSave()}
          disabled={saving || generating || overHard}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={{ background: saved ? '#22c55e' : '#6C3BFF', color: '#fff' }}
        >
          {saving
            ? <><Loader2 size={13} className="animate-spin" />Guardando…</>
            : saved
              ? <><Check size={13} />Guardado</>
              : 'Guardar'}
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || saving}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.3)' }}
        >
          {generating
            ? <><Loader2 size={12} className="animate-spin" />Generando…</>
            : <><Sparkles size={12} />Redactar automáticamente <span style={{ opacity: 0.6 }}>· 3 tareas</span></>}
        </button>
      </div>
      {genError && (
        <p
          className="text-xs rounded-lg px-3 py-2"
          style={{
            whiteSpace: 'pre-line',
            color:      isValidationErr ? '#92400e' : '#ef4444',
            background: isValidationErr ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.06)',
            border:     `1px solid ${isValidationErr ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.2)'}`,
          }}
        >
          {genError}
        </p>
      )}
      {!websiteSynced && !generating && (
        <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
          Consejo: sincroniza tu sitio web en <strong>Negocio → Sitio web</strong> para mejores resultados. Si no tienes sitio, la descripción es suficiente.
        </p>
      )}
    </div>
  );
}
