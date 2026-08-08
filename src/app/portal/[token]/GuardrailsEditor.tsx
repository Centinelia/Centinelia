'use client';

import { useState } from 'react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';

interface Props {
  token:                       string;
  initialValue:                string;
  initialGuardrailsLearnings?: string;
}

const PLACEHOLDER = `Define con claridad qué puede y qué NO puede hacer este empleado sin tu autorización.

PUEDE HACER (sin pedirte permiso):
- Responder preguntas sobre servicios y precios
- Agendar y confirmar citas
- Enviar correos de seguimiento estándar
- Capturar datos de prospectos y registrarlos en Notion

NO PUEDE HACER (debe escalar al equipo):
- Ofrecer descuentos o modificar precios sin aprobación
- Cancelar servicios ya contratados
- Comprometer fechas de entrega fuera del tiempo estándar
- Enviar correos que incluyan información financiera o contractual
- Hablar en nombre de la dirección en temas legales o de quejas graves

SIEMPRE DEBE TRANSFERIR cuando:
- El cliente menciona queja formal o amenaza legal
- La solicitud requiere autorización del responsable
- No tiene información suficiente para responder con certeza`;

export default function GuardrailsEditor({ token, initialValue, initialGuardrailsLearnings = '' }: Props) {
  const [value,              setValue]              = useState(initialValue);
  const [saving,             setSaving]             = useState(false);
  const [saved,              setSaved]              = useState(false);
  const [learnings,          setLearnings]          = useState(initialGuardrailsLearnings);
  const [savingLearnings,    setSavingLearnings]    = useState(false);
  const [savedLearnings,     setSavedLearnings]     = useState(false);

  async function handleBlur() {
    if (value === initialValue) return;
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent_guardrails: value }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function saveLearnings() {
    setSavingLearnings(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ guardrails_learnings: learnings }),
      });
      setSavedLearnings(true);
      setTimeout(() => setSavedLearnings(false), 2500);
    } finally {
      setSavingLearnings(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Define qué puede hacer este empleado de forma autónoma y qué debe escalar antes de actuar. Cuanto más claro sea el límite, menos errores comete.
        </p>

        <textarea
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false); }}
          onBlur={handleBlur}
          rows={12}
          placeholder={PLACEHOLDER}
          className="w-full rounded-xl text-xs leading-relaxed outline-none resize-y"
          style={{
            padding:    '10px 12px',
            background: 'var(--c-surface-2)',
            border:     '1px solid var(--c-border)',
            color:      'var(--c-text)',
            fontFamily: 'inherit',
          }}
        />

        <div className="flex items-center justify-between">
          <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
            Solo aplica a este empleado · las reglas de privacidad globales siempre están activas
          </p>
          {saving && (
            <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Guardando…</span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: '#22c55e' }}>
              <Check size={11} /> Guardado
            </span>
          )}
        </div>
      </div>

      {/* Learnings subsection */}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: '1.25rem' }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={13} style={{ color: '#9B6DFF' }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B6DFF' }}>
            Aprendizajes de límites de autoridad
          </p>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
          Correcciones y ajustes de autoridad que el empleado ha aprendido en campo y fueron aprobados. Puedes editarlos directamente aquí.
        </p>
        <textarea
          value={learnings}
          onChange={e => { setLearnings(e.target.value); setSavedLearnings(false); }}
          rows={6}
          placeholder="Los aprendizajes sobre límites de autoridad aprobados desde Oficina aparecerán aquí..."
          className="w-full rounded-xl px-3 py-3 text-xs leading-relaxed outline-none resize-y mb-3"
          style={{
            background: 'var(--c-input-bg)',
            border:     '1px solid rgba(108,59,255,0.25)',
            color:      'var(--c-text)',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={saveLearnings}
          disabled={savingLearnings}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={{
            background: savedLearnings ? '#22c55e' : 'rgba(108,59,255,0.12)',
            border:     '1px solid rgba(108,59,255,0.3)',
            color:      savedLearnings ? '#fff' : '#9B6DFF',
          }}
        >
          {savingLearnings
            ? <><Loader2 size={12} className="animate-spin" />Guardando…</>
            : savedLearnings
              ? <><Check size={12} />Guardado</>
              : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
