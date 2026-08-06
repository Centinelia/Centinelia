'use client';

/**
 * OficinaBusinessChip — variante dark del BusinessSwitcher para el header
 * de Oficina. Muestra logo (o inicial) + nombre truncado + chevron si el
 * owner tiene más de una organización. Se estiliza para contrastar sobre
 * el fondo #1A0A3B del header dark.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';

type BizOption = { business_name: string; logo_url: string | null; first_token: string };

function BizAvatarDark({ name, logo_url, size = 46 }: { name: string; logo_url: string | null; size?: number }) {
  // Con logo: <img> directo, mismo tratamiento que el Centinelia icon (sin
  // background ni border). Sin logo: fallback círculo con inicial que sí
  // necesita container para que se vea el placeholder.
  if (logo_url) {
    return (
      <img
        src={logo_url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{
        width:      size,
        height:     size,
        background: 'rgba(255,255,255,0.06)',
        border:     '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
        {name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

interface Props {
  current:             BizOption;
  options:             BizOption[];
  currentBusinessName: string;
}

export default function OficinaBusinessChip({ current, options, currentBusinessName }: Props) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const router          = useRouter();
  const isMulti         = options.length > 1;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', escape); };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => isMulti && setOpen(v => !v)}
        className="flex items-center gap-2.5 min-w-0 rounded-lg pl-1 pr-2 py-1 transition-colors"
        style={{ cursor: isMulti ? 'pointer' : 'default' }}
        onMouseEnter={e => { if (isMulti) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <BizAvatarDark name={current.business_name} logo_url={current.logo_url} size={32} />
        <span
          className="font-semibold text-[14px] truncate max-w-[160px] sm:max-w-[220px]"
          style={{ color: '#fff' }}
        >
          {current.business_name}
        </span>
        {isMulti && (
          <ChevronDown
            size={13}
            className="flex-shrink-0 transition-transform"
            style={{ color: 'rgba(255,255,255,0.55)', transform: open ? 'rotate(180deg)' : undefined }}
          />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-2 w-64 rounded-xl shadow-xl z-50 overflow-hidden py-1"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <p className="px-4 pt-2 pb-1 text-xs font-semibold tracking-widest uppercase"
            style={{ color: 'var(--c-text-4)' }}>
            Mis organizaciones
          </p>
          {options.map(opt => {
            const isCurrent = opt.business_name === currentBusinessName;
            return (
              <button
                key={opt.business_name}
                onClick={() => { router.push(`/portal/${opt.first_token}/oficina`); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--c-surface-2)]"
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                  {opt.logo_url
                    ? <img src={opt.logo_url} alt={opt.business_name} className="w-full h-full object-contain p-0.5" />
                    : <span className="text-[10px] font-bold" style={{ color: 'var(--c-text-3)' }}>{opt.business_name.slice(0, 2).toUpperCase()}</span>
                  }
                </div>
                <span className="text-sm truncate flex-1"
                  style={{ color: isCurrent ? '#6C3BFF' : 'var(--c-text)', fontWeight: isCurrent ? 600 : 400 }}>
                  {opt.business_name}
                </span>
                {isCurrent && <Check size={13} style={{ color: '#6C3BFF', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
