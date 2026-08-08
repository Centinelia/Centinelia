'use client';

import { useState } from 'react';
import { Bug, X, ChevronRight, Check } from 'lucide-react';

const CATEGORIES = [
  'Bug de interfaz',
  'Falla del sistema',
  'Impedimento de trabajo',
  'Otro',
];

interface Props {
  token:     string;
  variant?: 'fab' | 'link';
}

export default function BugReportButton({ token, variant = 'fab' }: Props) {
  const [open,        setOpen]        = useState(false);
  const [category,    setCategory]    = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(false);
  const [error,       setError]       = useState('');

  function reset() {
    setCategory(CATEGORIES[0]);
    setDescription('');
    setSent(false);
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError('Describe la falla antes de enviar.'); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${token}/bug-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al enviar.'); return; }
      setSent(true);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Trigger — FAB or inline footer link */}
      {variant === 'fab' ? (
        <button
          onClick={() => { reset(); setOpen(true); }}
          title="Reportar falla"
          style={{
            position: 'fixed', bottom: 24, left: 20, zIndex: 40,
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 0.2s',
            backdropFilter: 'blur(8px)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.22)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
        >
          <Bug size={18} color="#ef4444" />
        </button>
      ) : (
        <button
          onClick={() => { reset(); setOpen(true); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
        >
          <Bug size={11} color="#ef4444" />
          <p style={{ fontSize: 10, color: 'var(--c-text-4)', margin: 0 }}>¿Encontraste algo raro?</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', margin: 0 }}>Reportar falla</p>
        </button>
      )}

      {/* Modal backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          {/* Modal */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--c-modal)', borderRadius: 20,
              border: '1px solid var(--c-border)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--c-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bug size={15} color="#ef4444" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Reportar falla</p>
                  <p style={{ fontSize: 11, color: 'var(--c-text-3)', margin: 0 }}>Tu reporte no consume tareas ni minutos</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--c-text-3)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            {sent ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', margin: '0 auto 16px',
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={22} color="#22c55e" />
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', margin: '0 0 6px' }}>Reporte enviado</p>
                <p style={{ fontSize: 13, color: 'var(--c-text-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
                  Nuestro equipo lo revisará a la brevedad.
                  <br />
                  Gracias por ayudarnos a mejorar.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: 'var(--c-surface-2)', color: 'var(--c-text)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={submit} style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Category */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                    Categoría
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CATEGORIES.map(c => (
                      <button
                        key={c} type="button" onClick={() => setCategory(c)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                          background: category === c ? 'rgba(239,68,68,0.12)' : 'var(--c-surface-2)',
                          border: `1px solid ${category === c ? 'rgba(239,68,68,0.4)' : 'var(--c-border)'}`,
                          color: category === c ? '#ef4444' : 'var(--c-text-2)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                    Descripción <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="¿Qué pasó? ¿En qué pantalla ocurrió? ¿Qué esperabas que pasara?"
                    rows={4}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'vertical',
                      background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)',
                      color: 'var(--c-text)', fontSize: 13, lineHeight: 1.55, boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {error && (
                  <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
                )}

                <button
                  type="submit" disabled={sending}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: sending ? 'default' : 'pointer',
                    background: sending ? 'rgba(239,68,68,0.4)' : '#ef4444',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background 0.2s',
                  }}
                >
                  {sending ? 'Enviando...' : <><span>Enviar reporte</span><ChevronRight size={15} /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
