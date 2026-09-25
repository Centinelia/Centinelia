'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Mic, FileText, ExternalLink, Copy, Check } from 'lucide-react';
import type { VoiceCall } from '@/types/agent';
import TranscriptView from '@/components/TranscriptView';

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  lead_created:       { label: 'Lead',       color: '#22c55e' },
  appointment_booked: { label: 'Cita',        color: '#3b82f6' },
  order_taken:        { label: 'Pedido',      color: '#f59e0b' },
  transferred:        { label: 'Transferido', color: '#a855f7' },
  info_provided:      { label: 'Información', color: '#6B6480' },
  escalated_whatsapp: { label: 'WhatsApp',    color: '#25D366' },
  other:              { label: 'Otro',        color: '#4b5563' },
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.other;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${o.color}22`, color: o.color }}>
      {o.label}
    </span>
  );
}

function CopyTranscriptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copiado' : 'Copiar transcripción'}
      className="p-1 rounded transition-colors hover:bg-[#FAFAFB]"
      style={{ color: copied ? '#22c55e' : '#6B6480' }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function CallRow({ call, timezone, agentName }: { call: VoiceCall; timezone: string; agentName?: string }) {
  const [open, setOpen] = useState(false);
  const hasDetails = call.summary || call.transcript || call.recording_url;

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
      <div
        className={`flex items-center justify-between px-3 py-2.5 ${hasDetails ? 'cursor-pointer select-none' : ''}`}
        onClick={() => hasDetails && setOpen(o => !o)}
      >
        <div>
          <div className="text-sm" style={{ color: '#1A0A3B' }}>{call.caller_number || 'Desconocido'}</div>
          <div className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
            {new Date(call.created_at).toLocaleString('es-MX', { timeZone: timezone ?? 'America/Monterrey' })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {call.recording_url && (
            <span title="Tiene grabación">
              <Mic size={13} style={{ color: '#a855f7' }} />
            </span>
          )}
          {call.transcript && (
            <span title="Tiene transcripción">
              <FileText size={13} style={{ color: '#3b82f6' }} />
            </span>
          )}
          <OutcomeBadge outcome={call.outcome} />
          <span className="text-xs tabular-nums" style={{ color: '#4A3B6B' }}>
            {Math.ceil(call.duration_seconds / 60)} min
          </span>
          {hasDetails && (
            open
              ? <ChevronUp size={14} style={{ color: '#6B6480' }} />
              : <ChevronDown size={14} style={{ color: '#6B6480' }} />
          )}
        </div>
      </div>

      {open && hasDetails && (
        <div className="px-3 pb-3 flex flex-col gap-3" style={{ borderTop: '1px solid #F0EBFA' }}>
          {call.summary && (
            <div className="pt-3">
              <div className="text-xs font-semibold mb-1.5 tracking-widest uppercase" style={{ color: '#6B6480' }}>Resumen</div>
              <p className="text-xs leading-relaxed" style={{ color: '#4A3B6B' }}>{call.summary}</p>
            </div>
          )}

          {call.recording_url && (
            <div>
              <div className="text-xs font-semibold mb-1.5 tracking-widest uppercase" style={{ color: '#6B6480' }}>Grabación</div>
              <div className="flex items-center gap-2">
                <audio
                  controls
                  src={`/api/admin/recording/${call.id}`}
                  className="w-full h-8"
                  style={{ accentColor: '#a855f7' }}
                />
                <a
                  href={`/api/admin/recording/${call.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir en nueva pestaña"
                  className="flex-shrink-0 p-1.5 rounded hover:bg-[#FAFAFB] transition-colors"
                  style={{ color: '#4A3B6B' }}
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}

          {call.transcript && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#6B6480' }}>Transcripción</div>
                <CopyTranscriptButton text={call.transcript} />
              </div>
              <TranscriptView transcript={call.transcript} agentName={agentName} maxHeight={192} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CallsSection({ calls, timezone, agentName }: { calls: VoiceCall[]; timezone: string; agentName?: string }) {
  return (
    <div className="p-5 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: '#6B6480' }}>
        Llamadas recientes ({calls.length})
      </h2>
      {calls.length === 0 ? (
        <p className="text-xs py-6 text-center leading-relaxed" style={{ color: '#9B8FB5' }}>
          Sin llamadas aún — aparecen aquí automáticamente cuando el agente atienda su primera llamada
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {calls.map(call => (
            <CallRow key={call.id} call={call} timezone={timezone} agentName={agentName} />
          ))}
        </div>
      )}
    </div>
  );
}
