'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, ShoppingCart, Unlink } from 'lucide-react';

interface MLStatus {
  connected: boolean;
  nickname:  string | null;
  status:    string | null;
}

function MercadoLibreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="8" fill="#FFE600" />
      <path d="M24 10c-7.7 0-14 6.3-14 14s6.3 14 14 14 14-6.3 14-14S31.7 10 24 10z" fill="#E3002A" />
      <path d="M24 14c-5.5 0-10 4.5-10 10s4.5 10 10 10 10-4.5 10-10-4.5-10-10-10z" fill="#FFE600" />
      <path d="M19 21.5l5 4 5-4" stroke="#333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function MercadoLibreSection({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const flash        = searchParams.get('ml');

  const [mlStatus,      setMlStatus]      = useState<MLStatus | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/${token}/ml-oauth`);
      if (r.ok) setMlStatus(await r.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function disconnect() {
    if (!confirm('¿Desconectar MercadoLibre? Tu empleado dejará de poder consultar tu tienda.')) return;
    setDisconnecting(true);
    setError(null);
    try {
      await fetch(`/api/portal/${token}/ml-oauth`, { method: 'DELETE' });
      setMlStatus({ connected: false, nickname: null, status: null });
    } catch {
      setError('Error al desconectar. Intenta de nuevo.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#FFE600', border: '1px solid rgba(0,0,0,0.08)' }}>
          <MercadoLibreIcon />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            MercadoLibre
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
            Tu empleado puede consultar publicaciones, precios y responder preguntas de compradores.
          </p>
        </div>
      </div>

      {flash === 'connected' && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}>
          MercadoLibre conectado correctamente.
        </div>
      )}
      {flash === 'error' && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>
          Hubo un error al conectar MercadoLibre. Intenta de nuevo.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
          <Loader2 size={14} className="animate-spin" /> Cargando...
        </div>
      ) : !mlStatus?.connected ? (
        <a
          href={`/api/portal/${token}/ml-oauth/connect`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#FFE600', color: '#333', textDecoration: 'none' }}
        >
          <ShoppingCart size={14} />
          Conectar MercadoLibre
        </a>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={14} />
            Conectado como <span className="font-semibold">{mlStatus.nickname}</span>
          </div>
          <button
            onClick={disconnect}
            disabled={disconnecting}
            className="self-start inline-flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ color: '#ef4444' }}
          >
            {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
            Desconectar
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  );
}
