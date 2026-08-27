'use client';

import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Phone } from 'lucide-react';

// Ladas más comunes en MX. Si el cliente quiere otra la teclea a mano.
const PRESET_LADAS: { code: string; label: string }[] = [
  { code: '81',  label: 'MTY'   },
  { code: '55',  label: 'CDMX'  },
  { code: '33',  label: 'GDL'   },
  { code: '442', label: 'QRO'   },
  { code: '222', label: 'PUE'   },
  { code: '664', label: 'TJ'    },
];

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; count: number }
  | { state: 'unavailable' }
  | { state: 'error' };

export default function LadaPicker({
  token,
  value,
  onChange,
}: {
  token:    string;
  value:    string;                          // '' o "81" etc
  onChange: (areaCode: string) => void;
}) {
  const [avail, setAvail] = useState<Availability>({ state: 'idle' });

  // Debounced availability check. Sin lada elegida no consultamos (Twilio
  // elige cualquier número MX disponible en el provisioning).
  useEffect(() => {
    if (!/^\d{2,3}$/.test(value)) {
      setAvail({ state: 'idle' });
      return;
    }
    setAvail({ state: 'checking' });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/portal/${token}/lada-availability?areaCode=${value}`, { signal: ctrl.signal });
        const data = await res.json() as { available?: boolean; count?: number };
        if (!res.ok) { setAvail({ state: 'error' }); return; }
        setAvail(data.available ? { state: 'available', count: data.count ?? 0 } : { state: 'unavailable' });
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') setAvail({ state: 'error' });
      }
    }, 350);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [value, token]);

  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    onChange(digits);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#1A0A3B' }}>
        <Phone size={11} style={{ color: '#6C3BFF' }} />
        Lada del teléfono (opcional)
      </label>
      <p className="text-[10px] leading-snug -mt-1" style={{ color: '#9B8FB5' }}>
        Elige tu ciudad si prefieres un número local. Si no está disponible te asignamos otro.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {PRESET_LADAS.map(l => {
          const active = value === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => onChange(active ? '' : l.code)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: active ? 'rgba(108,59,255,0.12)' : '#FAFAFB',
                color:      active ? '#6C3BFF' : '#6B6480',
                border:     `1px solid ${active ? 'rgba(108,59,255,0.4)' : '#E8E3F5'}`,
                cursor:     'pointer',
              }}
            >
              {l.label} · {l.code}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => handleInput(e.target.value)}
          placeholder="Otra lada (ej. 614)"
          maxLength={3}
          className="px-3 py-2 rounded-lg text-sm w-32"
          style={{
            background: '#FAFAFB',
            border:     '1px solid #E8E3F5',
            color:      '#1A0A3B',
            outline:    'none',
          }}
        />
        <AvailabilityBadge avail={avail} />
      </div>
    </div>
  );
}

function AvailabilityBadge({ avail }: { avail: Availability }) {
  if (avail.state === 'idle')     return null;
  if (avail.state === 'checking') return (
    <span className="text-[10px]" style={{ color: '#9B8FB5' }}>Consultando…</span>
  );
  if (avail.state === 'available') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#16a34a' }}>
      <Check size={10} /> Disponible
    </span>
  );
  if (avail.state === 'unavailable') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#d97706' }}>
      <AlertTriangle size={10} /> Sin stock hoy, te asignamos otra
    </span>
  );
  return (
    <span className="text-[10px]" style={{ color: '#9B8FB5' }}>No se pudo consultar</span>
  );
}
