'use client';

import { useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';

export default function ResyncButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleResync = async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/portal/${token}/resync`, { method: 'POST' });
      setState(res.ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 4000);
  };

  const isLoading = state === 'loading';

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <button
        onClick={handleResync}
        disabled={isLoading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          background:  state === 'success' ? '#16a34a'
                     : state === 'error'   ? '#dc2626'
                     : '#6C3BFF',
          color:   '#fff',
          opacity: isLoading ? 0.7 : 1,
          cursor:  isLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {state === 'success' ? (
          <><Check size={14} /> Empleado actualizado</>
        ) : state === 'error' ? (
          <><AlertCircle size={14} /> Error al sincronizar</>
        ) : (
          <><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Aplicando cambios…' : 'Aplicar cambios al empleado'}</>
        )}
      </button>
      <p className="text-xs text-center" style={{ color: 'var(--c-text-4)' }}>
        Presiona este botón cuando termines de configurar tu empleado para activar todos los cambios.
      </p>
    </div>
  );
}
