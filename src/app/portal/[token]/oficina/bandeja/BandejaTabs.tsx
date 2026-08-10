'use client';

import { useState, type ReactNode } from 'react';
import { Inbox, Send } from 'lucide-react';

export default function BandejaTabs({ recibidos, enviados }: { recibidos: ReactNode; enviados: ReactNode }) {
  const [tab, setTab] = useState<'recibidos' | 'enviados'>('recibidos');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 border-b" style={{ borderColor: '#E8E3F5' }}>
        <button
          onClick={() => setTab('recibidos')}
          className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
          style={{
            color:        tab === 'recibidos' ? '#1A0A3B' : '#9B8FB5',
            borderBottom: tab === 'recibidos' ? '2px solid #6C3BFF' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          <Inbox size={14} strokeWidth={2.25} />
          Recibidos
        </button>
        <button
          onClick={() => setTab('enviados')}
          className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
          style={{
            color:        tab === 'enviados' ? '#1A0A3B' : '#9B8FB5',
            borderBottom: tab === 'enviados' ? '2px solid #6C3BFF' : '2px solid transparent',
            marginBottom: '-1px',
          }}
        >
          <Send size={14} strokeWidth={2.25} />
          Enviados
        </button>
      </div>
      <div>{tab === 'recibidos' ? recibidos : enviados}</div>
    </div>
  );
}
