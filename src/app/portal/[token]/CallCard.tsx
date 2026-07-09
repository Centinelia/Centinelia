'use client';

import { useState } from 'react';
import { Download, Clock, X, FileText } from 'lucide-react';

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  lead_created:       { label: 'Lead',        color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)'  },
  appointment_booked: { label: 'Cita',         color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  order_taken:        { label: 'Pedido',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  transferred:        { label: 'Transferido',  color: '#a855f7', bg: 'rgba(168,85,247,0.1)'  },
  info_provided:      { label: 'Información',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  escalated_whatsapp: { label: 'WhatsApp',     color: '#16a34a', bg: 'rgba(22,163,74,0.1)'   },
  missed:             { label: 'Perdida',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  other:              { label: 'Otro',         color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
};

const RECORDING_TTL_DAYS = 7;

interface Call {
  id: string;
  caller_number: string;
  outcome: string;
  duration_seconds: number;
  created_at: string;
  summary?: string;
  transcript?: string;
  recording_url?: string;
}

function RecordingPlayer({ url, createdAt }: { url: string; createdAt: string }) {
  const [downloading, setDownloading] = useState(false);

  const callDate    = new Date(createdAt);
  const expiresAt   = new Date(callDate.getTime() + RECORDING_TTL_DAYS * 24 * 60 * 60 * 1000);
  const now         = new Date();
  const expired     = now > expiresAt;
  const daysLeft    = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const expiresLabel = expiresAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  if (expired) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', fontSize: 12 }}>
        <Clock size={13} />
        Grabación expirada
      </div>
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `llamada-${createdAt.slice(0, 10)}.wav`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)' }}>Grabación</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
            color: daysLeft <= 2 ? '#f59e0b' : 'var(--c-text-3)' }}>
            <Clock size={10} />
            Hasta {expiresLabel}
          </span>
          <button onClick={handleDownload} disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)',
              fontSize: 11, fontWeight: 600, cursor: downloading ? 'default' : 'pointer',
              opacity: downloading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <Download size={11} />
            {downloading ? 'Descargando…' : 'Descargar'}
          </button>
        </div>
      </div>
      <audio controls src={url} style={{ width: '100%', height: 36, accentColor: '#6C3BFF' }} />
    </div>
  );
}

export default function CallCard({ call, isPro, clientName, token }: { call: Call; isPro?: boolean; clientName?: string; token?: string }) {
  const [open, setOpen] = useState(false);
  const outcome    = OUTCOME_LABELS[call.outcome] ?? OUTCOME_LABELS.other;
  const showRec    = isPro && !!call.recording_url;
  const hasDetails = !!(call.summary || call.transcript || showRec);

  const formattedDate = new Date(call.created_at).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short',
  });
  const formattedDateLong = new Date(call.created_at).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const duration = Math.max(1, Math.ceil(call.duration_seconds / 60));

  return (
    <>
      {/* Card, compact, fully clickable when has details */}
      <div
        className={`rounded-xl flex transition-opacity ${hasDetails ? 'cursor-pointer hover:opacity-80' : ''}`}
        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        onClick={() => hasDetails && setOpen(true)}
      >
        {/* Left accent stripe */}
        <div style={{ width: 3, background: outcome.color, flexShrink: 0, opacity: 0.65,
          borderRadius: '10px 0 0 10px' }} />

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  {call.caller_number || 'Número desconocido'}
                </span>
                {clientName && (
                  <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--c-text-3)' }}>{clientName}</p>
                )}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ background: outcome.bg, color: outcome.color }}>
                {outcome.label}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{duration} min</span>
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{formattedDate}</span>
            </div>
          </div>
          {call.summary && (
            <p className="text-xs mt-1.5 leading-relaxed line-clamp-2" style={{ color: 'var(--c-text-2)' }}>
              {call.summary}
            </p>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)' }}>

            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--c-border)' }}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                    {call.caller_number || 'Número desconocido'}
                  </span>
                  {clientName && (
                    <span className="text-xs font-medium" style={{ color: '#9B6DFF' }}>{clientName}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: outcome.bg, color: outcome.color }}>
                    {outcome.label}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                  {duration} min · {formattedDateLong}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0 ml-3"
                style={{ color: 'var(--c-text-2)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {call.summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-3)' }}>
                    Resumen
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{call.summary}</p>
                </div>
              )}

              {showRec && <RecordingPlayer url={call.recording_url!} createdAt={call.created_at} />}

              {call.transcript && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-3)' }}>
                    Transcripción
                  </p>
                  <div className="rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto"
                    style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)',
                      border: '1px solid var(--c-border)', maxHeight: 220 }}>
                    {call.transcript}
                  </div>
                </div>
              )}

              {/* PDF Downloads */}
              {token && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-text-3)' }}>
                    Documentos
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/portal/${token}/pdf/llamada/${call.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
                      <FileText size={12} /> Resumen PDF
                    </a>
                    {['lead_created', 'info_provided'].includes(call.outcome) && (
                      <a
                        href={`/api/portal/${token}/pdf/cotizacion/${call.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
                        <FileText size={12} /> Cotización PDF
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
