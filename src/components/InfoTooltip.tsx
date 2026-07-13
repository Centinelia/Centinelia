'use client';

import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Más información"
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          background: 'none',
          border:     'none',
          padding:    '0 2px',
          cursor:     'pointer',
          color:      open ? 'var(--c-text-2)' : 'var(--c-text-4)',
          transition: 'color 0.15s',
          lineHeight: 1,
        }}
      >
        <Info size={11} />
      </button>

      {open && (
        <div
          style={{
            position:     'absolute',
            top:          'calc(100% + 6px)',
            left:         0,
            zIndex:       60,
            width:        'max(240px, 20vw)',
            maxWidth:     320,
            background:   'var(--c-modal)',
            border:       '1px solid var(--c-border)',
            borderRadius: 10,
            padding:      '10px 12px',
            boxShadow:    '0 8px 24px rgba(0,0,0,0.2)',
            color:        'var(--c-text-2)',
            fontSize:     12,
            lineHeight:   1.65,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
