'use client';

import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';

interface Props {
  token:        string;
  initialValue: string;
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
- La solicitud requiere autorización del dueño
- No tiene información suficiente para responder con certeza`;

export default function GuardrailsEditor({ token, initialValue }: Props) {
  const [value,  setValue]  = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  async function handleBlur() {
    if (value === initialValue) return;
    setSaving(true);
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ agent_guardrails: value }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
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
  );
}
