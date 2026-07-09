'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface Section { id: string; label: string }

export default function MobileSideNav({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position:      'fixed',
        top:           0,
        left:          open ? 0 : -200,
        height:        '100dvh',
        width:         200,
        zIndex:        50,
        transition:    'left 0.25s ease',
        pointerEvents: 'auto',
      }}
    >
      {/* Panel */}
      <div
        style={{
          height:         '100%',
          background:     '#FFFFFF',
          borderRight:    '1px solid rgba(108,59,255,0.12)',
          boxShadow:      open ? '4px 0 24px rgba(26,10,59,0.10)' : 'none',
          display:        'flex',
          flexDirection:  'column',
          justifyContent: 'center',
          padding:        '0 0 0 20px',
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 700, color: '#9B6DFF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
          Secciones
        </p>
        {sections.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setOpen(false)}
            style={{
              display:        'block',
              fontSize:       14,
              fontWeight:     500,
              color:          'rgba(26,10,59,0.7)',
              textDecoration: 'none',
              padding:        '10px 0',
              borderBottom:   '1px solid rgba(108,59,255,0.07)',
            }}
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* Tab — media luna */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        style={{
          position:       'absolute',
          top:            '50%',
          right:          -36,
          transform:      'translateY(-50%)',
          width:          36,
          height:         72,
          background:     '#6C3BFF',
          border:         'none',
          borderRadius:   '0 50px 50px 0',
          boxShadow:      '3px 0 12px rgba(108,59,255,0.35)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          cursor:         'pointer',
          padding:        0,
        }}
      >
        {open
          ? <ChevronLeft  size={16} color="#FFFFFF" />
          : <ChevronRight size={16} color="#FFFFFF" />
        }
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, left: 200, zIndex: -1 }}
        />
      )}
    </div>
  );
}
