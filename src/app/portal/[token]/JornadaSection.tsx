'use client';

import { useState } from 'react';
import { Check, Phone, AlertTriangle } from 'lucide-react';

export default function JornadaSection({
  token,
  jornadaType,
}: {
  token:       string;
  jornadaType: string;
}) {
  const [activating, setActivating] = useState(false);
  const [activated,  setActivated]  = useState(false);
  const [error,      setError]      = useState('');

  // Solo aplica cuando jornada=tareas (empleado sin canal de voz).
  // El chip de la jornada actual se muestra en el header de configurar/page.tsx.
  if (jornadaType !== 'tareas') return null;

  const handleActivateVoice = async () => {
    setActivating(true);
    setError('');
    try {
      const res  = await fetch(`/api/portal/${token}/activate-voice`, { method: 'POST' });
      const data = await res.json() as { error?: string; success?: boolean; checkoutUrl?: string };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (!res.ok) {
        setError(data.error ?? 'Ocurrió un error');
      } else {
        setActivated(true);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      setError('No se pudo conectar. Intenta de nuevo.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-2.5"
      style={{
        border:     '1px solid rgba(108,59,255,0.3)',
        background: 'linear-gradient(135deg, rgba(108,59,255,0.06), rgba(155,109,255,0.03))',
      }}>
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.15)', color: '#6C3BFF' }}>
          <Phone size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-tight" style={{ color: '#1A0A3B' }}>
            Contratar canal de voz
          </p>
          <p className="text-[10px] mt-0.5 leading-snug" style={{ color: '#6B6480' }}>
            Cambia la jornada a Combinada y asigna un número mexicano.
          </p>
        </div>
      </div>

      {activated ? (
        <div className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
          <Check size={12} /> Canal activado. Recargando...
        </div>
      ) : (
        <button
          onClick={handleActivateVoice}
          disabled={activating}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: activating ? 'wait' : 'pointer' }}>
          {activating ? 'Procesando...' : <><Phone size={12} /> Contratar canal de voz</>}
        </button>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] leading-snug"
          style={{ color: '#ef4444' }}>
          <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
