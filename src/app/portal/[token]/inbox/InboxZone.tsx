'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface InboxZoneProps {
  title:        string;
  count:        number;
  tone?:        'attention' | 'neutral';
  defaultOpen?: boolean;
  children:     React.ReactNode;
}

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

  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-2"
      style={{
        background: isAttention ? 'rgba(239,68,68,0.04)' : 'transparent',
        border:     isAttention ? '1px solid rgba(239,68,68,0.15)' : 'none',
      }}
    >
      <button
        type="button"
        onClick={() => collapsible && setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1 text-left"
        style={{
          background: 'transparent',
          border:     'none',
          cursor:     collapsible ? 'pointer' : 'default',
        }}
      >
        {collapsible && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: isAttention ? '#B91C1C' : 'var(--c-text-4)' }}
        >
          {title}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            background: isAttention ? 'rgba(239,68,68,0.12)' : 'var(--c-surface-2)',
            color:      isAttention ? '#B91C1C'              : 'var(--c-text-3)',
          }}
        >
          {count}
        </span>
      </button>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}
