'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';

const PRICE_PER_MIN = 12;

const PACKAGES = [
  { minutes: 100, label: '100 min', price: 1200 },
  { minutes: 200, label: '200 min', price: 2400 },
];

function calcPrice(minutes: number): number {
  const pkg = PACKAGES.find(p => p.minutes === minutes);
  return pkg ? pkg.price : minutes * PRICE_PER_MIN;
}

export default function BuyMinutesSection({ token }: { token: string }) {
  const [selected, setSelected]   = useState<number | 'custom' | null>(null);
  const [custom, setCustom]       = useState('');
  const [loading, setLoading]     = useState(false);

  const customMinutes = parseInt(custom) || 0;
  const activeMinutes = selected === 'custom' ? (customMinutes > 0 ? customMinutes : null) : selected;
  const price         = activeMinutes ? calcPrice(activeMinutes) : null;
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

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {PACKAGES.map(pkg => {
          const active = selected === pkg.minutes;
          return (
            <button
              key={pkg.minutes}
              onClick={() => setSelected(pkg.minutes)}
              className="flex flex-col items-center py-2.5 px-1 rounded-lg text-center transition-all"
              style={{
                background: active ? 'rgba(108,59,255,0.12)' : 'var(--c-surface-2)',
                border:     `1px solid ${active ? 'rgba(108,59,255,0.4)' : 'var(--c-border)'}`,
                color:      active ? '#6C3BFF' : 'var(--c-text-2)',
              }}
            >
              <span className="text-sm font-bold">{pkg.label}</span>
              <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>${pkg.price.toLocaleString('es-MX')} MXN</span>
            </button>
          );
        })}

        {/* Custom option */}
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
          <span className="text-xs mt-0.5" style={{ opacity: 0.7 }}>${PRICE_PER_MIN}/min</span>
        </button>
      </div>

      {selected === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={10}
            max={5000}
            placeholder="Ej. 350"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{
              background:  'var(--c-surface-2)',
              border:      '1px solid var(--c-border)',
              color:       'var(--c-text)',
              outline:     'none',
            }}
          />
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--c-text-3)' }}>min</span>
          {price !== null && (
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#6C3BFF' }}>
              ${price.toLocaleString('es-MX')}
            </span>
          )}
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
          : price
            ? `Comprar, $${price.toLocaleString('es-MX')} MXN`
            : 'Comprar minutos'}
      </button>
    </div>
  );
}
