'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0, caretLeft: 12 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const TOOLTIP_W = 300;

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect        = btnRef.current.getBoundingClientRect();
    const btnCenterX  = rect.left + rect.width / 2;
    const rawLeft     = btnCenterX - TOOLTIP_W / 2;
    const left        = Math.max(8, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - 8));
    const caretLeft   = Math.max(12, Math.min(btnCenterX - left, TOOLTIP_W - 24));
    setPos({ top: rect.bottom + 10, left, caretLeft });
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
          display:         'inline-flex',
          alignItems:      'center',
          justifyContent:  'center',
          width:           16,
          height:          16,
          borderRadius:    '50%',
          background:      open ? 'rgba(108,59,255,0.18)' : 'rgba(108,59,255,0.1)',
          border:          'none',
          padding:         0,
          cursor:          'pointer',
          color:           open ? '#7C4DFF' : '#9B6DFF',
          transition:      'background 0.15s, color 0.15s',
          flexShrink:      0,
        }}
      >
        <Info size={10} strokeWidth={2.5} />
      </button>

      {open && createPortal(
        <div
          style={{
            position:  'fixed',
            top:       pos.top,
            left:      pos.left,
            zIndex:    9999,
            width:     TOOLTIP_W,
            animation: 'infotip-in 0.14s ease',
          }}
        >
          <style>{`
            @keyframes infotip-in {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0);    }
            }
          `}</style>

          {/* Caret */}
          <div style={{
            position:          'absolute',
            top:               -5,
            left:              pos.caretLeft - 5,
            width:             10,
            height:            10,
            background:        'var(--c-modal, #1e1b2e)',
            border:            '1px solid rgba(108,59,255,0.25)',
            borderBottomColor: 'transparent',
            borderRightColor:  'transparent',
            transform:         'rotate(45deg)',
            borderRadius:      2,
          }} />

          {/* Content card */}
          <div style={{
            background:   'var(--c-modal, #1e1b2e)',
            border:       '1px solid rgba(108,59,255,0.22)',
            borderTop:    '2px solid rgba(108,59,255,0.5)',
            borderRadius: '0 0 10px 10px',
            padding:      '11px 14px 12px',
            boxShadow:    '0 16px 40px rgba(0,0,0,0.28), 0 2px 10px rgba(108,59,255,0.12)',
            color:        'var(--c-text-2)',
            fontSize:     12,
            lineHeight:   1.7,
            whiteSpace:   'pre-line',
          }}>
            {text}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
