'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles, Columns3, Award, BookMarked, ArrowRight } from 'lucide-react';
import { useDirtyWarning } from '@/lib/portal/useDirtyWarning';
import { KB_LIMITS } from '@/lib/portal/kb-limits';
import KBTournamentModal from './KBTournamentModal';
import KBGenerateConfirmModal, { type KBGenerateVariant } from './KBGenerateConfirmModal';

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
  const [genError, setGenError]     = useState<string | null>(null);
  const [isValidationErr, setIsValidationErr] = useState(false);
  const [tournamentOpen, setTournamentOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [filterReason, setFilterReason] = useState<string | null>(null);
  const [confirmVariant, setConfirmVariant] = useState<KBGenerateVariant | null>(null);

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

  const handleGenerateFiltered = async () => {
    if (filtering) return;
    setFiltering(true);
    setIsValidationErr(false);
    setGenError(null);
    setFilterReason(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/generate-kb-tournament`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'business', filter: true }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setGenError(error ?? 'Error al generar');
        return;
      }
      const { winner, reason } = await res.json() as { winner: { text: string; label: string }; reason: string };
      if (!winner?.text) { setGenError('No se pudo elegir una variante'); return; }
      setValue(winner.text);
      setDirty(true);
      setFilterReason(`Elegida: ${winner.label}. ${reason}`);
      await handleSave(winner.text);
    } catch {
      setGenError('No se pudo conectar. Verifica tu conexión.');
    } finally {
      setFiltering(false);
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

  const canSave = dirty && !saving && !overHard;
  const genDisabled = saving || filtering;
  const hasExisting = value.trim().length > 50;

  const requestGenerate = (variant: KBGenerateVariant) => {
    if (!hasDescription) {
      setIsValidationErr(true);
      setGenError('Necesitas completar esto antes de generar:\n\n· Descripción de la organización: ve a Organización y completa el campo Descripción.');
      return;
    }
    setIsValidationErr(false);
    setGenError(null);
    setConfirmVariant(variant);
  };

  const handleConfirm = async () => {
    const v = confirmVariant;
    setConfirmVariant(null);
    if (v === 'compare') setTournamentOpen(true);
    else if (v === 'auto') await handleGenerateFiltered();
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Hero */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <BookMarked size={24} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
            Manual de la organización
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
            El conocimiento base que todo empleado usa: servicios, precios, políticas y respuestas a preguntas frecuentes. Cada empleado hereda este manual y le suma sus propias instrucciones de puesto.
          </p>
        </div>
      </div>

      {/* Chips de contenido esperado */}
      <div className="flex flex-wrap gap-1.5">
        {['Servicios y precios', 'Políticas', 'Preguntas frecuentes', 'Ubicaciones', 'Horarios', 'Formas de pago'].map(chip => (
          <span key={chip} className="text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
            {chip}
          </span>
        ))}
      </div>

      {/* Textarea principal */}
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setSaved(false); setDirty(true); }}
        rows={12}
        placeholder={'SERVICIOS:\n- Corte de cabello: $150\n- Tinte: $300\n\nPOLÍTICAS:\n- Cancelaciones con 24h de anticipación.\n- Aceptamos efectivo, tarjeta y transferencia.\n\nFAQS:\n¿Aceptan tarjeta? Sí, débito y crédito.\n¿Tienen estacionamiento? Sí, gratuito para clientes.'}
        className="w-full rounded-xl text-[14px] leading-relaxed outline-none resize-y transition-colors focus:border-[#6C3BFF]"
        style={{
          padding:    '14px 16px',
          background: '#ffffff',
          border:     '1px solid #E8E3F5',
          color:      '#1A0A3B',
          fontFamily: 'inherit',
          minHeight:  280,
        }}
      />

      {/* Char bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="tabular-nums" style={{ color: barColor, fontWeight: 600 }}>
            {chars.toLocaleString('es-MX')} / {HARD_LIMIT.toLocaleString('es-MX')} caracteres
          </span>
          <span style={{ color: '#9B8FB5' }}>{hint}</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: '#F0EDF9' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>

      {/* Save primario */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleSave()}
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed"
          style={{
            background: saved ? '#22c55e' : canSave ? '#6C3BFF' : '#E8E3F5',
            color:      saved || canSave ? '#fff' : '#9B8FB5',
            boxShadow:  saved || !canSave ? 'none' : '0 4px 12px rgba(108,59,255,0.4)',
          }}
        >
          {saving
            ? <><Loader2 size={14} className="animate-spin" />Guardando</>
            : saved
              ? <><Check size={14} strokeWidth={2.5} />Guardado</>
              : 'Guardar cambios'}
        </button>
        {overHard && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
            Excede el límite: reduce el contenido para guardar
          </span>
        )}
      </div>

      {/* Panel Redactar con IA */}
      <div className="flex flex-col gap-2 rounded-2xl p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(108,59,255,0.12) 0%, rgba(155,109,255,0.06) 40%, #ffffff 100%)',
          border: '1px solid rgba(108,59,255,0.22)',
          boxShadow: '0 4px 20px rgba(108,59,255,0.08)',
        }}>
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: '#6C3BFF' }} />
          <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            Redactar con IA
          </p>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
          Generamos 3 versiones del manual y tú decides cómo elegir. Ambas opciones cuestan lo mismo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={() => requestGenerate('compare')}
            disabled={genDisabled}
            className="group flex flex-col gap-2 text-left rounded-2xl p-4 transition-all hover:border-[#6C3BFF] hover:shadow-[0_4px_16px_rgba(108,59,255,0.12)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.22)' }}>
                <Columns3 size={16} style={{ color: '#6C3BFF' }} />
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>3 tareas</span>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                Comparar 3 estilos y elegir yo
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                Ves las 3 variantes lado a lado (Directo, Cálido, Estructurado) y eliges la que mejor te queda.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold pt-1 transition-transform group-hover:translate-x-0.5" style={{ color: '#6C3BFF' }}>
              Comparar variantes <ArrowRight size={12} strokeWidth={2.5} />
            </span>
          </button>

          <button
            onClick={() => requestGenerate('auto')}
            disabled={genDisabled}
            className="group flex flex-col gap-2 text-left rounded-2xl p-4 pt-5 transition-all hover:shadow-[0_4px_16px_rgba(108,59,255,0.16)] disabled:opacity-50 disabled:cursor-not-allowed relative"
            style={{ background: '#ffffff', border: '1px solid rgba(108,59,255,0.3)' }}
          >
            <span className="absolute -top-2.5 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider z-10"
              style={{
                background: '#6C3BFF',
                color: '#fff',
                letterSpacing: '0.05em',
                boxShadow: '0 4px 10px rgba(108,59,255,0.35)',
              }}>
              Recomendado
            </span>
            <span className="absolute top-4 right-4 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              3 tareas
            </span>
            <div className="flex items-start">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.22)' }}>
                {filtering
                  ? <Loader2 size={16} className="animate-spin" style={{ color: '#6C3BFF' }} />
                  : <Award size={16} style={{ color: '#6C3BFF' }} />}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                Elegir la mejor automáticamente
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                Generamos las 3 variantes y un revisor experto las califica contra 5 criterios (claridad, cobertura, precisión, formato y utilidad) para dejarte solo la mejor.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold pt-1 transition-transform group-hover:translate-x-0.5" style={{ color: '#6C3BFF' }}>
              {filtering ? 'Evaluando 3 versiones' : 'Generar y elegir'} <ArrowRight size={12} strokeWidth={2.5} />
            </span>
          </button>
        </div>
      </div>

      {filterReason && !filtering && (
        <p className="text-[12px] rounded-xl px-3.5 py-2.5 font-medium"
           style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.25)' }}>
          {filterReason}
        </p>
      )}
      <KBTournamentModal
        token={token}
        type="business"
        open={tournamentOpen}
        onClose={() => setTournamentOpen(false)}
        onSelect={async (chosen) => {
          setValue(chosen);
          setDirty(true);
          setSaved(false);
          await handleSave(chosen);
        }}
      />
      <KBGenerateConfirmModal
        open={confirmVariant !== null}
        onClose={() => setConfirmVariant(null)}
        onConfirm={handleConfirm}
        variant={confirmVariant ?? 'compare'}
        kind="business"
        hasExisting={hasExisting}
      />
      {genError && (
        <p
          className="text-[12px] rounded-xl px-3.5 py-2.5 font-medium"
          style={{
            whiteSpace: 'pre-line',
            color:      isValidationErr ? '#92400e' : '#EF4444',
            background: isValidationErr ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
            border:     `1px solid ${isValidationErr ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          {genError}
        </p>
      )}
      {!websiteSynced && (
        <p className="text-[12px] leading-relaxed" style={{ color: '#9B8FB5' }}>
          Consejo: sincroniza tu sitio web en <strong style={{ color: '#6B6480' }}>Negocio, Sitio web</strong> para mejores resultados. Si no tienes sitio, la descripción es suficiente.
        </p>
      )}
    </div>
  );
}
