'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function AccountSerialBadge({ serial, variant = 'header', onDark = false }: {
  serial: string;
  variant?: 'header' | 'card';
  onDark?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(serial);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (variant === 'header') {
    return (
      <button
        onClick={copy}
        title="Copiar número de cuenta"
        className="flex shrink-0 whitespace-nowrap items-center gap-1.5 px-2 py-1 rounded-lg transition-all hover:opacity-80"
        style={{
          background: onDark ? 'rgba(255,255,255,0.08)' : 'rgba(108,59,255,0.08)',
          border:     onDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(108,59,255,0.2)',
          color:      onDark ? 'rgba(255,255,255,0.85)' : '#6B6480',
          fontSize:   11,
          fontWeight: 600,
          fontFamily: 'monospace',
          letterSpacing: '0.04em',
          cursor:     'pointer',
        }}
      >
        {copied ? <Check size={10} style={{ color: '#22c55e' }} /> : <Copy size={10} />}
        {serial}
      </button>
    );
  }

  return (
    <div className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid #F0EDF9', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: '#6B6480' }}>
        Número de cuenta
      </h2>
      <p className="text-xs mb-3" style={{ color: '#9B8FB5' }}>
        Comparte este código cuando contactes a soporte técnico. Te ayuda a identificarte en segundos.
      </p>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold tracking-widest" style={{ color: '#1A0A3B', fontFamily: 'monospace' }}>
          {serial}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
          style={{
            background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(108,59,255,0.1)',
            border:     copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(108,59,255,0.25)',
            color:      copied ? '#22c55e' : '#9B6DFF',
            cursor:     'pointer',
          }}
        >
          {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
        </button>
      </div>
    </div>
  );
}
