'use client';

import { useState } from 'react';
import { Download, Clock, X, FileText, Star, Phone, User, ChevronDown } from 'lucide-react';
import TranscriptView from '@/components/TranscriptView';

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  lead_created:       { label: 'Lead',        color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)'  },
  appointment_booked: { label: 'Cita',         color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  order_taken:        { label: 'Pedido',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  transferred:        { label: 'Transferido',  color: '#a855f7', bg: 'rgba(168,85,247,0.1)'  },
  info_provided:      { label: 'Información',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  escalated_whatsapp: { label: 'Escalada',     color: '#16a34a', bg: 'rgba(22,163,74,0.1)'   },
  missed:             { label: 'Perdida',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  other:              { label: 'Otro',         color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
};

const RECORDING_TTL_DAYS = 7;

interface Call {
  id:               string;
  caller_number:    string;
  outcome:          string;
  duration_seconds: number;
  created_at:       string;
  summary?:         string;
  transcript?:      string;
  recording_url?:   string;
  self_eval_score?: number;
  self_eval_notes?: string;
}

type ModalTab = 'resumen' | 'audio' | 'transcripcion';

function timeAgo(isoDate: string): string {
  const diffMins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (diffMins < 1)    return 'Ahora';
  if (diffMins < 60)   return `Hace ${diffMins} min`;
  if (diffMins < 1440) return `Hace ${Math.floor(diffMins / 60)}h`;
  return new Date(isoDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function fmtDuration(secs: number): string {
  if (!secs) return '0:00';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function RecordingPlayer({ url, createdAt }: { url: string; createdAt: string }) {
  const [downloading, setDownloading] = useState(false);

  const expiresAt    = new Date(new Date(createdAt).getTime() + RECORDING_TTL_DAYS * 86400000);
  const expired      = Date.now() > expiresAt.getTime();
  const daysLeft     = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
  const expiresLabel = expiresAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  if (expired) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', fontSize: 12 }}>
        <Clock size={13} /> Grabación expirada
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
    } catch { window.open(url, '_blank'); }
    finally  { setDownloading(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          color: daysLeft <= 2 ? '#f59e0b' : 'var(--c-text-3)' }}>
          <Clock size={10} /> Disponible hasta {expiresLabel}
        </span>
        <button onClick={handleDownload} disabled={downloading}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)',
            fontSize: 11, fontWeight: 600, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
          <Download size={11} /> {downloading ? 'Descargando…' : 'Descargar'}
        </button>
      </div>
      <audio controls src={url} style={{ width: '100%', height: 36, accentColor: '#6C3BFF' }} />
    </div>
  );
}

export default function CallCard({ call, isPro, clientName, agentName, token }: {
  call:       Call;
  isPro?:     boolean;
  clientName?: string;
  agentName?: string;
  token?:     string;
}) {
  const [open,     setOpen]     = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>('resumen');

  const outcome     = OUTCOME_LABELS[call.outcome] ?? OUTCOME_LABELS.other;
  const showRec     = !!(isPro && call.recording_url);
  const hasDetails  = !!(call.summary || call.transcript || showRec);
  const displayName = clientName || call.caller_number || 'Número desconocido';

  const MODAL_TABS: { id: ModalTab; label: string; show: boolean }[] = [
    { id: 'resumen',       label: 'Resumen',       show: !!(call.summary || call.self_eval_score || call.self_eval_notes) },
    { id: 'audio',         label: 'Audio',         show: showRec },
    { id: 'transcripcion', label: 'Transcripción', show: !!call.transcript },
  ];
  const visibleTabs  = MODAL_TABS.filter(t => t.show);
  const effectiveTab = visibleTabs.find(t => t.id === modalTab) ? modalTab : (visibleTabs[0]?.id ?? 'resumen');

  const formattedDateLong = new Date(call.created_at).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      {/* Compact card */}
      <div
        className={`rounded-xl overflow-hidden transition-opacity ${hasDetails ? 'cursor-pointer hover:opacity-80' : ''}`}
        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
        onClick={() => hasDetails && setOpen(true)}
      >
        <div style={{ height: 2, background: outcome.color, opacity: 0.65 }} />

        <div className="px-4 py-3 flex flex-col gap-1.5">
          {/* Row 1: phone icon + caller name + outcome pill + time ago */}
          <div className="flex items-center gap-2">
            <Phone size={12} style={{ color: outcome.color, flexShrink: 0 }} />
            <span className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--c-text)' }}>
              {displayName}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{ background: outcome.bg, color: outcome.color }}>
              {outcome.label}
            </span>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>
              {timeAgo(call.created_at)}
            </span>
          </div>

          {/* Row 2: agent chip + duration */}
          <div className="flex items-center gap-2">
            {agentName && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.15)' }}>
                <User size={10} /> {agentName}
              </span>
            )}
            <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
              {fmtDuration(call.duration_seconds ?? 0)}
            </span>
          </div>

          {/* Row 3: summary single line + expand hint */}
          {call.summary && (
            <div className="flex items-center gap-1.5">
              <p className="text-xs leading-snug flex-1 line-clamp-1" style={{ color: 'var(--c-text-3)' }}>
                {call.summary}
              </p>
              {hasDetails && <ChevronDown size={11} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal with tabs */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)' }}>

            {/* Modal header */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{displayName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: outcome.bg, color: outcome.color }}>{outcome.label}</span>
                    {agentName && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF' }}>
                        <User size={10} /> {agentName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                    {fmtDuration(call.duration_seconds ?? 0)} · {formattedDateLong}
                  </p>
                </div>
                <button onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0"
                  style={{ color: 'var(--c-text-2)' }}>
                  <X size={16} />
                </button>
              </div>

              {visibleTabs.length > 1 && (
                <div className="flex gap-1 mt-3">
                  {visibleTabs.map(t => (
                    <button key={t.id} onClick={() => setModalTab(t.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: effectiveTab === t.id ? 'rgba(108,59,255,0.12)' : 'transparent',
                        color:      effectiveTab === t.id ? '#9B6DFF' : 'var(--c-text-3)',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal body */}
            <div className="p-5 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>

              {effectiveTab === 'resumen' && (
                <>
                  {call.summary && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{call.summary}</p>
                  )}
                  {(call.self_eval_score || call.self_eval_notes) && (
                    <div className="rounded-xl p-3 flex flex-col gap-2"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>
                        Auto-evaluación
                      </p>
                      {call.self_eval_score && (
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map(n => {
                            const filled = n <= call.self_eval_score!;
                            const color  = call.self_eval_score! >= 4 ? '#22c55e'
                              : call.self_eval_score! === 3 ? '#f59e0b' : '#ef4444';
                            return <Star key={n} size={13} fill={filled ? color : 'none'} color={filled ? color : 'var(--c-border)'} />;
                          })}
                          <span className="text-xs font-medium ml-1" style={{
                            color: call.self_eval_score >= 4 ? '#22c55e' : call.self_eval_score === 3 ? '#f59e0b' : '#ef4444',
                          }}>{call.self_eval_score}/5</span>
                        </div>
                      )}
                      {call.self_eval_notes && (
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{call.self_eval_notes}</p>
                      )}
                    </div>
                  )}
                  {token && ['lead_created', 'info_provided'].includes(call.outcome) && (
                    <a href={`/api/portal/${token}/pdf/cotizacion/${call.id}`}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 self-start"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
                      <FileText size={12} /> Cotización PDF
                    </a>
                  )}
                </>
              )}

              {effectiveTab === 'audio' && showRec && token && (
                <RecordingPlayer url={`/api/portal/${token}/recording/${call.id}`} createdAt={call.created_at} />
              )}

              {effectiveTab === 'transcripcion' && call.transcript && (
                <TranscriptView transcript={call.transcript} agentName={agentName} maxHeight={220} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
