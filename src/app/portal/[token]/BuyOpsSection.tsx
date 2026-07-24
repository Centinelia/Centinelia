'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';

const PRICE_PER_OP = 8.5;
const IVA = 0.16;

const PACKAGES = [
  { ops: 100, label: '100 tareas', price: 800 },
  { ops: 300, label: '300 tareas', price: 2100 },
];

function calcBase(ops: number): number {
  const pkg = PACKAGES.find(p => p.ops === ops);
  return pkg ? pkg.price : Math.round(ops * PRICE_PER_OP);
}

function withIva(n: number): number { return Math.round(n * (1 + IVA)); }

export default function BuyOpsSection({ token }: { token: string }) {
  const [selected, setSelected] = useState<number | 'custom' | null>(null);
  const [custom, setCustom]     = useState('');
  const [loading, setLoading]   = useState(false);

  const customOps = parseInt(custom) || 0;
  const activeOps = selected === 'custom' ? (customOps > 0 ? customOps : null) : selected;
  const base      = activeOps ? calcBase(activeOps) : null;
  const total     = base ? withIva(base) : null;
  const iva       = base ? total! - base : null;
  const ready     = activeOps !== null && activeOps >= 10;

  const handleBuy = async () => {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/portal/buy-ops', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, ops: activeOps }),
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => `$${n.toLocaleString('es-MX')}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {PACKAGES.map(pkg => {
          const active = selected === pkg.ops;
          return (
            <button
              key={pkg.ops}
              onClick={() => setSelected(pkg.ops)}
              className="flex flex-col items-center py-2.5 px-1 rounded-lg text-center transition-all"
              style={{
                background: active ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                border:     `1px solid ${active ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                color:      active ? '#6C3BFF' : 'var(--c-text-2)',
              }}
            >
              <span className="text-sm font-bold">{pkg.label}</span>
              <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>{fmt(pkg.price)} + IVA</span>
            </button>
          );
        })}

        <button
          onClick={() => setSelected('custom')}
          className="flex flex-col items-center py-2.5 px-1 rounded-lg text-center transition-all"
          style={{
            background: selected === 'custom' ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
            border:     `1px solid ${selected === 'custom' ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
            color:      selected === 'custom' ? '#6C3BFF' : 'var(--c-text-2)',
          }}
        >
          <span className="text-sm font-bold">Personalizado</span>
          <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>${PRICE_PER_OP}/tarea + IVA</span>
        </button>
      </div>

      {selected === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={10}
            max={5000}
            placeholder="Ej. 200"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--c-surface-2)',
              border:     '1px solid var(--c-border)',
              color:      'var(--c-text)',
              outline:    'none',
            }}
          />
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--c-text-3)' }}>tareas</span>
          {base !== null && (
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#6C3BFF' }}>
              {fmt(base)} + IVA
            </span>
          )}
        </div>
      )}

      {/* IVA breakdown */}
      {base !== null && total !== null && (
        <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{fmt(base)} MXN</span>
          </div>
          <div className="flex justify-between">
            <span>IVA (16%)</span>
            <span>{fmt(iva!)} MXN</span>
          </div>
          <div className="flex justify-between font-semibold pt-0.5" style={{ borderTop: '1px solid var(--c-border)', marginTop: '2px', color: 'var(--c-text-1)' }}>
            <span>Total</span>
            <span>{fmt(total)} MXN</span>
          </div>
        </div>
      )}

      <button
        onClick={handleBuy}
        disabled={!ready || loading}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
        style={{
          background: ready ? '#6C3BFF' : 'var(--c-surface-2)',
          color:      ready ? '#fff' : 'var(--c-text-3)',
          cursor:     ready ? 'pointer' : 'not-allowed',
          opacity:    loading ? 0.6 : 1,
        }}
      >
        <Zap size={14} />
        {loading
          ? 'Redirigiendo…'
          : total
            ? `Comprar, ${fmt(total)} MXN`
            : 'Comprar tareas'}
      </button>
    </div>
  );
}
