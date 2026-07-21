'use client';

import { useState } from 'react';
import { Check, Phone, Zap, Clock } from 'lucide-react';

const JORNADA_LABELS: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
  combinada: {
    label: 'Combinada',
    desc:  'Minutos de voz + tareas inteligentes',
    icon:  <span className="flex items-center gap-0.5"><Clock size={11} /><Zap size={11} /></span>,
  },
  minutos: {
    label: 'Solo minutos',
    desc:  'Canal de voz, sin tareas inteligentes',
    icon:  <Clock size={11} />,
  },
  tareas: {
    label: 'Solo tareas',
    desc:  'Sin canal de voz, solo tareas digitales',
    icon:  <Zap size={11} />,
  },
};

export default function JornadaSection({
  token,
  jornadaType,
}: {
  token:       string;
  jornadaType: string;
}) {
  const [activating, setActivating] = useState(false);
  const [activated, setActivated]   = useState(false);
  const [error, setError]           = useState('');

  const info = JORNADA_LABELS[jornadaType] ?? JORNADA_LABELS['combinada'];

  const handleActivateVoice = async () => {
    setActivating(true);
    setError('');
    try {
      const res  = await fetch(`/api/portal/${token}/activate-voice`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Ocurrió un error'); }
      else { setActivated(true); setTimeout(() => window.location.reload(), 1200); }
    } catch { setError('No se pudo conectar. Intenta de nuevo.'); }
    finally { setActivating(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl px-4 py-3"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{info.label}</p>
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>Actual</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }}>{info.icon}</span>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{info.desc}</p>
        </div>
      </div>

      {jornadaType === 'tareas' && (
        <div className="rounded-xl px-4 py-3"
          style={{ border: '1px solid rgba(108,59,255,0.25)', background: 'rgba(108,59,255,0.05)' }}>
          <div className="flex items-start gap-2 mb-3">
            <Phone size={14} style={{ color: '#6C3BFF', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>Activar canal de voz</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Asigna un numero telefonico y cambia la jornada a Combinada. Los minutos incluidos se ajustan al plan actual.
              </p>
            </div>
          </div>
          {activated ? (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
              <Check size={12} /> Canal de voz activado. Recargando...
            </div>
          ) : (
            <>
              <button
                onClick={handleActivateVoice}
                disabled={activating}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                style={{
                  background: 'rgba(108,59,255,0.15)',
                  border:     '1px solid rgba(108,59,255,0.4)',
                  color:      '#6C3BFF',
                  opacity:    activating ? 0.6 : 1,
                }}>
                {activating ? 'Activando...' : <><Phone size={12} /> Activar canal de voz</>}
              </button>
              {error && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
