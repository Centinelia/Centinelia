'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect    = btnRef.current.getBoundingClientRect();
    const width   = Math.min(320, Math.max(240, window.innerWidth * 0.2));
    const left    = Math.min(rect.left, window.innerWidth - width - 12);
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onDown   = (e: MouseEvent) => { if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false); };
    const onScroll = () => updatePos();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePos);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-label="Más información"
        style={{
          display: 'inline-flex', alignItems: 'center', background: 'none',
          border: 'none', padding: '0 2px', cursor: 'pointer',
          color: open ? 'var(--c-text-2)' : 'var(--c-text-4)',
          transition: 'color 0.15s', lineHeight: 1,
        }}
      >
        <Info size={11} />
      </button>

      {open && createPortal(
        <div
          style={{
            position:     'fixed',
            top:          pos.top,
            left:         pos.left,
            zIndex:       9999,
            width:        'max(240px, 20vw)',
            maxWidth:     320,
            background:   'var(--c-modal)',
            border:       '1px solid var(--c-border)',
            borderRadius: 10,
            padding:      '10px 12px',
            boxShadow:    '0 8px 24px rgba(0,0,0,0.25)',
            color:        'var(--c-text-2)',
            fontSize:     12,
            lineHeight:   1.65,
            whiteSpace:   'pre-line',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </div>
  );
}
