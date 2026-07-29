'use client';

/**
 * F10.1 Tournament UI para elegir variante de KB.
 *
 * Muestra las 3 variantes (Directo / Cálido / Estructurado) en columnas.
 * El cliente compara y elige la que mejor le queda a su negocio.
 */

import { useEffect, useState } from 'react';
import { X, Check, Loader2, Sparkles } from 'lucide-react';

interface Variant {
  style: 'directo' | 'calido' | 'estructurado';
  label: string;
  text:  string;
  error?: string;
}

interface Props {
  token:      string;
  type:       'business' | 'role';
  role?:      string;
  open:       boolean;
  onClose:    () => void;
  onSelect:   (text: string) => void;
}

export default function KBTournamentModal({ token, type, role, open, onClose, onSelect }: Props) {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setVariants(null);
      setExpanded(null);
      try {
        const res = await fetch(`/api/portal/${token}/generate-kb-tournament`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type, role }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({ error: 'Error desconocido' }));
          if (!cancelled) setError(msg ?? 'Error al generar');
          return;
        }
        const { variants: data } = await res.json();
        if (!cancelled) setVariants(data);
      } catch {
        if (!cancelled) setError('No se pudo conectar. Verifica tu conexión.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, token, type, role]);

  if (!open) return null;

  const previewLen = 400;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col"
        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
             style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
              <Sparkles size={16} style={{ color: '#9B6DFF' }} />
              Compara 3 estilos
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Elige el que mejor le queda a tu negocio. Solo el elegido se guarda.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ background: 'var(--c-input-bg)', color: 'var(--c-text)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 size={28} className="animate-spin" style={{ color: '#9B6DFF' }} />
              <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
                Generando 3 variantes en paralelo…
              </p>
              <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                Toma unos 15 a 25 segundos
              </p>
            </div>
          )}

          {error && !loading && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                color:      '#ef4444',
                background: 'rgba(239,68,68,0.06)',
                border:     '1px solid rgba(239,68,68,0.2)',
              }}
            >
              {error}
            </div>
          )}

          {variants && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {variants.map((v, i) => {
                const okay = v.text.trim().length > 100;
                const isOpen = expanded === i;
                const shown = isOpen ? v.text : v.text.slice(0, previewLen);
                return (
                  <div
                    key={v.style}
                    className="rounded-2xl p-4 flex flex-col"
                    style={{
                      background: 'var(--c-card)',
                      border: '1px solid var(--c-border)',
                      minHeight: 320,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: 'rgba(108,59,255,0.10)',
                          color: '#9B6DFF',
                          border: '1px solid rgba(108,59,255,0.30)',
                        }}
                      >
                        {v.label}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                        {v.text.length.toLocaleString('es-MX')} chars
                      </span>
                    </div>

                    {!okay ? (
                      <div className="flex-1 flex items-center justify-center text-center px-2">
                        <p className="text-xs" style={{ color: '#ef4444' }}>
                          No se generó esta variante.
                        </p>
                      </div>
                    ) : (
                      <>
                        <pre
                          className="flex-1 text-xs whitespace-pre-wrap font-sans overflow-hidden"
                          style={{
                            color: 'var(--c-text-2)',
                            lineHeight: 1.5,
                            maxHeight: isOpen ? 'none' : 220,
                          }}
                        >
                          {shown}
                          {!isOpen && v.text.length > previewLen ? '…' : ''}
                        </pre>
                        {v.text.length > previewLen && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : i)}
                            className="text-xs mt-2 self-start transition-colors hover:opacity-80"
                            style={{ color: '#9B6DFF' }}
                          >
                            {isOpen ? 'Ver menos' : 'Ver completa'}
                          </button>
                        )}
                        <button
                          onClick={() => { onSelect(v.text); onClose(); }}
                          className="mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                          style={{ background: '#6C3BFF', color: '#fff' }}
                        >
                          <Check size={14} />
                          Elegir esta
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
