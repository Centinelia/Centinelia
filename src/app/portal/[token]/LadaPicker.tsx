'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, AlertTriangle, ChevronDown, Phone } from 'lucide-react';
import { CITIES_BY_COUNTRY, type CityLada } from '@/lib/portal/ladas';

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; count: number }
  | { state: 'unavailable' }
  | { state: 'error' };

// Portal versión light-theme del CitySelect del registro. Comparte la lista
// curada CITIES_BY_COUNTRY (ver [[shared-ladas-catalog]]) y ejecuta el mismo
// availability check contra /api/portal/[token]/lada-availability.
export default function LadaPicker({
  token,
  value,
  onChange,
  disabled = false,
}: {
  token:     string;
  value:     string;
  onChange:  (areaCode: string) => void;
  disabled?: boolean;
}) {
  const [open,   setOpen]   = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query,  setQuery]  = useState('');
  const [avail,  setAvail]  = useState<Availability>({ state: 'idle' });
  const ref      = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cities   = CITIES_BY_COUNTRY.mx;
  const selected = cities.find((c: CityLada) => c.lada === value) ?? null;

  const filtered: CityLada[] = query.trim()
    ? cities.filter((c: CityLada) =>
        c.lada.includes(query.trim()) ||
        c.label.toLowerCase().includes(query.trim().toLowerCase())
      )
    : cities;

  // Disparar consulta de stock cuando cambia la lada elegida. Debounce corto
  // para no pegarle a Twilio a cada re-render.
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
    }, 300);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [value, token]);

  // Click-outside + auto-focus del buscador.
  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleToggle() {
    if (disabled) return;
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenUp(rect.bottom + 280 > window.innerHeight);
    }
    setOpen(o => !o);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: disabled ? '#B5AEC7' : '#1A0A3B' }}>
        <Phone size={11} style={{ color: disabled ? '#B5AEC7' : '#6C3BFF' }} />
        Lada del teléfono
        <span className="font-normal" style={{ color: '#9B8FB5' }}>(opcional)</span>
      </label>
      <p className="text-[10px] leading-snug -mt-1" style={{ color: '#9B8FB5' }}>
        {disabled
          ? 'Este empleado no tendrá canal de voz. Elige una jornada con voz para asignarle un número.'
          : 'Elige tu ciudad para asignar un número local. Si no hay stock ese día te asignamos otra automáticamente.'}
      </p>

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className="flex items-center justify-between gap-2 w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
          style={{
            background: disabled ? '#F4F1FA' : '#FAFAFB',
            border:     `1px solid ${open ? 'rgba(108,59,255,0.45)' : '#E8E3F5'}`,
            color:      selected ? '#1A0A3B' : '#9B8FB5',
            cursor:     disabled ? 'not-allowed' : 'pointer',
            opacity:    disabled ? 0.65 : 1,
            outline:    'none',
          }}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="font-bold" style={{ color: '#6C3BFF', letterSpacing: '0.02em' }}>{selected.lada}</span>
              <span style={{ color: '#E8E3F5', fontSize: 11 }}>·</span>
              <span>{selected.label}</span>
            </span>
          ) : (
            <span>Selecciona una ciudad…</span>
          )}
          <ChevronDown size={14} style={{ flexShrink: 0, color: '#9B8FB5', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>

        {open && !disabled && (
          <div
            style={{
              position: 'absolute',
              ...(openUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }),
              left:      0,
              right:     0,
              background:'#ffffff',
              border:    '1px solid #E8E3F5',
              borderRadius: 12,
              zIndex:    100,
              boxShadow: '0 8px 24px rgba(26,10,59,0.12)',
              display:   'flex',
              flexDirection: 'column',
              overflow:  'hidden',
            }}
          >
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1EDF9', flexShrink: 0 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter' && filtered.length === 1) {
                    onChange(filtered[0].lada);
                    setOpen(false);
                  }
                }}
                placeholder="Busca por lada o ciudad…"
                style={{
                  width:  '100%',
                  background: '#FAFAFB',
                  border: '1px solid #E8E3F5',
                  borderRadius: 8,
                  padding: '7px 11px',
                  fontSize: 13,
                  color: '#1A0A3B',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <p style={{ padding: '12px 14px', fontSize: 12, color: '#9B8FB5' }}>Sin resultados</p>
              ) : filtered.map((c: CityLada) => (
                <button
                  key={c.lada}
                  type="button"
                  onClick={() => { onChange(c.lada); setOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '9px 14px',
                    fontSize: 13,
                    color: c.lada === value ? '#6C3BFF' : '#1A0A3B',
                    background: c.lada === value ? 'rgba(108,59,255,0.08)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, minWidth: 32, color: c.lada === value ? '#6C3BFF' : '#9B6DFF' }}>{c.lada}</span>
                  <span style={{ color: c.lada === value ? '#6C3BFF' : '#6B6480', fontSize: 12 }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!disabled && <AvailabilityBadge avail={avail} />}
    </div>
  );
}

function AvailabilityBadge({ avail }: { avail: Availability }) {
  if (avail.state === 'idle')     return null;
  if (avail.state === 'checking') return (
    <span className="text-[10px]" style={{ color: '#9B8FB5' }}>Consultando disponibilidad…</span>
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
