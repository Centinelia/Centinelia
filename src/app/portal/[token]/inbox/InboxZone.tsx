'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface InboxZoneProps {
  title:        string;
  count:        number;
  tone?:        'attention' | 'neutral';
  defaultOpen?: boolean;
  children:     React.ReactNode;
}

/**
 * Contenedor visual para agrupar rows del inbox por prioridad.
 * - `attention`: rojo suave, siempre expandido, header con AlertTriangle
 * - `neutral`: gris, collapsable si count > 10, header con CheckCircle
 */
export default function InboxZone({
  title,
  count,
  tone       = 'neutral',
  defaultOpen = true,
  children,
}: InboxZoneProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isAttention     = tone === 'attention';
  const collapsible     = count > 10 && !isAttention;

  const accent    = isAttention ? '#B91C1C' : '#9B8FB5';
  const accentBg  = isAttention ? 'rgba(239,68,68,0.05)'  : '#FAFAFB';
  const accentBd  = isAttention ? 'rgba(239,68,68,0.22)'  : '#E8E3F5';
  const Icon      = isAttention ? AlertTriangle : CheckCircle2;

  return (
    <section
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: `1px solid ${accentBd}`,
        boxShadow: isAttention ? '0 4px 20px rgba(239,68,68,0.06)' : '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header — hero de la zona */}
      <button
        type="button"
        onClick={() => collapsible && setOpen(v => !v)}
        className="flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
        style={{
          background: accentBg,
          border: 'none',
          cursor: collapsible ? 'pointer' : 'default',
          borderBottom: `1px solid ${accentBd}`,
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: isAttention ? 'rgba(239,68,68,0.12)' : '#F0EDF9', border: `1px solid ${isAttention ? 'rgba(239,68,68,0.25)' : '#E8E3F5'}` }}
        >
          <Icon size={14} style={{ color: accent }} strokeWidth={2.25} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] font-bold tracking-tight"
            style={{ color: isAttention ? '#B91C1C' : '#1A0A3B' }}
          >
            {title}
          </p>
        </div>
        <span
          className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full"
          style={{
            background: isAttention ? 'rgba(239,68,68,0.10)' : '#ffffff',
            color:      accent,
            border:     `1px solid ${isAttention ? 'rgba(239,68,68,0.22)' : '#E8E3F5'}`,
          }}
        >
          {count}
        </span>
        {collapsible && (
          <span style={{ color: accent, opacity: 0.7 }}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </button>

      {/* Rows */}
      {open && count > 0 && (
        <div className="flex flex-col gap-2 p-2">
          {children}
        </div>
      )}
    </section>
  );
}
