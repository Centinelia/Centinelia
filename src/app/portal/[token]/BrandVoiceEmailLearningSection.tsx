'use client';

import { useState } from 'react';
import { Mail, Check, AlertCircle, BookOpen } from 'lucide-react';

interface Props {
  token:          string;
  connectedEmail: string | null;
  initialGuide?:  string | null;
}

type State = 'idle' | 'loading' | 'done' | 'error' | 'no-email' | 'not-enough';

// Aprende el TONO DE LA MARCA (cómo suena el negocio) leyendo los correos
// ENVIADOS por el dueño y su equipo en los últimos 30 días. Distinto de
// RoleEmailLearningSection (que extrae REGLAS DE DECISIÓN de la bandeja
// completa): aquí queremos ritmo, palabras favoritas, cierres, formalidad.
export default function BrandVoiceEmailLearningSection({ token, connectedEmail, initialGuide }: Props) {
  const [state,  setState]  = useState<State>(connectedEmail ? 'idle' : 'no-email');
  const [guide,  setGuide]  = useState<string | null>(initialGuide?.trim() || null);
  const [meta,   setMeta]   = useState<{ emails_used: number; total_fetched: number } | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function run() {
    setState('loading');
    setErrMsg(null);

    try {
      const res  = await fetch(`/api/portal/${token}/brand-voice/from-emails`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        if (data.usable !== undefined && data.usable < 2) {
          setErrMsg(data.error ?? 'Correos insuficientes.');
          setState('not-enough');
        } else {
          setErrMsg(data.error ?? 'Error al analizar los correos.');
          setState('error');
        }
        return;
      }

      setGuide((data.guide as string | null)?.trim() || null);
      setMeta({ emails_used: data.emails_used, total_fetched: data.total_fetched });
      setState('done');
    } catch {
      setErrMsg('Error de conexión. Intenta de nuevo.');
      setState('error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
        Analiza los últimos correos enviados por tu negocio y extrae cómo escribes: ritmo, palabras que sueles usar, cómo abres y cierras, tono, palabras que evitas.
        La guía se guarda como <strong style={{ color: '#1A0A3B' }}>tono de marca</strong> y se aplica a todos tus empleados en voz, chat y correo.
      </p>

      {state === 'no-email' && (
        <div className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          <AlertCircle size={14} style={{ color: '#6B6480', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-xs font-medium" style={{ color: '#1A0A3B' }}>
              Sin correo del negocio conectado
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Conecta Gmail o Outlook en Oficina → Integraciones para poder aprender el tono desde tus correos enviados.
            </p>
          </div>
        </div>
      )}

      {state !== 'no-email' && (
        <>
          {connectedEmail && (
            <div className="flex items-center gap-2">
              <Mail size={12} style={{ color: '#6B6480', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: '#6B6480' }}>
                Conectado: <span style={{ color: '#1A0A3B' }}>{connectedEmail}</span>
              </span>
            </div>
          )}

          {(state === 'idle' || state === 'done' || state === 'not-enough' || state === 'error') && (
            <button
              onClick={run}
              className="self-start flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl transition-opacity"
              style={{
                background: 'rgba(108,59,255,0.12)',
                border:     '1px solid rgba(108,59,255,0.3)',
                color:      '#6C3BFF',
                cursor:     'pointer',
              }}
            >
              <Mail size={14} />
              {guide ? 'Volver a analizar (3 tareas)' : 'Aprender el tono desde mis correos enviados'}
            </button>
          )}

          {state === 'loading' && (
            <div className="flex items-center gap-2.5">
              <div
                className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0"
                style={{ borderColor: 'rgba(108,59,255,0.2)', borderTopColor: '#6C3BFF' }}
              />
              <span className="text-xs" style={{ color: '#6B6480' }}>
                Leyendo tus correos enviados y extrayendo el tono...
              </span>
            </div>
          )}

          {(state === 'error' || state === 'not-enough') && errMsg && (
            <p className="text-xs" style={{ color: state === 'not-enough' ? '#6B6480' : '#ef4444' }}>{errMsg}</p>
          )}

          {state === 'done' && meta && (
            <div className="flex items-start gap-3 rounded-xl p-4"
              style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <Check size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                  Tono de marca actualizado
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                  Se analizaron {meta.emails_used} de {meta.total_fetched} correos enviados. Ya se aplicó a todos tus empleados.
                </p>
              </div>
            </div>
          )}

          {guide && (
            <div className="rounded-lg p-3.5"
              style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.15)' }}>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={12} style={{ color: '#9B6DFF' }} />
                <p className="text-[11px] font-semibold" style={{ color: '#1A0A3B' }}>
                  Guía extraída
                </p>
              </div>
              <pre className="text-[11px] whitespace-pre-wrap font-normal" style={{ color: '#6B6480', fontFamily: 'inherit' }}>
                {guide}
              </pre>
            </div>
          )}

          {state === 'idle' && !guide && (
            <p className="text-[10px]" style={{ color: '#9B8FB5' }}>
              Consume 3 tareas · analiza los últimos 30 días · lee solo correos enviados por el negocio
            </p>
          )}
        </>
      )}
    </div>
  );
}
