'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Loader2, Trash2, BookOpen } from 'lucide-react';

interface QBStatus {
  connected:     boolean;
  realm_id?:     string;
  company_name?: string | null;
  connected_at?: string | null;
}

const QBLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
    <rect width="48" height="48" rx="8" fill="#2CA01C" />
    <circle cx="24" cy="24" r="14" fill="#fff" fillOpacity=".15" />
    <circle cx="24" cy="24" r="10" fill="#fff" />
    <path d="M20 18v12M20 18h5a4 4 0 0 1 0 8h-5" stroke="#2CA01C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function QuickBooksSection({ token }: { token: string }) {
  const [status,        setStatus]        = useState<QBStatus | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/portal/${token}/qb-oauth`);
    const data = await res.json();
    setStatus(data);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function disconnect() {
    if (!confirm('¿Desconectar QuickBooks Online?')) return;
    setDisconnecting(true);
    await fetch(`/api/portal/${token}/qb-oauth`, { method: 'DELETE' });
    setStatus({ connected: false });
    setDisconnecting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Provider card */}
      <div className="rounded-xl p-4"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
            <QBLogo />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                QuickBooks Online
              </span>
              {status?.connected && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(44,160,28,0.1)', color: '#2CA01C', border: '1px solid rgba(44,160,28,0.25)' }}>
                  <CheckCircle size={10} /> Conectado
                </span>
              )}
            </div>
            {status?.connected ? (
              <>
                {status.company_name && (
                  <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--c-text-2)' }}>
                    {status.company_name}
                  </p>
                )}
                {status.connected_at && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>
                    Conectado el{' '}
                    {new Date(status.connected_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Intuit · contabilidad y finanzas
              </p>
            )}
          </div>

          <div className="flex-shrink-0">
            {status?.connected ? (
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
                style={{ color: 'var(--c-text-3)' }}
                title="Desconectar"
              >
                {disconnecting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Trash2 size={14} />}
              </button>
            ) : (
              <a
                href={`/api/portal/${token}/qb-oauth/connect`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#2CA01C', color: '#fff', textDecoration: 'none' }}
              >
                Conectar
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Capability callout */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
        <p className="px-3 pt-2.5 pb-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border)' }}>
          Tu empleado puede
        </p>
        <div className="flex flex-col gap-1.5 px-3 py-3">
          {[
            'Consultar facturas y cuentas por cobrar',
            'Buscar clientes y su historial de pagos',
            'Crear facturas y registrar pagos',
            'Generar reportes de ingresos a solicitud',
          ].map(cap => (
            <div key={cap} className="flex items-center gap-2">
              <BookOpen size={10} style={{ color: '#2CA01C', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
