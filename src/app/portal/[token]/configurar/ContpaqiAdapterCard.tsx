'use client';

/**
 * Card + Modal para setup CONTPAQi dentro del tab Herramientas de Nala.
 * Solo se renderiza cuando el meerkat es facturista (rol Nala).
 *
 * Estados:
 * - loading: pidiendo estado.
 * - not_configured: tarjeta con botón "Configurar".
 * - configured: tarjeta con "CONECTADO" verde + botón "Ajustar / Descargar Writer".
 *
 * Click abre modal fullscreen con <ContpaqiSetupPanel />.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ExternalLink, X, FileCheck } from 'lucide-react';
import ContpaqiSetupPanel from './ContpaqiSetupPanel';

interface StateResp {
  dropbox_connected: boolean;
  configured: boolean;
  writer_api_token: string | null;
  config: { dropbox_base_path?: string } | null;
}

export default function ContpaqiAdapterCard({ token }: { token: string }) {
  const [state, setState]   = useState<StateResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/setup-contpaqi`);
      if (res.ok) setState(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setModalOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [modalOpen]);

  const connected = !!(state?.configured && state?.writer_api_token);

  return (
    <>
      <div className="rounded-xl p-4"
           style={{ background: '#fff', border: `1px solid ${connected ? 'rgba(34,197,94,0.25)' : '#F0EDF9'}` }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            <FileCheck size={16} style={{ color: '#6C3BFF' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                CONTPAQi (adaptador de facturación)
              </span>
              {loading ? (
                <span className="text-[11px]" style={{ color: '#6B6480' }}>
                  <Loader2 size={10} className="inline animate-spin" /> Cargando...
                </span>
              ) : connected ? (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle2 size={10} /> Conectado
                </span>
              ) : state?.dropbox_connected ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.25)' }}>
                  Falta configurar
                </span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(107,100,128,0.08)', color: '#6B6480', border: '1px solid rgba(107,100,128,0.2)' }}>
                  Conecta Dropbox primero
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
              Sincroniza el catálogo de clientes/productos de CONTPAQi con Dropbox y timbra las facturas que Nala genere. Requiere instalar un Writer pequeño en la máquina donde vive CONTPAQi.
            </p>
            {connected && state?.config?.dropbox_base_path && (
              <p className="text-[11px] mt-1 font-mono" style={{ color: '#6B6480' }}>
                Carpeta: {state.config.dropbox_base_path}
              </p>
            )}
          </div>
          <button onClick={() => setModalOpen(true)}
                  disabled={loading}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  style={{ background: connected ? 'rgba(108,59,255,0.1)' : '#6C3BFF', color: connected ? '#6C3BFF' : '#fff', border: connected ? '1px solid rgba(108,59,255,0.3)' : 'none' }}>
            {connected ? 'Ajustar / Descargar' : 'Configurar'}
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
             style={{ background: 'rgba(26,10,59,0.55)' }}
             onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="rounded-2xl w-full max-w-3xl my-4"
               style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: '1px solid var(--c-border)' }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>
                  Setup Facturación (CONTPAQi)
                </h2>
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                  Datos fiscales + descarga del Writer para Windows.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/portal/${token}/oficina/facturas/setup-contpaqi`}
                   target="_blank" rel="noopener"
                   className="text-[11px] inline-flex items-center gap-1 hover:opacity-80"
                   style={{ color: 'var(--c-text-3)' }}
                   title="Abrir en página completa">
                  <ExternalLink size={11} /> Pantalla completa
                </a>
                <button onClick={() => setModalOpen(false)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80"
                        style={{ background: 'transparent', color: 'var(--c-text-3)' }}
                        title="Cerrar (Esc)">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-5">
              <ContpaqiSetupPanel token={token} onConfigured={load} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
