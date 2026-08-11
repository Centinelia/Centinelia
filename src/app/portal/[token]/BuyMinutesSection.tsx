'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { MINUTES_RATE_EXTRA } from '@/lib/billing/plans';

const PRICE_PER_MIN = MINUTES_RATE_EXTRA;
const IVA = 0.16;

const PACKAGES = [
  { minutes: 100, label: '100 min', price: 1200 },
  { minutes: 200, label: '200 min', price: 2400 },
];

function calcBase(minutes: number): number {
  const pkg = PACKAGES.find(p => p.minutes === minutes);
  return pkg ? pkg.price : minutes * PRICE_PER_MIN;
}

function withIva(n: number): number { return Math.round(n * (1 + IVA)); }

export default function BuyMinutesSection({ token }: { token: string }) {
  const [selected, setSelected]   = useState<number | 'custom' | null>(null);
  const [custom, setCustom]       = useState('');
  const [loading, setLoading]     = useState(false);

  const customMinutes = parseInt(custom) || 0;
  const activeMinutes = selected === 'custom' ? (customMinutes > 0 ? customMinutes : null) : selected;
  const base          = activeMinutes ? calcBase(activeMinutes) : null;
  const total         = base ? withIva(base) : null;
  const iva           = base ? total! - base : null;
  const ready         = activeMinutes !== null && activeMinutes >= 10;

  const handleBuy = async () => {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/portal/buy-minutes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, minutes: activeMinutes }),
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
    <div className="flex flex-col gap-4">
      {/* Package tier cards — hero price + label */}
      <div className="grid grid-cols-3 gap-2">
        {PACKAGES.map(pkg => {
          const active = selected === pkg.minutes;
          return (
            <button
              key={pkg.minutes}
              onClick={() => setSelected(pkg.minutes)}
              className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all"
              style={{
                background: active ? 'rgba(108,59,255,0.06)' : '#ffffff',
                border:     `1px solid ${active ? '#6C3BFF' : 'rgba(108,59,255,0.18)'}`,
                boxShadow:  active ? '0 4px 12px rgba(108,59,255,0.12)' : '0 1px 2px rgba(26,10,59,0.04)',
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: active ? '#6C3BFF' : '#9B8FB5' }}>
                Paquete
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#1A0A3B' }}>
                  {pkg.minutes}
                </span>
                <span className="text-[12px]" style={{ color: '#9B8FB5' }}>min</span>
              </div>
              <span className="text-[11px] tabular-nums" style={{ color: '#6B6480' }}>
                {fmt(pkg.price)} + IVA
              </span>
            </button>
          );
        })}

        {/* Custom option */}
        <button
          onClick={() => setSelected('custom')}
          className="flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all"
          style={{
            background: selected === 'custom' ? 'rgba(108,59,255,0.06)' : '#ffffff',
            border:     `1px solid ${selected === 'custom' ? '#6C3BFF' : 'rgba(108,59,255,0.18)'}`,
            boxShadow:  selected === 'custom' ? '0 4px 12px rgba(108,59,255,0.12)' : '0 1px 2px rgba(26,10,59,0.04)',
          }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: selected === 'custom' ? '#6C3BFF' : '#9B8FB5' }}>
            A medida
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-[16px] font-bold leading-none" style={{ color: '#1A0A3B' }}>
              Custom
            </span>
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: '#6B6480' }}>
            ${PRICE_PER_MIN}/min + IVA
          </span>
        </button>
      </div>

      {selected === 'custom' && (
        <div className="flex items-center gap-2 p-3 rounded-lg"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          <input
            type="number"
            min={10}
            max={5000}
            placeholder="Ej. 350"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-[13px] outline-none tabular-nums"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
          <span className="text-[12px] flex-shrink-0 font-medium" style={{ color: '#6B6480' }}>min</span>
          {base !== null && (
            <span className="text-[12px] font-semibold flex-shrink-0 tabular-nums" style={{ color: '#6C3BFF' }}>
              {fmt(base)} + IVA
            </span>
          )}
        </div>
      )}

      {/* IVA breakdown — receipt style */}
      {base !== null && total !== null && (
        <div className="flex flex-col gap-1 px-4 py-3 rounded-xl text-[12px]"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          <div className="flex justify-between" style={{ color: '#6B6480' }}>
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(base)} MXN</span>
          </div>
          <div className="flex justify-between" style={{ color: '#6B6480' }}>
            <span>IVA (16%)</span>
            <span className="tabular-nums">{fmt(iva!)} MXN</span>
          </div>
          <div className="flex justify-between font-bold text-[14px] pt-2 mt-1"
            style={{ borderTop: '1px solid #E8E3F5', color: '#1A0A3B' }}>
            <span>Total</span>
            <span className="tabular-nums">{fmt(total)} MXN</span>
          </div>
        </div>
      )}

      <button
        onClick={handleBuy}
        disabled={!ready || loading}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[14px] font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed"
        style={{
          background: ready ? '#6C3BFF' : '#FAFAFB',
          color:      ready ? '#ffffff' : '#9B8FB5',
          border:     ready ? 'none' : '1px solid #E8E3F5',
          boxShadow:  ready ? '0 4px 12px rgba(108,59,255,0.24)' : 'none',
          opacity:    loading ? 0.6 : 1,
        }}
      >
        <Plus size={14} strokeWidth={2.5} />
        {loading
          ? 'Redirigiendo…'
          : total
            ? `Comprar por ${fmt(total)} MXN`
            : 'Elige un paquete'}
      </button>
    </div>
  );
}
